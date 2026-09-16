---
id: http-do-zero
deck: http-networking
fase: 1
ordem: 1
nivel: 3
tags: [http, redes, node, producao]
descricao: O que realmente acontece entre digitar a URL e o primeiro byte chegar — e o que quebra em produção.
---

# HTTP do zero

Este curso reconstrói, camada por camada, o caminho de um request: [[dns]], [[tcp]], [[tls-handshake]],
proxy, aplicação e resposta. Nada de decorar sigla: cada módulo termina com você **medindo** alguma coisa
no seu próprio terminal.

:::objetivo Ao terminar você consegue
- desenhar o caminho completo de um request e dizer onde vai o tempo;
- explicar por que keep-alive existe e provar que ele está funcionando;
- diagnosticar um timeout em produção sem chutar: sintoma, evidência, causa.
:::

Pré-requisitos: Node 22 no PATH e `curl`. Nada mais.

## O caminho de um request

Antes de otimizar qualquer coisa, é preciso saber **o que acontece em ordem** — e quanto cada passo custa.

### Do nome ao pacote

Digitar `rafaelmr.com.br` no navegador não abre conexão nenhuma. Primeiro é preciso descobrir um IP, e
isso é trabalho do [[dns]].

A resolução é recursiva: o resolver local pergunta ao root, que aponta o TLD, que aponta o servidor
autoritativo do domínio. Cada resposta vem com um **TTL** — o tempo que aquela resposta pode ficar em
cache. TTL baixo dá agilidade para trocar de servidor; TTL alto economiza ida e volta.

Só depois disso começa o [[tcp]]: o famoso three-way handshake.

1. o cliente manda `SYN`
2. o servidor responde `SYN+ACK`
3. o cliente confirma com `ACK`

Um RTT inteiro se foi antes de o primeiro byte de HTTP existir.

| Etapa | Custo típico | Dá para eliminar? |
| --- | --- | --- |
| DNS | 10–60 ms | sim, com cache/TTL |
| TCP handshake | 1 RTT | sim, com conexão reusada |
| TLS 1.3 | 1 RTT | sim, com resumption |
| Request/response | 1 RTT | não |

> Latência é distância; banda é largura de cano. Comprar banda não conserta um site lento por RTT.
> Veja [[latencia-vs-banda]].

:::nota Onde isso te pega
Um cliente HTTP que abre conexão nova a cada chamada paga DNS + TCP + TLS **toda vez**. É o erro mais
caro e mais comum em integração entre serviços.
:::

:::atividade
id: contar-o-tempo-ate-o-primeiro-byte
titulo: Contar o tempo até o primeiro byte
termos: [latencia-vs-banda, tcp, tls-handshake]
nivel: 2
tempoMin: 10
ambiente: papel
entrega:
  tipo: numero
  esperado: 150
  tolerancia: 0
  unidade: ms
  rotulo: Tempo até o primeiro byte, em ms
dicas:
  - Um RTT é uma ida e volta completa. Conte quantos RTTs cada etapa gasta.
  - TLS 1.3 gasta 1 RTT, não 2 (isso é TLS 1.2).
criterios:
  - Somou DNS + 1 RTT (TCP) + 1 RTT (TLS 1.3) + 1 RTT (request/response)
---
Um cliente vai buscar `GET /api/pedidos` em um servidor com **RTT de 40 ms**. A resolução [[dns]] não
está em cache e custa **30 ms**. A conexão é nova (sem pool), com TLS 1.3 e sem session resumption.

Some, em milissegundos, o tempo desde a chamada até o **primeiro byte da resposta** chegar. Ignore o
tempo de processamento no servidor.

Entregue: só o número, em ms.
---
`30 (DNS) + 40 (TCP handshake) + 40 (TLS 1.3) + 40 (request/response) = 150 ms`.

O ponto do exercício: **três quartos desse tempo somem** se a conexão já estivesse aberta num pool.
Trocar o servidor por uma máquina mais rápida não muda nada aqui — é tudo ida e volta de rede.

Com TLS 1.2 seriam 2 RTTs de handshake e o total iria a 190 ms.
:::

### Quando o HTTP finalmente fala

Com a conexão de pé, o protocolo entra. E aí a versão importa muito.

No [[http1-1]], uma conexão carrega **um request por vez**. Se o primeiro demora, os outros esperam na
fila: é o head-of-line blocking. O paliativo histórico foi abrir 6 conexões por origem.

O [[http2]] resolve isso com multiplexação: vários streams na **mesma** conexão TCP, com os headers
comprimidos por HPACK. Só que o head-of-line blocking não sumiu — ele desceu de camada: se um pacote TCP
se perde, **todos** os streams param, porque TCP entrega em ordem.

O [[http3-quic]] corta esse nó trocando TCP por QUIC sobre UDP, com streams independentes.

```js
// HTTP/1.1: o segundo request espera o primeiro terminar na mesma conexão
const inicio = Date.now()
await fetch('http://localhost:3000/lento') // 2 s
await fetch('http://localhost:3000/rapido') // 5 ms
console.log(Date.now() - inicio) // ~2005
```

:::alerta Cuidado com a conclusão fácil
"HTTP/2 é mais rápido" é meia verdade. Em rede boa e poucos objetos, a diferença é ruído. O ganho real
aparece com muitos recursos pequenos e latência alta.
:::

:::atividade
id: onde-mora-o-head-of-line
titulo: Onde mora o head-of-line blocking
termos: [http2, http1-1, http3-quic]
nivel: 3
tempoMin: 10
ambiente: papel
entrega:
  tipo: escolha
  rotulo: Qual afirmação está correta?
  opcoes:
    - HTTP/2 elimina o head-of-line blocking em todas as camadas, porque multiplexa streams.
    - HTTP/2 resolve o bloqueio na camada HTTP, mas uma perda de pacote no TCP ainda trava todos os streams.
    - HTTP/1.1 não tem head-of-line blocking porque abre seis conexões por origem.
    - HTTP/3 tem o mesmo problema do HTTP/2, porque QUIC também entrega em ordem.
  correta: 1
dicas:
  - Pergunte-se em que camada está a fila: na do protocolo HTTP ou na do transporte?
criterios:
  - Distingue bloqueio na camada HTTP do bloqueio na camada de transporte
---
Um time migrou a API de HTTP/1.1 para HTTP/2 e mediu ganho de 3 % numa rede com 1 % de perda de pacotes.
Ficaram decepcionados.

Escolha a afirmação correta sobre head-of-line blocking.
---
A resposta é a **segunda**.

O [[http2]] multiplexa streams na mesma conexão TCP, então acabou a fila *na camada HTTP*. Mas o TCP
continua entregando bytes **em ordem**: perdeu um segmento, o kernel segura tudo o que veio depois até a
retransmissão chegar — e isso trava todos os streams de uma vez. Com 1 % de perda, o HTTP/2 chega a ficar
*pior* que seis conexões paralelas de HTTP/1.1, porque agora tudo depende de uma conexão só.

É exatamente esse nó que o [[http3-quic]] desata: QUIC roda sobre UDP e cada stream tem o seu próprio
controle de ordem, então uma perda só atrasa o stream afetado.
:::

## Conexões que você não vê

A maior parte dos problemas de produção não está no seu código de rota — está no que acontece com o
soquete antes e depois dele.

### Portas, sockets e TIME_WAIT

Uma conexão TCP é identificada por quatro valores: IP de origem, porta de origem, IP de destino e porta de
destino. Como o cliente não escolhe a porta, o kernel entrega uma **porta efêmera** — ver
[[socket-porta-ephemeral]].

Esse intervalo é finito (tipicamente ~28 mil portas). Cada conexão fechada pelo lado que enviou o `FIN`
fica em [[time-wait]] por cerca de 60 segundos antes de a porta voltar ao pool.

:::exemplo A conta que dói
Um serviço que abre 1000 conexões novas por segundo e as fecha acumula 60 000 sockets em TIME_WAIT.
Acima do limite de portas efêmeras, o próximo `connect()` falha com `EADDRNOTAVAIL` — e o log vai dizer
"não consegui conectar", como se a rede tivesse caído.
:::

A correção quase nunca é aumentar o limite: é **parar de abrir conexão nova**.

### Keep-alive e pool de conexões

É aqui que o [[connection-pool]] entra. Em Node, um `http.Agent` com `keepAlive: true` guarda os sockets
abertos e reusa em vez de refazer DNS + TCP + TLS.

O detalhe importante: o agente **padrão** do módulo `http` do Node tem `keepAlive: true` desde a v19, mas
qualquer cliente que crie o seu próprio agente sem o flag volta ao comportamento antigo — e ninguém
percebe, porque tudo continua funcionando, só que mais devagar e queimando portas.

Vale ler também [[half-open-e-keepalive-tcp]]: o keep-alive do HTTP (reusar a conexão) não é o mesmo que o
`SO_KEEPALIVE` do TCP (detectar conexão morta).

:::atividade
id: provar-que-o-keep-alive-reusa
titulo: Provar que o keep-alive está reusando o socket
termos: [connection-pool, socket-porta-ephemeral, time-wait]
nivel: 3
tempoMin: 20
ambiente: node
entrega:
  tipo: saida
  rotulo: Cole as duas linhas que o script imprimiu
  esperado: |
    keepAlive: 1
    sem keepAlive: 3
dicas:
  - A porta de origem é `req.socket.remotePort` do lado do servidor.
  - Se der 3 nos dois casos, você criou o Agent mas esqueceu de passá-lo no `http.request`.
criterios:
  - Rodou o script e entendeu que o número é a quantidade de portas efêmeras distintas usadas
---
Salve o script abaixo como `keepalive.js` e rode com `node keepalive.js`. Ele sobe um servidor local,
faz **três** requests com um agente `keepAlive: true` e mais três com `keepAlive: false`, contando quantas
**portas de origem distintas** apareceram.

```js
const http = require('node:http')

const portas = { com: new Set(), sem: new Set() }
let fase = 'com'

const srv = http.createServer((req, res) => {
  portas[fase].add(req.socket.remotePort)
  res.end('ok')
})

function pedir(porta, agent) {
  return new Promise((ok) => {
    const req = http.request({ port: porta, path: '/', agent }, (res) => {
      res.resume()
      res.on('end', ok)
    })
    req.end()
  })
}

srv.listen(0, async () => {
  const porta = srv.address().port
  const comAgente = new http.Agent({ keepAlive: true })
  for (let i = 0; i < 3; i++) await pedir(porta, comAgente)
  fase = 'sem'
  const semAgente = new http.Agent({ keepAlive: false })
  for (let i = 0; i < 3; i++) await pedir(porta, semAgente)
  console.log('keepAlive:', portas.com.size)
  console.log('sem keepAlive:', portas.sem.size)
  comAgente.destroy()
  srv.close()
})
```

Antes de rodar, **escreva no papel** que números você espera. Depois rode.

Entregue: as duas linhas exatas da saída.
---
A saída é:

```
keepAlive: 1
sem keepAlive: 3
```

Com `keepAlive: true` o agente devolve o mesmo socket ao pool depois de cada resposta, então os três
requests saem da **mesma** porta efêmera: um handshake só. Sem keep-alive, cada request abre e fecha uma
conexão — três portas, três handshakes e três sockets indo para [[time-wait]].

Multiplique por mil requests por segundo e você tem a diferença entre um serviço estável e um serviço que
morre com `EADDRNOTAVAIL` sem nenhuma mudança no código de negócio.

Para ver o mesmo efeito fora do Node: `ss -tan | grep TIME-WAIT | wc -l` antes e depois de um teste de
carga.
:::

## Quando dá errado em produção

Agora a parte que aparece no plantão.

### Timeouts, retries e idempotência

Todo cliente HTTP tem dois relógios diferentes, e confundi-los custa caro — é o
[[connection-timeout-vs-read-timeout]]:

- **connect timeout**: quanto tempo espero para a conexão ficar de pé. Deve ser curto (1–3 s).
- **read timeout**: quanto tempo espero pelos bytes da resposta. Depende do que a rota faz.

Sem timeout explícito, o padrão do sistema costuma ser "minutos" — e um serviço lento vira um serviço
travado, porque o pool enche de requests pendurados.

Retry parece a correção óbvia, mas [[retries-idempotencia]] avisa: repetir um `POST` que já foi
processado cria o pedido duas vezes. A regra prática:

1. só repita o que é idempotente (`GET`, `PUT`, `DELETE`) ou o que carrega uma chave de idempotência;
2. use backoff exponencial **com jitter**, nunca retry imediato;
3. limite o total: 2 tentativas extras, não 10.

:::alerta O efeito manada
Retry sem jitter sincroniza todos os clientes no mesmo instante. O serviço que estava só lento leva uma
onda perfeitamente alinhada e cai de vez. A correção de 3 linhas (`delay * (0.5 + Math.random())`)
costuma valer mais que toda a otimização do dia.
:::

:::atividade
id: postmortem-do-timeout
titulo: Postmortem — a fila que encheu depois do retry
termos: [connection-timeout-vs-read-timeout, retries-idempotencia, connection-pool]
nivel: 4
tempoMin: 30
ambiente: papel
postmortem: true
entrega:
  tipo: texto
  rotulo: Seu postmortem
  minimoChars: 400
dicas:
  - Comece pelos números que você TEM (p99, taxa de erro, tamanho do pool), não pelos que gostaria de ter.
  - Pergunte quantas conexões o pool tinha e quanto tempo cada uma ficou presa.
criterios:
  - Separa sintoma (o que o usuário viu) de causa (o que aconteceu no sistema)
  - Cita números concretos como evidência, não adjetivos
  - Identifica que o retry multiplicou a carga sobre um serviço já degradado
  - Distingue connect timeout de read timeout na correção proposta
  - Propõe uma mudança de processo, não só uma mudança de código
---
**O incidente.** Serviço A chama o serviço B por HTTP. B começou a responder em 8 s (normal: 120 ms)
porque uma query ficou lenta. O cliente de A não tinha read timeout e tinha retry automático de até 5
tentativas, sem backoff. Em 4 minutos, A parou de responder **a todas** as rotas — inclusive as que nem
chamam B. O pool de conexões de A tem 50 sockets.

Escreva o postmortem no formato da casa:

**sintoma → evidência (números) → causa → correção → o que muda no processo**

Entregue: o texto do postmortem, com pelo menos um número calculado por você (por exemplo: quantos
requests simultâneos bastam para esgotar o pool de 50 conexões quando cada um segura o socket por 8 s).
---
Um postmortem que passa nos critérios diz, em substância:

**Sintoma.** Todas as rotas de A passaram a dar timeout para o usuário, não só as que dependem de B.

**Evidência.** B com p99 de 8 s (baseline 120 ms). Pool de A com 50 conexões. Retry de até 5 tentativas
sem backoff, ou seja, **até 6 chamadas por request de usuário**. Com 8 s por tentativa, cada request de
usuário podia segurar um socket por até 48 s. Bastam ~7 requests por segundo tocando B para manter as 50
conexões ocupadas o tempo todo (50 sockets ÷ 8 s ≈ 6,25 requests/s de vazão). Tudo acima disso enfileira.

**Causa.** O recurso escasso não é CPU nem memória: é o **pool de conexões**, compartilhado por todas as
rotas. Sem read timeout, uma chamada lenta segura o socket indefinidamente; o retry sem backoff
multiplicou por 6 a carga sobre um serviço que já estava degradado (efeito manada) e converteu uma
degradação parcial em queda total.

**Correção.** (1) read timeout explícito, acima do p99 saudável e bem abaixo do ponto de dor — 1 s aqui;
(2) connect timeout separado e curto, 1 s; (3) no máximo 2 tentativas extras, com backoff exponencial e
jitter, e só para chamadas idempotentes; (4) pool ou bulkhead **por dependência**, para que B não consiga
consumir os sockets das rotas que não usam B; (5) circuit breaker que para de chamar B quando a taxa de
erro passa do limite.

**Processo.** Timeout deixa de ser opcional: vira default do cliente HTTP compartilhado, com o valor
declarado por dependência no code review. Alerta sobre **saturação do pool** (sockets em uso / tamanho),
não só sobre latência — foi esse o número que teria dado o diagnóstico em 30 segundos.
:::

### Cache e compressão: o request que não acontece

O request mais rápido é o que não sai. [[cache-http]] governa isso com dois mecanismos que se completam:

- `Cache-Control` define **por quanto tempo** a resposta vale sem perguntar nada a ninguém;
- `ETag` + `If-None-Match` permitem a revalidação barata: o servidor responde `304 Not Modified` sem
  corpo quando nada mudou.

A [[compressao-http]] ataca o outro lado: menos bytes na rede. Brotli ganha de gzip em texto, mas comprimir
já-comprimido (JPEG, ZIP) só gasta CPU. E a decisão de **onde** comprimir — no app ou no
[[reverse-proxy]] — costuma ser mais importante que a escolha do algoritmo.

:::nota Regra simples
Estático com hash no nome: `Cache-Control: public, max-age=31536000, immutable`.
HTML e API: `no-cache` (revalide sempre) em vez de `no-store` (nunca guarde), a menos que o conteúdo seja
sensível de verdade.
:::

### Ver a rede

Diagnóstico bom é medição, não palpite. O kit mínimo de [[observabilidade-de-rede]]:

| Ferramenta | Responde |
| --- | --- |
| `curl -w` | onde foi o tempo de UM request (DNS, connect, TLS, TTFB) |
| `ss -tan` | quantas conexões existem e em que estado (ESTAB, TIME-WAIT) |
| `mtr` | em que salto da rota está a perda |
| `tcpdump` | o que exatamente trafegou, quando nada mais explica |

O comando que resolve mais brigas de "é a rede" versus "é o app":

```bash
curl -w 'dns=%{time_namelookup} connect=%{time_connect} tls=%{time_appconnect} ttfb=%{time_starttransfer} total=%{time_total}\n' -o /dev/null -s https://rafaelmr.com.br
```

Se `ttfb` é grande mas `connect` e `tls` são pequenos, a rede está boa e a demora é sua. Fecha o assunto.

:::objetivo Fechou o curso
Você já sabe montar o caminho completo ([[caminho-completo-request]]), provar onde o tempo vai e escrever
o postmortem de um timeout. O próximo passo natural são os exercícios do laboratório no deck
**HTTP e redes por dentro**.
:::
