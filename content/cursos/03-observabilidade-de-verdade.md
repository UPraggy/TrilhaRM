---
id: observabilidade-de-verdade
deck: observabilidade
fase: 2
ordem: 3
nivel: 4
tags: [observabilidade, node, producao, slo, diagnostico]
descricao: Log com correlation id, as métricas que respondem pergunta, p99 de histograma, trace ponta a ponta e alerta que não acorda ninguém à toa.
---

# Observabilidade de verdade

Monitoramento responde "está no ar?". Observabilidade responde **"por que está ruim para 2 % dos usuários,
só nesta rota, só depois do deploy das 14h?"** — uma pergunta que você não previu quando instrumentou. A
diferença não é a ferramenta: é ter dados com contexto suficiente para dividir o problema.

:::objetivo Ao terminar você consegue
- carregar um [[correlation-id]] por toda a requisição, inclusive depois de um `await`;
- escolher entre counter, gauge e histogram sabendo o que cada um perde;
- calcular o p99 de um histograma na mão e explicar por que ele é aproximado;
- amarrar um trace ponta a ponta entre dois serviços Node;
- escrever um [[slo]] com [[error-budget]] e um alerta que dispara por sintoma, não por causa.
:::

Pré-requisitos: Node 22 no PATH. Tudo aqui roda com módulos nativos — nenhuma dependência para instalar.

## Log que serve para investigar

Log é o pilar mais barato de produzir e o mais fácil de estragar. As três lições deste módulo são sobre
transformar "texto no terminal" em algo que se consulta.

### Log estruturado não é log bonito

Um log estruturado é **uma linha, um objeto JSON, um evento**. A diferença com o log tradicional não é
estética: é que você consegue **filtrar e agregar** sem escrever expressão regular.

```js
// não dá para agregar: o dado está preso na frase
console.log(`pedido ${id} do cliente ${cliente} levou ${ms}ms`)

// dá: cada campo é uma chave
console.log(JSON.stringify({ nivel: 'info', evento: 'pedido.concluido', pedidoId: id, clienteId: cliente, duracaoMs: ms }))
```

Com a segunda forma você responde "qual o p95 de `duracaoMs` do evento `pedido.concluido` por `clienteId`"
com uma consulta. Com a primeira, você responde com sorte. Veja [[logs-estruturados]].

Regras que valem mais que a biblioteca escolhida:

- **Um evento por linha, sem quebra de linha no meio.** Stack trace vai num campo (`erro.stack`), não solto.
- **Campos com nome estável.** `duracaoMs` sempre em milissegundos, sempre com esse nome, em todo serviço.
  Nome que muda por serviço é o que impede a consulta cruzada.
- **[[niveis-de-log]] com significado operacional**: `error` = alguém precisa olhar; `warn` = degradou mas
  seguiu; `info` = evento de negócio; `debug` = desligado em produção, ligável por variável de ambiente.
  Se tudo é `info`, nada é.
- **Log é dado de produção.** `logger.info({ usuario })` despeja e-mail, CPF e token junto. Liste os campos
  explicitamente, ou use o *redact* da biblioteca — ver [[seguranca/logging-sem-vazar]].

:::alerta O `console.log` bloqueia
`process.stdout` para um arquivo ou pipe é **síncrono** no Linux. Um log gordo dentro do caminho quente
para o event loop enquanto escreve. `pino` existe por isso: serializa rápido e, com transporte, escreve em
outra thread. Se você precisa de um número: logar um objeto grande por requisição a 1.000 req/s é trabalho
de CPU no lugar mais caro possível.
:::

### O correlation id que sobrevive ao await

Log estruturado sem chave de junção é um monte de linha solta. A chave é o [[correlation-id]]: um id gerado
na borda (ou herdado do header `x-request-id`) e carimbado em **toda** linha daquela requisição — inclusive
nas dos serviços seguintes, via [[context-propagation]].

O problema é mecânico: em Node, uma requisição não tem thread própria. Guardar o id numa variável de módulo
funciona no teste manual (uma requisição por vez) e mistura tudo sob concorrência. A solução nativa é o
`AsyncLocalStorage`: um armazenamento que segue a **cadeia assíncrona**, atravessando `await`, `setTimeout`
e callbacks.

```js
const { AsyncLocalStorage } = require('node:async_hooks')
const als = new AsyncLocalStorage()

app.use((req, res, next) => {
  const requestId = req.headers['x-request-id'] || crypto.randomUUID()
  res.setHeader('x-request-id', requestId)
  als.run({ requestId }, next)
})

function log(evento, dados) {
  const ctx = als.getStore() || {}
  process.stdout.write(JSON.stringify({ ts: new Date().toISOString(), requestId: ctx.requestId, evento, ...dados }) + '\n')
}
```

Agora `log()` não recebe o id como parâmetro em nenhum lugar — e mesmo assim toda linha sai carimbada, três
camadas abaixo.

:::atividade
id: correlation-id-que-sobrevive-ao-await
titulo: Provar que o correlation id sobrevive ao await
termos: [correlation-id, context-propagation, logs-estruturados]
nivel: 3
tempoMin: 25
ambiente: node
entrega:
  tipo: saida
  rotulo: Cole as duas linhas que o script imprimiu
  esperado: |
    variavel de modulo: r3 r3 r3
    asynclocalstorage: r1 r2 r3
dicas:
  - A parte síncrona das três chamadas roda antes de qualquer await resumir - pergunte que valor a variável tem nesse instante.
  - Se as duas linhas derem r1 r2 r3, você executou as requisições em série; elas precisam ser disparadas juntas com Promise.all.
criterios:
  - Entendeu que a variável de módulo é sobrescrita pela última requisição que chegou, não pela mais lenta
---
Salve como `correlacao.js` e rode com `node correlacao.js`. Ele simula **três requisições concorrentes**,
cada uma com um id, e compara duas formas de guardar esse id: uma variável de módulo e um
`AsyncLocalStorage`.

```js
const { AsyncLocalStorage } = require('node:async_hooks')

const espera = (ms) => new Promise((r) => setTimeout(r, ms))

// --- versao 1: variavel de modulo (o jeito que "funciona" em teste manual)
let requestIdAtual = null
async function consultarBancoGlobal() {
  await espera(10)
  return requestIdAtual
}
async function handlerGlobal(id, ms) {
  requestIdAtual = id
  await espera(ms)
  return consultarBancoGlobal()
}

// --- versao 2: AsyncLocalStorage
const als = new AsyncLocalStorage()
async function consultarBancoAls() {
  await espera(10)
  return als.getStore().requestId
}
function handlerAls(id, ms) {
  return als.run({ requestId: id }, async () => {
    await espera(ms)
    return consultarBancoAls()
  })
}

async function main() {
  const global = await Promise.all([handlerGlobal('r1', 30), handlerGlobal('r2', 20), handlerGlobal('r3', 10)])
  const comAls = await Promise.all([handlerAls('r1', 30), handlerAls('r2', 20), handlerAls('r3', 10)])
  console.log('variavel de modulo:', global.join(' '))
  console.log('asynclocalstorage:', comAls.join(' '))
}
main()
```

Antes de rodar, **escreva no papel** as duas linhas que você espera. Depois rode.

Entregue: as duas linhas exatas da saída.
---
A saída é:

```
variavel de modulo: r3 r3 r3
asynclocalstorage: r1 r2 r3
```

As três chamadas de `handlerGlobal` são disparadas juntas: a parte **síncrona** de cada uma roda antes de
qualquer `await` resumir, então `requestIdAtual` é sobrescrito três vezes e fica valendo `r3`. Quando os
timers finalmente disparam, os três leem o mesmo valor. Note que não é "o último a terminar" que ganha — é o
**último a começar**. Por isso o bug não aparece em teste local, onde as requisições chegam em série.

O `AsyncLocalStorage` acerta porque o valor não está numa variável compartilhada: está preso à cadeia
assíncrona criada dentro do `als.run()`. Cada `await`, `setTimeout` ou callback herda o contexto de quem o
agendou — é o mesmo mecanismo que o OpenTelemetry usa para saber a qual span uma operação pertence
([[context-propagation]]).

O custo: `AsyncLocalStorage` tem overhead (menor a cada versão do Node, mas não zero). Guarde ali só o que é
pequeno e realmente transversal — id da requisição, id do usuário, locale. **Não** é um lugar para passar o
objeto de domínio: isso vira acoplamento invisível.

Em produção, o teste que prova que está funcionando é outro: dispare 50 requisições concorrentes com
`autocannon` e confira que a contagem de `requestId` distintos no log é igual à contagem de requisições. Se
for menor, você tem vazamento de contexto.
:::

### Log que não vai à falência

Log é o pilar mais caro **por byte útil**. Três decisões de [[log-retention-custo]] evitam a conta absurda:

1. **Retenção por camada.** 7 dias de `debug`, 30 de `info`, 1 ano do que é auditoria. Um bucket por
   política, não tudo no mesmo índice caro.
2. **[[sampling]] no que é volume, nunca no que é erro.** Logar 1 em cada 100 requisições de sucesso e
   **100 % dos erros** mantém a estatística e corta 99 % do custo. A regra de ouro: amostre por
   requisição (todas as linhas da mesma requisição entram ou saem juntas), senão você guarda metade de um
   trace e não consegue reconstruir nada.
3. **Log não é métrica.** Contar erros lendo log custa uma consulta cara toda vez; um counter custa 8 bytes.
   Log responde "o que aconteceu com esta requisição"; métrica responde "quantas por segundo".

:::nota PM2 no celular
O seu caso ([[pm2-logs-vs-agregador]]): `pm2 logs` é ótimo para os últimos minutos e péssimo como memória —
arquivo cresce até encher o cartão, e `grep` num arquivo de 2 GB no Android é dolorido. `pm2-logrotate` com
`max_size` e `retain` resolve o disco; para consultar por campo, o caminho barato é `jq` sobre o JSONL,
que só é possível porque o log é estruturado.
:::

## Métrica que responde pergunta

Métrica é o pilar barato: números agregados, cardinalidade controlada, baratos de guardar por anos. O erro
clássico é medir o que é fácil em vez do que responde pergunta.

### As quatro que importam

Os [[golden-signals]] do Google cabem em quatro perguntas:

| Sinal | Pergunta | Métrica típica |
| --- | --- | --- |
| Latência | está rápido? | histograma de duração, **separando sucesso de erro** |
| Tráfego | quanto está chegando? | requisições por segundo |
| Erros | está funcionando? | taxa de 5xx e de falhas de negócio |
| Saturação | quanto falta para quebrar? | uso do pool, lag do loop, fila, memória |

Dois detalhes que quase todo dashboard erra:

- **Latência de erro polui a de sucesso.** Um 500 que falha em 2 ms *melhora* o p99 — a rota "melhorou"
  enquanto quebrava. Separe sempre por `status`.
- **Saturação é a única métrica preditiva.** Latência e erro contam o que **já** doeu; saturação avisa
  antes. Se você só puder ter um gráfico a mais, que seja "uso / capacidade" do recurso mais escasso.

[[red-vs-use]] é o mesmo assunto com outro recorte: **RED** (Rate, Errors, Duration) para serviços que
atendem requisição; **USE** (Utilization, Saturation, Errors) para recursos — CPU, disco, pool. Serviço pede
RED; recurso pede USE. Misturar os dois é o que produz dashboard com 40 gráficos e nenhuma resposta.

Sobre os [[metricas-tipos]]:

- **counter** só sobe (reinicia em zero no restart) — você sempre consulta a *taxa*, nunca o valor;
- **gauge** sobe e desce (conexões em uso, memória);
- **histogram** distribui em faixas (*buckets*) e é o único que permite percentil depois;
- **summary** calcula o percentil **no processo** — e por isso **não pode ser somado** entre instâncias.

:::atividade
id: qual-metrica-responde-a-pergunta
titulo: Qual métrica responde a pergunta
termos: [golden-signals, red-vs-use, metodo-diagnostico]
nivel: 3
tempoMin: 15
ambiente: papel
entrega:
  tipo: escolha
  rotulo: Qual instrumentação responde à pergunta do plantão?
  opcoes:
    - Um gauge com a latência média da rota, atualizado a cada requisição.
    - Um summary de latência por instância, com os percentis já calculados dentro do processo.
    - Um histogram de latência com label de rota e de status, mais um gauge de saturação do pool de conexões.
    - Um counter de requisições por segundo e um counter de erros, com alerta quando os erros passarem de 100.
  correta: 2
dicas:
  - A pergunta exige saber a CAUDA da distribuição e se o recurso escasso está no fim - a média não responde nenhuma das duas.
criterios:
  - Escolhe histogram por ser o único agregável entre instâncias para percentil
  - Reconhece saturação como o sinal preditivo que falta
---
São 14h30. O suporte diz: **"alguns clientes estão reclamando que a tela de pedidos demora; a maioria não
reclama de nada"**. Você tem quatro instâncias do serviço atrás de um proxy e 15 minutos para responder se é
real, quem é afetado e o quanto falta para piorar.

Qual instrumentação responde a essa pergunta?
---
A resposta é a **terceira**.

**Histogram com label de rota e status** é o único formato que permite (a) calcular p95/p99 — "alguns
clientes" vive na cauda, não na média — e (b) **somar as quatro instâncias** antes de calcular o percentil.
Essa é a diferença técnica que mais cai em entrevista: *histogram* guarda contadores por faixa, e contadores
somam; *summary* já calcula o percentil dentro do processo, e **percentil não soma** — a média dos p99 de
quatro instâncias não é o p99 do conjunto, e o erro costuma ser grande.

O **gauge de saturação do pool** responde a terceira pergunta, a única preditiva: se o pool está em 60 % às
14h30, você tem folga; se está em 95 %, o próximo pico vira incidente. Latência e erro contam o passado;
saturação conta o futuro.

Por que as outras falham:

- **Média em gauge**: 980 requisições de 20 ms e 20 de 2 s dão média de 59,6 ms — parece ótimo e esconde
  que 2 % dos usuários esperaram 2 segundos. É exatamente o caso do suporte.
- **Summary por instância**: percentis não agregáveis, como explicado acima.
- **Counter de erros com limiar fixo**: a reclamação é de **lentidão**, não de erro; e alerta em número
  absoluto (100 erros) dispara diferente às 3h e às 15h. Alerta se mede em **taxa**.

O método que fecha o caso ([[metodo-diagnostico]]): confirme na latência por rota e status, corte por
instância (se só uma está ruim, é a instância; se são todas, é dependência comum), depois olhe saturação.
Três gráficos, quinze minutos.
:::

### Histograma, p99 e por que a média mente

A média é a primeira estatística que se aprende e a pior para latência, porque a distribuição de latência
não é simétrica: ela tem uma cauda longa à direita. Um punhado de requisições muito lentas move pouco a
média e move completamente a experiência do usuário — é a [[concorrencia-performance/tail-latency]].

:::atividade
id: a-media-que-esconde-a-cauda
titulo: A média que esconde a cauda
termos: [metricas-tipos, concorrencia-performance/percentis, concorrencia-performance/tail-latency]
nivel: 2
tempoMin: 15
ambiente: node
entrega:
  tipo: saida
  rotulo: Cole as cinco linhas que o script imprimiu
  esperado: |
    media: 59.6 ms
    p50: 20 ms
    p95: 20 ms
    p99: 2000 ms
    acima de 1s: 20 de 1000
dicas:
  - Para o percentil q com n amostras ordenadas, o índice é ceil(q * n) - 1 (base zero).
  - Se o p99 vier 20, você usou 10 amostras lentas em vez de 20.
criterios:
  - Entende que o p95 pode estar ótimo enquanto o p99 está terrível
---
Salve como `percentis.js` e rode com `node percentis.js`. São 1.000 amostras de latência: 980 requisições de
20 ms e 20 de 2.000 ms — o formato real de um serviço com uma dependência que às vezes trava.

```js
// 1000 amostras de latencia: 980 rapidas, 20 lentas
const amostras = []
for (let i = 0; i < 980; i++) amostras.push(20)
for (let i = 0; i < 20; i++) amostras.push(2000)

const media = amostras.reduce((a, b) => a + b, 0) / amostras.length
const ordenado = [...amostras].sort((a, b) => a - b)
const p = (q) => ordenado[Math.ceil(q * ordenado.length) - 1]

console.log('media:', media.toFixed(1), 'ms')
console.log('p50:', p(0.5), 'ms')
console.log('p95:', p(0.95), 'ms')
console.log('p99:', p(0.99), 'ms')
console.log('acima de 1s:', amostras.filter((x) => x > 1000).length, 'de', amostras.length)
```

Antes de rodar, responda no papel: qual alerta você configuraria se só pudesse olhar a média?

Entregue: as cinco linhas exatas da saída.
---
A saída é:

```
media: 59.6 ms
p50: 20 ms
p95: 20 ms
p99: 2000 ms
acima de 1s: 20 de 1000
```

Três lições em cinco linhas:

1. **A média (59,6 ms) não descreve nenhuma requisição real.** Nenhuma das 1.000 levou 59,6 ms: elas levaram
   20 ou 2.000. Média é uma péssima descrição de distribuição bimodal — e latência quase sempre é bimodal
   (cache hit × cache miss, pool livre × pool cheio, fast path × retry).
2. **p95 em 20 ms e p99 em 2.000 ms.** O dashboard com p95 estaria verde durante o incidente inteiro. Quando
   o problema atinge 1 % a 3 % do tráfego — o tamanho típico de "uma instância ruim de quatro" ou "uma
   partição de banco lenta" — só o p99 enxerga.
3. **20 de 1.000 parece pouco até virar gente.** A 300 req/s, 2 % são 6 usuários por segundo, 21.600 por
   hora. E um usuário raramente faz uma requisição só: numa tela com 20 chamadas, a chance de pegar ao menos
   uma lenta é `1 - 0,98^20 ≈ 33 %`. É por isso que "só 2 % das requisições" vira "um terço das telas".

Regra prática: **alerte no p99, ponha meta no p95 e nunca olhe a média sozinha.** E se precisar de um único
número para o time de produto, use "porcentagem de requisições acima de X" — é o que vira
[[sli]] direto.
:::

O percentil que o Prometheus (ou qualquer histograma de buckets) entrega **não é o valor exato**: é uma
interpolação linear dentro do bucket onde o percentil caiu. Buckets largos demais e o número vira ficção.

```
# HELP http_request_duration_ms
http_request_duration_ms_bucket{le="10"}   800
http_request_duration_ms_bucket{le="50"}   950
http_request_duration_ms_bucket{le="100"}  980
http_request_duration_ms_bucket{le="500"}  996
http_request_duration_ms_bucket{le="1000"} 1000
http_request_duration_ms_bucket{le="+Inf"} 1000
```

Os buckets são **cumulativos**: `le="50"` significa "950 requisições levaram até 50 ms".

:::atividade
id: p99-de-um-histograma-na-mao
titulo: Calcular o p99 de um histograma na mão
termos: [metricas-tipos, sli, concorrencia-performance/percentis]
nivel: 4
tempoMin: 20
ambiente: papel
entrega:
  tipo: numero
  esperado: 350
  tolerancia: 0.02
  unidade: ms
  rotulo: p99 interpolado, em ms
dicas:
  - Ache primeiro o bucket onde cai a observação de número 990; os buckets são cumulativos.
  - Dentro do bucket, interpole linearmente entre o limite anterior e o limite dele.
criterios:
  - Localizou o bucket correto pela contagem cumulativa
  - Interpolou linearmente entre os dois limites, e não pegou o limite superior direto
---
Use o histograma da lição:

| `le` (ms) | contagem cumulativa |
| --- | --- |
| 10 | 800 |
| 50 | 950 |
| 100 | 980 |
| 500 | 996 |
| 1000 | 1000 |
| +Inf | 1000 |

Calcule o **p99** do jeito que o `histogram_quantile` do Prometheus calcula: encontre o bucket em que cai a
observação de posição `0,99 × 1000` e **interpole linearmente** entre o limite inferior e o superior desse
bucket.

Entregue: só o número, em ms.
---
```
alvo = 0,99 × 1000 = 990ª observação
até 100 ms ... 980 observações   (ainda não chegou)
até 500 ms ... 996 observações   (passou: o p99 está no bucket (100, 500])
neste bucket há 996 - 980 = 16 observações, e faltam 990 - 980 = 10
p99 = 100 + (500 - 100) × (10 / 16) = 100 + 400 × 0,625 = 350 ms
```

**350 ms** — e nenhuma requisição precisou ter levado 350 ms. O número é uma **interpolação**, e ela assume
que as 16 observações do bucket estão uniformemente distribuídas entre 100 e 500 ms. Se na verdade as 16
levaram 480 ms, o p99 real era 480 e o gráfico mostra 350.

O que isso implica na prática:

- **Precisão é escolha de bucket.** Entre 100 e 500 ms há um vão de 400 ms; um bucket em `le="200"` cortaria
  o erro pela metade. Escolha os limites em volta do seu SLO: se a meta é 300 ms, você precisa de buckets
  densos em 200, 300 e 400 — não adianta resolução em 5 ms se a decisão acontece em 300.
- **O p99 nunca passa do maior bucket finito.** Se tudo que é lento cai em `+Inf`, o `histogram_quantile`
  devolve o último limite finito e você tem um teto invisível no gráfico. Sintoma: p99 "colado" em 1000 ms
  por horas.
- **Bucket custa cardinalidade.** Cada `le` é uma série temporal, multiplicada por cada combinação de labels
  — é o assunto da próxima lição.

Por isso o par que se leva para a entrevista: *"o p99 do histograma é aproximado por construção; a precisão
vem dos buckets, e eu escolho os buckets em volta do SLO"*.
:::

### Cardinalidade: a métrica que derruba o coletor

Toda combinação distinta de labels vira **uma série temporal** guardada na memória do coletor. A conta é
multiplicativa:

```
séries = rotas × métodos × status × instâncias × buckets
       = 20 × 4 × 6 × 4 × 12 = 23.040   (ok)
```

Agora acrescente um label `userId`, com 50.000 usuários: 1,15 **bilhão** de séries. O Prometheus não fica
lento — ele morre por OOM, e leva junto a visibilidade de todo o resto no pior momento possível.

A regra de [[cardinalidade]]: **label é dimensão de agregação, não identificador.** Se o valor é único por
requisição (id de usuário, id de pedido, caminho com id dentro, mensagem de erro completa), ele pertence ao
log ou ao trace — nunca à métrica.

Três armadilhas comuns:

- `path="/pedidos/8412"` em vez de `route="/pedidos/:id"` — cada pedido vira uma série;
- `erro="connect ETIMEDOUT 10.0.0.4:5432"` em vez de `erro="timeout"` — o IP e a porta explodem a série;
- label de versão ou de deploy sem limpeza: cada release deixa séries órfãs para sempre.

## Da métrica ao diagnóstico

Métrica diz **que** está ruim. Trace diz **onde**. SLO diz **se importa**. E o alerta diz **quando acordar
alguém**.

### Trace: a requisição inteira numa linha do tempo

Um trace é uma árvore de [[traces-spans]]: cada span tem id próprio, id do pai, começo, fim e atributos. O
que transforma spans soltos em [[distributed-tracing]] é a propagação do contexto entre processos — hoje
padronizada pelo header `traceparent` do W3C:

```
traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
             ^  ^                                ^                ^
          versão trace-id (16 bytes)          span-id (8 bytes)  flags (amostrado?)
```

Quem recebe lê o header, cria um span filho com o mesmo `trace-id` e propaga adiante. É isso — o resto é
biblioteca. O [[opentelemetry]] em Node faz isso automaticamente para `http`, `pg` e outros módulos via
instrumentação, e usa o mesmo `AsyncLocalStorage` da segunda lição para saber qual span está ativo.

:::nota A decisão de amostrar é do primeiro
O bit final do `traceparent` (`01`) diz se o trace é amostrado. Quem decide é **a borda**, e todos os
serviços seguintes obedecem — senão você fica com trace pela metade. Padrão comum: amostrar 1 % do tráfego
normal e **100 % do que deu erro ou passou de X ms** (*tail sampling*), que é onde a resposta mora.
:::

:::atividade
id: amarrar-um-trace-ponta-a-ponta
titulo: Amarrar um trace ponta a ponta entre dois serviços
termos: [traces-spans, distributed-tracing, context-propagation]
nivel: 4
tempoMin: 50
ambiente: node
entrega:
  tipo: checklist
  rotulo: Marque o que você conseguiu comprovar
  itens:
    - Subi dois serviços Node (A na 8795 e B na 8796) em que A chama B por HTTP
    - A borda gera traceparent quando o header não existe e reaproveita quando existe
    - B loga o mesmo trace-id de A e um span-id proprio, com parent-id apontando para o span de A
    - Cada span registra inicio, fim e duracao em ms no log estruturado
    - Consegui montar a linha do tempo da requisicao inteira filtrando o log pelo trace-id
    - Uma falha em B aparece no trace com o span marcado como erro, sem perder o trace-id
criterios:
  - O trace-id atravessa o processo sem ser passado como parâmetro em cada função
  - O span filho aponta para o pai, e não para a raiz
---
Monte, sem nenhuma dependência externa, um trace que atravessa dois processos.

**Serviço A** (porta 8795) recebe `GET /pedido/:id`, cria o span raiz, chama o **serviço B** (porta 8796)
em `GET /estoque/:id` e responde. Use `node:http`, `node:crypto` e o `AsyncLocalStorage` da lição.

Passos:

1. na borda de A, leia `traceparent`; se não vier, gere `trace-id` (16 bytes em hex) e `span-id` (8 bytes);
2. guarde `{ traceId, spanId }` no `AsyncLocalStorage` e faça toda função de log lê-lo de lá;
3. ao chamar B, mande `traceparent` montado com o **span atual** como pai;
4. em B, repita: leia o header, crie um span filho, logue e responda;
5. registre `duracaoMs` de cada span no fim;
6. faça B falhar (responda 500 em 1 de cada 3) e confira que o trace continua inteiro.

Junte os dois logs (`node a.js > a.jsonl` e `node b.js > b.jsonl`), ordene por `ts` e filtre por um
`trace-id`. Você deve conseguir desenhar a linha do tempo.

Entregue: marque os itens que você comprovou.
---
O ponto do exercício é ver, com as mãos, que tracing distribuído tem **três** peças e nenhuma delas é mágica:

1. **Identidade** — `trace-id` compartilhado por toda a requisição, `span-id` por operação, `parent-id`
   ligando um ao outro. É o que transforma linhas soltas numa árvore.
2. **Propagação entre processos** — um header, e só. Se o seu cliente HTTP não repassa o `traceparent`, o
   trace quebra ali e o próximo serviço abre um trace novo (sintoma: traces com um span só, todos órfãos).
3. **Propagação dentro do processo** — o `AsyncLocalStorage`. Sem ele você teria que passar o contexto como
   parâmetro em toda função, e é exatamente isso que o OpenTelemetry evita.

O log de A deve sair parecido com:

```
{"ts":"...","traceId":"4bf9...","spanId":"00f0...","parentId":null,"span":"GET /pedido/:id","evento":"span.inicio"}
{"ts":"...","traceId":"4bf9...","spanId":"a1b2...","parentId":"00f0...","span":"GET estoque","evento":"span.fim","duracaoMs":42}
{"ts":"...","traceId":"4bf9...","spanId":"00f0...","parentId":null,"span":"GET /pedido/:id","evento":"span.fim","duracaoMs":47}
```

Lendo assim já dá para responder a pergunta que o trace existe para responder: dos 47 ms, **42 foram na
chamada a B**. Nenhuma métrica te diria isso; o log sem trace-id também não.

Detalhe que costuma passar batido: o span filho aponta para o **span atual** de A, não para a raiz do trace.
Quando a árvore tem três níveis, apontar tudo para a raiz produz um gráfico chapado, que esconde justamente
o aninhamento onde o tempo se perde.

Na vida real você troca esse código artesanal pelo OpenTelemetry — mas agora sabendo o que ele faz, e
sabendo depurar quando o trace chega quebrado.
:::

### SLO e error budget

[[sli]] é a **medida**: "porcentagem de requisições de `GET /pedidos` com status < 500 e duração < 300 ms".
[[slo]] é a **meta interna** sobre esse indicador: "99,5 % em 30 dias". [[sla]] é o contrato com o cliente,
com multa — e por isso sempre mais frouxo que o SLO.

A parte útil é o [[error-budget]]: `100 % - SLO`. Com 99,5 % em 30 dias, você tem **0,5 %** de orçamento, o
que dá 3 h 39 min de falha permitida no mês. Esse número transforma discussão em decisão:

- orçamento sobrando → dá para arriscar: deploy sexta, migração grande, experimento;
- orçamento queimado → congela feature, a próxima sprint é de confiabilidade.

A política de alerta que vem daí é a **taxa de queima** (*burn rate*): quanto do orçamento está sendo
consumido por hora. Queimando 14× o normal, o mês acaba em 2 dias — página alguém agora. Queimando 2×, abre
um ticket para amanhã. É assim que se alerta em SLO sem acordar ninguém por um pico de 3 minutos.

:::atividade
id: escrever-o-slo-do-seu-servico
titulo: Escrever o SLO do seu serviço (e o que fazer quando queimar)
termos: [slo, error-budget, sli]
nivel: 4
tempoMin: 35
ambiente: papel
entrega:
  tipo: texto
  rotulo: Seu SLO, o orçamento e a política
  minimoChars: 500
dicas:
  - Comece pela jornada do usuário, não pela rota. "Ver meus pedidos" pode envolver três endpoints.
  - Calcule o orçamento em minutos; é o formato que faz o time entender o tamanho da aposta.
criterios:
  - Define o SLI como uma razão de eventos bons sobre eventos válidos, com limiar numérico explícito
  - Escolhe uma janela e justifica (30 dias corridos, semana, etc.)
  - Converte o SLO em orçamento de erro em minutos
  - Diz o que acontece na prática quando o orçamento queima, com dono e prazo
  - Separa o alerta de página (burn rate alto) do alerta de ticket (burn rate baixo e sustentado)
---
Escolha um serviço seu de verdade — o bot de trading, o Trilha RM ou a API do portfólio — e escreva o SLO
dele.

Cubra, obrigatoriamente:

1. **A jornada** que importa para o usuário (uma frase, sem jargão).
2. **O SLI**, como uma fração explícita: o que conta como "bom" e o que conta como "válido" (os
   health checks entram? as requisições canceladas pelo cliente?).
3. **O SLO**: o alvo e a janela.
4. **O orçamento de erro** convertido em minutos daquela janela.
5. **A política**: o que muda quando sobra orçamento, o que muda quando queima, quem decide.
6. **Dois alertas**: um que chama alguém na hora e outro que abre ticket — com os limiares de taxa de
   queima de cada um.

Entregue: o texto completo, com os números calculados.
---
Um exemplo que passa nos critérios, para o Trilha RM:

**Jornada.** "Abrir o app no celular e começar a revisar os termos do dia."

**SLI.** `requisições de GET /api/revisao com status < 500 e duração < 800 ms` ÷ `requisições de
GET /api/revisao que não foram canceladas pelo cliente`. Health check, `/api/saude` e requisições abortadas
ficam **fora** do denominador — senão o número mede a rede do usuário, não o serviço.

**SLO.** 99 % em 30 dias corridos. Janela móvel, não "mês do calendário": incidente do dia 31 não deve ser
perdoado no dia 1.

**Orçamento.** `1 % × 30 dias = 0,3 dia = 7 h 12 min` por janela. Com cerca de 4.000 requisições por dia,
são 1.200 requisições ruins permitidas em 30 dias.

**Política.** Orçamento acima de 50 % no meio da janela: liberado subir mudança de schema e trocar versão do
Node no celular. Abaixo de 25 %: congela funcionalidade nova, a próxima leva é de confiabilidade (cache de
revisão e retry no cloudflared), com dono definido e prazo até o fim da janela. Zerou: só correção, e o
postmortem é obrigatório antes do próximo deploy.

**Alertas.** (a) *Página agora*: taxa de queima ≥ 14× por 5 minutos **e** ≥ 14× na última hora — nessa
velocidade o orçamento de 30 dias acaba em pouco mais de 2 dias, e a dupla janela evita acordar alguém por
um pico de 90 segundos. (b) *Ticket*: taxa de queima ≥ 2× sustentada por 6 horas — não é urgente, mas
consome 10 % do orçamento por dia e precisa entrar no planejamento.

**O que esse exercício ensina.** O número sozinho não vale nada: 99 % sem política é enfeite de slide. O que
muda o comportamento do time é a frase "quando o orçamento cai de 25 %, **isto** acontece, e **esta** pessoa
decide". E repare que 99 % para um app de uso pessoal é honesto — copiar "99,99 %" porque soa profissional
só garante que o SLO será ignorado no primeiro mês.
:::

### Alerta de sintoma, não de causa

O último passo é o que determina se o sistema é sustentável para quem está de plantão.
[[alerting-sintoma-vs-causa]]: alerte no que o **usuário sente**; deixe a causa para o dashboard.

| Alerta de causa (ruim) | Alerta de sintoma (bom) |
| --- | --- |
| CPU acima de 80 % | p99 de `/pedidos` acima de 800 ms por 10 min |
| memória acima de 90 % | taxa de 5xx acima de 1 % por 5 min |
| processo reiniciou | fila de pagamentos parada há 15 min |

CPU em 85 % com o serviço respondendo em 40 ms **não é problema** — é uso eficiente. Mas todo alerta de
causa desses dispara, e cada disparo sem ação corrói a confiança até o time silenciar o canal: é a
[[fadiga-de-alerta]], e o alerta silenciado é pior que o alerta inexistente, porque dá falsa sensação de
cobertura.

Três testes para cada alerta que você criar:

1. **Ação.** Existe algo que a pessoa faz às 3h ao receber isto? Se a resposta é "olhar e voltar a dormir",
   vira dashboard ou relatório.
2. **Usuário.** O usuário percebe? Se ninguém percebe, não é página.
3. **Histórico.** Nas últimas 10 vezes que disparou, quantas eram reais? Abaixo de 50 %, conserte o limiar
   ou apague o alerta.

E não confunda com [[health-readiness-liveness]], que é outra coisa: *liveness* falhando faz o supervisor
**reiniciar** o processo; *readiness* falhando faz o proxy **parar de mandar tráfego**. Ligar o liveness a
uma dependência externa é um jeito conhecido de transformar lentidão do banco em reinício em cascata de
todas as instâncias — o processo estava perfeitamente vivo, só esperando.

:::objetivo Fechou o curso
Você sai com o log carimbado por [[correlation-id]] que atravessa `await`, a distinção entre histogram e
summary na ponta da língua, o p99 calculado na mão, um trace ponta a ponta montado por você, um [[slo]] com
orçamento em minutos e a régua de três perguntas para cada alerta. O próximo passo é o deck
**Observabilidade** e o Treino Especial de blindagem de produção.
:::
