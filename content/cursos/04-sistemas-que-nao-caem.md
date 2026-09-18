---
id: sistemas-que-nao-caem
deck: arquitetura-software
fase: 3
ordem: 4
nivel: 5
tags: [resiliencia, distribuidos, arquitetura, system-design, producao]
descricao: Falha parcial é o estado normal. Como desenhar para que uma dependência lenta não vire um apagão — timeout, anteparo, circuit breaker, degradação e o roteiro de 45 minutos de system design.
---

# Sistemas que não caem

Existe uma diferença de categoria entre "o programa está certo" e "o sistema continua servindo". A
primeira é sobre lógica; a segunda é sobre o que acontece quando **uma parte falha e o resto precisa
seguir**. Em sistema distribuído, falha parcial não é exceção: é o estado normal em algum ponto, o tempo
todo. Alguma coisa está sempre lenta, reiniciando, respondendo errado ou caída.

Este curso monta a resposta em camadas. Começa pelo padrão mais simples e mais esquecido — o timeout —,
mostra como uma falha local vira global, e fecha com o roteiro que você usa numa entrevista de system
design para dizer, em voz alta, o que escolheu e o que sacrificou.

:::objetivo Ao terminar este curso você consegue
- explicar por que uma dependência **lenta** é mais perigosa que uma caída, e provar isso com um teste;
- desenhar timeout, anteparo (bulkhead), circuit breaker e fallback como um conjunto, não como truques soltos;
- descrever os cinco passos de uma falha em cascata e dizer onde você quebraria a corrente;
- escolher entre falhar, degradar e descartar carga — e justificar a escolha com o custo de estar errado;
- conduzir 45 minutos de system design com método, declarando o trade-off e o problema novo de cada decisão.
:::

## O que quebra de verdade

### A dependência lenta é pior que a caída

Quando uma dependência **cai**, a chamada falha rápido: a conexão é recusada, o recurso é liberado e o
seu código segue para o caminho de erro. Isso é ruim e é administrável.

Quando ela fica **lenta**, nada falha. As requisições ficam esperando, uma a uma, segurando conexão,
memória e uma vaga no pool. Em poucos segundos o pool esgota — e a partir daí o serviço passa a falhar
em **tudo**, inclusive nas rotas que nunca tocaram naquela dependência.

:::alerta O mecanismo é sempre o recurso compartilhado
O contágio não acontece porque as rotas estão "acopladas" no código. Acontece porque elas dividem um
recurso finito: o pool HTTP, o pool do banco, o event loop, a memória. Encontre o recurso compartilhado
e você encontrou o caminho do contágio.
:::

O primeiro remédio é o [[resiliencia/timeout]] — e ele é o mais esquecido porque os padrões das
bibliotecas conspiram contra: `http.request` no Node espera **para sempre** sem timeout; `fetch` sem
`AbortSignal.timeout()` também.

Timeouts são vários e precisam de valores diferentes: conexão, resposta, total da requisição e, no lado
do servidor, `statement_timeout` no banco. E o valor não se escolhe por estética — sai do p99 medido da
dependência, com folga.

:::atividade
id: quanto-tempo-esperar
titulo: Escolher o timeout a partir do p99
termos: [system-design/percentil, resiliencia/timeout]
nivel: 3
tempoMin: 10
ambiente: papel
entrega:
  tipo: escolha
  rotulo: Uma dependência tem p50 de 40 ms e p99 de 300 ms. Qual timeout você define?
  opcoes:
    - 500 ms (p99 com folga de ~1,7x)
    - 40 ms (o caso comum)
    - 30 s (generoso, para nunca cortar ninguém)
    - Sem timeout, e trato o erro quando aparecer
  correta: 0
criterios:
  - Entendeu que o timeout sai do p99 medido, com folga, e não de um número redondo
---
Você vai integrar com um serviço interno. Mediu durante uma semana: **p50 = 40 ms, p99 = 300 ms**.

Escolha o timeout e, antes de responder, pense no que cada opção causa:

- um valor perto do p50 corta requisições **legítimas** e transforma lentidão normal em erro;
- um valor muito alto deixa a requisição segurar o recurso por tempo demais — e é isso que esgota o pool;
- não ter timeout é o pior dos dois mundos.
---
**500 ms.** A regra prática é p99 × 1,5 a 2: acima do que é normal (para não cortar quem está só na
cauda) e muito abaixo do que segura recurso a ponto de derrubar o serviço.

Três complementos que fazem esse número funcionar de verdade:

1. **O timeout precisa diminuir conforme se sobe na pilha.** Se o seu chamador desiste em 2 s, não faz
   sentido você insistir por 10 s: você está trabalhando para ninguém. É o que a propagação de deadline
   resolve — passar adiante *quanto tempo ainda resta* em vez de cada salto ter seu próprio número fixo.
2. **Timeout não é cancelamento.** `Promise.race` com um timer resolve a *sua* promessa, mas a requisição
   continua aberta do outro lado e o banco continua executando. Cancelar de verdade exige `AbortSignal`,
   `statement_timeout`, `pg_cancel_backend` — algo que de fato interrompa o trabalho.
3. **Revise o valor.** p99 muda com o tempo; um timeout definido há dois anos pode estar cortando tráfego
   normal hoje, e ninguém percebe porque o erro parece "instabilidade da rede".
:::

### Anteparo: separar para que a falha não se espalhe

O nome vem dos compartimentos estanques de um navio: a água entra num deles e o navio continua
flutuando. Em software, o anteparo ([[resiliencia/bulkhead]]) é **recurso separado por dependência**.

Com um pool HTTP único, a API de CEP lenta prende todas as conexões e o checkout para. Com um pool de 5
conexões dedicado ao CEP, quando elas esgotam **só o CEP degrada**.

Formas de anteparo, da mais barata à mais cara: pool por dependência · limite de concorrência por rota
(um semáforo) · fila separada por classe de trabalho · processo ou instância dedicados ao que é crítico.

:::nota O custo é utilização
Reservar capacidade por compartimento significa ter capacidade ociosa em cada um. Por isso não se
compartimenta tudo: escolhe-se pelas dependências que podem falhar de forma independente e pelas rotas
que não podem cair juntas.
:::

### Circuit breaker: parar de bater na porta

O [[resiliencia/circuit-breaker]] é o padrão mais citado e o mais mal configurado. Três estados:
**fechado** (passa tudo, contando resultados), **aberto** (falha imediatamente, sem chamar) e
**meio-aberto** (deixa passar **uma** chamada de teste).

O que quase todo mundo erra:

| Erro | Por que dói |
| --- | --- |
| Abrir por contagem absoluta ("5 falhas") | 5 falhas em 10 s é muito diferente de 5 em 10 min. Use **taxa** com janela |
| Sem volume mínimo | 2 chamadas no começo do dia abrem o circuito sem motivo |
| Várias chamadas no meio-aberto | você despeja carga justo na dependência que estava se recuperando |
| Sem fallback | abrir o circuito só troca lentidão por erro |
| Sem métrica de estado | a proteção esconde o problema que ela está segurando |

:::exemplo A proteção silenciosa
Um breaker bem-feito absorve a falha, o usuário não reclama e ninguém percebe. O problema real cresce
por semanas até estourar de um jeito que a proteção não segura. Por isso **estado do breaker, uso de
fallback e carga descartada precisam ser métricas com alerta** — inclusive alerta para quando saem do
zero.
:::

## Quando a falha vira apagão

### A anatomia da cascata

A falha em cascata tem sempre a mesma forma, e conhecer os cinco passos permite dizer exatamente onde
quebrar a corrente:

1. uma dependência fica lenta;
2. **sem timeout**, as requisições se acumulam;
3. o recurso compartilhado (pool, threads, conexões) esgota;
4. o serviço passa a falhar em **tudo**;
5. os clientes fazem **retry**, dobrando a carga.

Cada passo tem um remédio: timeout (2) · anteparo (3) · breaker e degradação (4) · backoff com jitter e
retry budget (5).

:::alerta A recuperação também falha em cascata
Quando o sistema volta, todos os clientes reconectam ao mesmo tempo e o cache está vazio: o banco frio
leva uma carga de pico e cai de novo. O desenho não termina em "como evito cair" — precisa responder
"como eu **volto**": subir devagar, limitar conexões novas por segundo, aquecer cache.
:::

### Retry: o remédio que vira veneno

Retry sem cuidado é a forma mais rápida de transformar degradação em queda. Três condições, todas
obrigatórias: o erro é **transitório** (timeout, 503, conexão recusada — nunca 400 de validação), a
operação é **idempotente**, e existe **limite** de tentativas.

E o jitter importa tanto quanto o backoff: sem a parte aleatória, mil clientes que falharam juntos
voltam juntos aos 2 s, depois juntos aos 4 s. O backoff espaçou as ondas; cada onda continua sendo a
estampida inteira.

:::atividade
id: retry-em-camadas
titulo: Contar as chamadas do retry em camadas
termos: [resiliencia/retry-jitter, mensageria/estampida]
nivel: 4
tempoMin: 10
ambiente: papel
entrega:
  tipo: numero
  rotulo: Quantas chamadas chegam ao serviço final numa única falha?
  esperado: 27
  tolerancia: 0
criterios:
  - Percebeu que retries se MULTIPLICAM entre camadas, não se somam
---
Sua arquitetura tem três camadas e cada uma foi escrita por um time cuidadoso, que colocou retry:

- o **cliente** tenta 3 vezes;
- o **gateway** tenta 3 vezes;
- o **serviço intermediário** tenta 3 vezes.

O serviço final está degradado e falha em todas as tentativas.

**Quantas chamadas chegam ao serviço final por causa de UMA requisição do usuário?**
---
**27** (3 × 3 × 3). Retries em camadas **multiplicam**, não somam — e a multiplicação acontece
exatamente quando o sistema está mais frágil. Um pico de erro de 2 % vira mais de 50 % de carga extra
sobre um serviço que já não dá conta.

Duas regras que resolvem:

1. **Retry em UM nível da pilha**, idealmente o mais próximo do usuário, com os demais falhando rápido.
   Quem está no meio deve propagar o erro, não insistir.
2. **Retry budget**: permitir retries só até uma fração do tráfego normal (~10 %). Passando disso,
   desiste e devolve erro. Jitter espalha no tempo; budget limita o volume — e você precisa dos dois,
   porque espalhar 27× no tempo continua sendo 27×.

Sinal de que você tem esse problema: durante um incidente, o gráfico de requisições do serviço interno
**sobe** enquanto o tráfego de entrada cai. Isso é retry se acumulando.
:::

### Degradar, descartar ou falhar

Sob sobrecarga todo sistema escolhe — a única questão é se a escolha é **consciente**.

- **Degradar**: entregar uma versão reduzida (cache velho identificado, seção desligada, resposta
  parcial). Exige decidir antes o que é essencial, e ser honesto: mostrar dado velho sem avisar é mentir.
- **Descartar** (load shedding): rejeitar parte do tráfego para atender bem o resto. O melhor critério
  de descarte é a **idade**: requisição que já passou do deadline não tem mais valor nenhum — descartar
  isso é descarte sem perda.
- **Falhar**: quando o custo de estar errado é alto (limite de crédito, saldo, autorização), a resposta
  correta é o erro. Fallback para dado errado é pior que erro.

:::nota A pergunta que resolve
"Qual é o custo de estar errado aqui?" Se a resposta for alta, falhe. Se for baixa, degrade. Essa
pergunta é de produto, não de engenharia — e precisa ser respondida por escrito antes do incidente.
:::

### Health check: o probe que derruba tudo

Um detalhe de configuração que produz apagões inteiros: **liveness** responde "preciso ser reiniciado?"
e **readiness** responde "posso receber tráfego agora?".

Se o liveness checar o banco e o banco cair, o orquestrador reinicia **todas** as instâncias saudáveis —
e reiniciar não conserta banco nenhum. Elas voltam, falham de novo e entram em laço de reinício. Uma
falha de dependência virou indisponibilidade total.

O desenho correto: liveness **raso** (o processo responde HTTP); readiness **profundo** (dependências
críticas); startup probe para app de inicialização lenta. E o readiness é o **primeiro passo** do
desligamento gracioso: marcar como não-pronto, esperar o balanceador tirar do rodízio, e só então parar
de aceitar e drenar o que está em voo.

:::atividade
id: liveness-vs-readiness
titulo: Onde cada checagem pertence
termos: [resiliencia/health-check, resiliencia/falha-em-cascata]
nivel: 4
tempoMin: 15
ambiente: papel
entrega:
  tipo: escolha
  rotulo: Marque tudo que pertence ao READINESS (e não ao liveness)
  opcoes:
    - Conexão com o banco está funcionando
    - O processo responde a uma requisição HTTP
    - As migrações terminaram e o cache inicial carregou
    - A instância está entrando em desligamento gracioso
  corretas: [0, 2, 3]
criterios:
  - Separou "preciso ser reiniciado" de "posso receber tráfego"
---
Seu serviço em Kubernetes (ou atrás de qualquer balanceador) tem dois probes. Marque **todas** as
checagens que pertencem ao **readiness**.

Antes de responder, use a régua: para cada item, pergunte *"se isto estiver falhando, reiniciar o
processo resolve?"*. Se a resposta for não, o item não pode estar no liveness.
---
**Readiness: banco, migrações/cache inicial e desligamento gracioso.** Só "o processo responde HTTP"
pertence ao liveness.

O raciocínio, item a item:

- **Banco fora** → reiniciar não conserta. No readiness, a instância sai do balanceamento, **mantém o
  processo vivo** (com cache quente e conexões) e volta sozinha quando a dependência voltar.
- **Processo responde HTTP** → é exatamente a pergunta do liveness: se nem isso, ele travou e reiniciar
  é a resposta certa.
- **Migrações e cache inicial** → readiness, ou startup probe. Se ficarem no liveness, o probe mata o
  processo antes de ele terminar de subir — e o sintoma é um serviço que "nunca sobe".
- **Desligamento gracioso** → readiness falso é o **primeiro** passo. Sem ele, você para de aceitar
  conexões enquanto o balanceador ainda manda tráfego, e o usuário leva erro de conexão no meio do deploy.
:::

## Conduzir 45 minutos de system design

### O roteiro

O erro número um é desenhar antes de entender. O roteiro que funciona, com o tempo de cada parte:

| Tempo | Parte | O que entregar |
| --- | --- | --- |
| 5' | Requisitos | funcionais e **não funcionais**; escopo delimitado em voz alta |
| 5' | Estimativa | QPS, armazenamento, banda — e a **conclusão** que eles produzem |
| 5' | API e modelo | endpoints, corpo, paginação; as tabelas saem daí |
| 10' | Desenho macro | o **caminho do dado** da escrita e da leitura |
| 15' | Aprofundar | a parte difícil — pergunte qual o entrevistador quer |
| 5' | Gargalos | o que satura primeiro, o que você mediria, como evolui |

Diga o roteiro no começo. Isso já demonstra método e dá ao entrevistador a chance de redirecionar.

### Estimar para concluir

Estimativa não é aritmética por esporte: é o que decide a arquitetura. Números que valem memorizar:
1 dia ≈ 10⁵ s · 1 milhão/dia ≈ 12 req/s · 1 bilhão/dia ≈ 12 mil req/s · pico ≈ 3× a média.

O que importa é a **conclusão**: "600 GB por ano cabem numa instância de Postgres, então não preciso
shardar — o problema é a leitura, e leitura resolve com cache e réplica". Estimar sem concluir é
aritmética sem propósito.

### Declarar o trade-off (e o problema novo)

A estrutura que separa sênior de pleno tem **quatro** partes, e quase todo mundo para na terceira:

> **problema** → **solução** → **trade-off** → **novo problema criado**

> "A leitura não escala (problema); coloco cache (solução); ganho latência e perco frescor
> (trade-off); **agora preciso decidir invalidação e o que fazer se o Redis cair** (novo problema)."

Esse quarto item é o que demonstra experiência real: toda solução cria um problema novo, e reconhecê-lo
antes é o sinal mais forte de maturidade.

:::atividade
id: design-degradacao-painel
titulo: Desenhar a degradação de um painel que depende de uma API externa
termos: [resiliencia/degradacao-graciosa, resiliencia/fallback, system-design/trade-off-explicito]
nivel: 5
tempoMin: 30
ambiente: papel
entrega:
  tipo: texto
  rotulo: Seu desenho, com as quatro partes de cada decisão
  minimoChars: 400
dicas:
  - Comece perguntando qual é o custo de mostrar um número errado nesta tela.
  - Degradar em silêncio é mentir; degradar com a idade do dado à vista é honesto.
criterios:
  - Separa o que é essencial do que pode faltar, e justifica a separação
  - Define o comportamento quando a dependência está fora (não deixa implícito)
  - Torna a degradação VISÍVEL para o usuário (idade do dado, selo, aviso)
  - Declara pelo menos uma métrica que prova que a degradação está acontecendo
  - Usa a estrutura problema → solução → trade-off → novo problema em ao menos duas decisões
---
Um painel de operação mostra quatro blocos: **venda do dia**, **meta × realizado**, **ranking de
vendedoras** e **entrega de fornecedor**. Os três primeiros vêm do seu banco; o último vem de uma API
externa que fica lenta com frequência e cai algumas vezes por mês.

Desenhe o comportamento do painel quando essa API externa está **lenta** e quando está **fora**.

Sua resposta precisa cobrir:

1. o que é essencial e o que pode faltar (e por quê);
2. o que o usuário vê em cada cenário — inclusive o que está escrito na tela;
3. o timeout, o fallback e o gatilho do circuit breaker;
4. como você **saberia** que o painel está operando degradado;
5. duas decisões apresentadas com as quatro partes (problema → solução → trade-off → novo problema).
---
Um desenho forte para este caso:

**Essencial vs opcional.** Venda, meta e ranking vêm do seu banco e são o motivo de a tela existir:
**essenciais**. Entrega vem de terceiro e é contexto: **opcional**. Essa separação é decisão de produto
e precisa estar escrita — não pode ser descoberta durante o incidente.

**O que o usuário vê.** Com a API lenta: timeout curto (p99 × 1,5) e o bloco de entrega mostra o último
valor conhecido **com a idade à vista** — "entrega: 1.207 pç · atualizado há 14 min". Com a API fora: o
bloco mostra "indisponível agora · último dado de 09:15" em vez de sumir. Os outros três blocos nunca
são afetados, porque a chamada externa tem **pool próprio** (anteparo) e não divide recurso com as
consultas do banco.

**Proteção.** Timeout na chamada; circuit breaker por **taxa** com volume mínimo; enquanto aberto, serve
direto do cache sem tentar. Cache com dois TTLs (stale-while-revalidate + stale-if-error) faz a maior
parte das quedas passar despercebida.

**Como eu saberia.** Métricas com alerta: estado do breaker por dependência, taxa de uso do fallback,
**idade máxima do dado servido**. Alerta quando a taxa de fallback sai do zero por mais de N minutos —
sem isso, o painel pode operar degradado por dias e o problema real segue crescendo.

**Duas decisões nas quatro partes:**

1. A entrega trava a tela (problema) → timeout + cache de resiliência (solução) → o número pode estar
   velho (trade-off) → **agora preciso exibir a idade e alertar quando ela passar de X** (novo problema).
2. A API externa prende conexões (problema) → pool dedicado, anteparo (solução) → capacidade reservada
   fica ociosa quando a API está bem (trade-off) → **preciso dimensionar esse pool e monitorar sua
   saturação separadamente** (novo problema).

O erro mais comum neste exercício é resolver só o caso "fora do ar" e esquecer o caso "lenta" — que é o
mais frequente e o que derruba de verdade.
:::
