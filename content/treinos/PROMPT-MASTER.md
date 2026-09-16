# PROMPT-MASTER — gerar um Treino Especial novo

Copie **tudo** que está entre as linhas `--- INÍCIO DO PROMPT ---` e `--- FIM DO PROMPT ---` e cole em
qualquer IA (ChatGPT, Gemini, Claude). Troque só o que estiver `<assim>`. O que voltar é um JSON: salve
em `content/treinos/<nn>-<id>.json` e rode `node scripts/validar-treinos.mjs`.

No fim deste arquivo tem a **variante "gere a partir deste deck"**, para quando você quiser colar o JSON
de um deck junto.

--- INÍCIO DO PROMPT ---

Você vai gerar **um arquivo JSON** para o app de estudos "Trilha RM". Responda **apenas com o JSON**, sem
texto antes ou depois, sem cercas de markdown.

## Quem vai usar

Rafael, dev full stack pleno mirando vaga sênior. Stack real dele: **Node.js + Express**, **React em JSX
puro (sem TypeScript, nunca)**, **PostgreSQL**, **Redis**, **Docker**, **Nginx**, **PM2**, Git Bash no
Windows 11 e um celular Android com Termux/PRoot rodando serviços de verdade. Ele faz deploy, mexe em
rede e opera o que escreve. Está treinando para **entrevistas técnicas, inclusive em inglês**.

Ele não quer conteúdo motivacional nem "resumo de artigo". Ele quer exercício que ele **executa fora do
app** (terminal, psql, Docker, papel, gravador de voz) e volta para registrar.

## Escala de nível (0–5) — use exatamente esta

0 desconheço · 1 reconheço · 2 explico · 3 aplico · 4 diagnostico · 5 ensino/defendo

## O que é um Treino Especial

Um **módulo com começo, meio e fim** — uma temporada temática (ex.: "Semana do Event Loop", "Simulado de
entrevista sênior", "Boss fight: debugar produção", "Sprint de inglês técnico") feita de **etapas de
tipos diferentes**. Não é uma lista de flashcards nem um único exercício: é uma sequência que muda o que
ele **consegue fazer** no fim.

## Esquema do JSON — cabeçalho

```json
{
  "id": "kebab-case-unico",
  "titulo": "Nome curto da temporada",
  "subtitulo": "Uma linha de gancho (opcional)",
  "objetivo": "O que o Rafael sai sabendo. Começa com verbo no infinitivo.",
  "nivel": 4,
  "duracaoDias": 7,
  "tempoTotalMin": 260,
  "decks": ["node-internals"],
  "termos": [],
  "tags": ["node", "performance"],
  "preRequisitos": ["O que precisa existir na máquina/cabeça antes"],
  "recompensa": "O que ele destrava ou consegue provar ao terminar.",
  "etapas": []
}
```

- `id`, `titulo`, `objetivo`, `nivel`, `recompensa`, `etapas`: **obrigatórios**.
- `duracaoDias` **ou** `tempoTotalMin`: pelo menos um. Use `duracaoDias` quando as etapas tiverem `dia`.
- `decks` e `termos`: **só ids que eu te passei**. Se eu não passei nenhum, deixe `"decks": []` e
  `"termos": []`. **Nunca invente id de termo ou de deck** — id inventado vira aviso no validador.
- `termos` aceita `"event-loop"` (usa o 1º deck de `decks`) ou `"node-internals/event-loop"`.
- 4 a 14 etapas, com **no mínimo 4 tipos diferentes**, e a **última tem que ser `retrospectiva`**.

## Esquema do JSON — etapas

Cabeçalho comum de toda etapa (`id` kebab-case único, `tipo`, `titulo`, `tempoMin` obrigatórios;
`dia`, `resumo`, `opcional`, `termos` opcionais) + **um objeto com o mesmo nome do `tipo`**:

### `aquecimento` — revisar termos num modo do app

```json
{ "id": "d1-aquecimento", "tipo": "aquecimento", "titulo": "…", "dia": 1, "tempoMin": 12,
  "aquecimento": { "modo": "flashcards", "fonte": "deck:<deckId>", "quantidade": 12, "soVencidos": false, "meta": "…" } }
```
`modo`: `flashcards` | `quiz` | `quiz-inv` | `digitar` | `associar` | `vf` | `explique` | `misto`.
`fonte`: `deck:<deckId>` | `revisao` | `tudo` | `termo:<deckId>/<termoId>`. Se você não recebeu deck
nenhum, use `"fonte": "revisao"`.

### `leitura` — texto curto em markdown

```json
{ "id": "d1-leitura", "tipo": "leitura", "titulo": "…", "tempoMin": 15,
  "leitura": { "markdown": "400 a 4000 caracteres…", "fonte": "nome humano da fonte", "link": "https://…", "perguntas": ["…"] } }
```
`markdown` obrigatório. `\n\n` separa parágrafo, bloco de três crases vira código, `**negrito**` e crase
simples funcionam. Escreva conteúdo denso e específico — nada de introdução genérica.

### `desafio` — exercício prático

```json
{ "id": "d2-desafio", "tipo": "desafio", "titulo": "…", "tempoMin": 25, "termos": ["…"],
  "desafio": {
    "ambiente": "node",
    "nivel": 3,
    "enunciado": "O problema. Termine com 'Entregue: …'",
    "passos": ["…"],
    "entrega": { "tipo": "saida", "esperado": "A\nB", "rotulo": "Cole a saída" },
    "dicas": ["custa nota", "…"],
    "solucao": "gabarito completo, com o porquê",
    "criterios": ["obrigatório quando entrega.tipo = texto"],
    "postmortem": false
  } }
```
`ambiente`: `node` | `bash` | `postgres` | `redis` | `docker` | `nginx` | `browser` | `papel` |
`celular` | `git` | `http`.
Tipos de `entrega`:
- `saida` — `esperado` (string) e opcionalmente `esperadoQualquer` (array de saídas também válidas). A
  comparação ignora caixa e espaços extras. **A saída tem que ser determinística.**
- `numero` — `esperado` (número) + `tolerancia` (fração, ex. `0.1` = ±10 %) ou `min`/`max`.
- `escolha` — `opcoes` (array) + `correta` (índice) ou `corretas` (array de índices).
- `texto` — exige `criterios` (rubrica) e aceita `minimoChars`.
- `checklist` — `itens` (3–8 strings); a nota é a proporção marcada.

### `cronometrado` — X perguntas em Y minutos

```json
{ "id": "d3-relampago", "tipo": "cronometrado", "titulo": "…", "tempoMin": 10,
  "cronometrado": { "minutos": 8, "acertosMin": 6, "criterio": "…",
    "perguntas": [ { "id": "q-fase-io", "pergunta": "…", "resposta": "curta e objetiva", "termos": ["…"] } ] } }
```
5 a 20 perguntas, `resposta` sempre presente (é o gabarito que ele lê para se corrigir).

### `simulado` — entrevista em sequência, PT e/ou EN

```json
{ "id": "sim", "tipo": "simulado", "titulo": "…", "tempoMin": 30,
  "simulado": { "idioma": "misto", "minutosPorPergunta": 5,
    "criterios": ["3 a 6 linhas de rubrica"],
    "perguntas": [ { "id": "q1", "idioma": "en", "pergunta": "…", "contexto": "…",
                     "pontosEsperados": ["3 a 6 pontos"], "respostaModelo": "resposta boa, em 1º pessoa",
                     "seguimento": "a pergunta de follow-up", "termos": ["…"] } ] } }
```
`idioma` da pergunta: `pt` ou `en`. Perguntas em `en` têm **texto, pontos e resposta modelo em inglês**.

### `mao-na-massa` — mini-projeto com critério de pronto

```json
{ "id": "lab", "tipo": "mao-na-massa", "titulo": "…", "tempoMin": 60,
  "mao-na-massa": { "contexto": "…", "stack": ["node", "express"], "tempoCaixa": 60,
    "entregavel": "o que sobra no disco",
    "passos": ["3 a 10 passos na ordem"],
    "criterioPronto": ["3 a 8 itens VERIFICÁVEIS — é isso que vira a nota"] } }
```

### `ensinar` — explicar para outra pessoa (degrau 5)

```json
{ "id": "ensinar", "tipo": "ensinar", "titulo": "…", "tempoMin": 40,
  "ensinar": { "publico": "para quem ele explica", "formato": "audio", "duracaoMin": 5,
    "roteiro": ["…"], "criterios": ["3 a 6 itens"], "minimoChars": 400 } }
```
`formato`: `audio` | `video` | `texto` | `ao-vivo`.

### `retrospectiva` — fechamento (sempre a última etapa)

```json
{ "id": "retro", "tipo": "retrospectiva", "titulo": "…", "tempoMin": 15,
  "retrospectiva": { "perguntas": ["3 a 6 perguntas de fechamento"],
    "proximoPasso": "o que fazer dependendo da nota", "notaFinal": true } }
```

## Regras que você NÃO pode quebrar

1. **Só JSON na resposta.** Nada de explicação, comentário ou cerca de markdown.
2. **PT-BR** em tudo, exceto o que é propositalmente em inglês (perguntas `idioma: "en"`).
3. **Código só em JavaScript/Node.** Nunca TypeScript, nunca `.ts`, nunca anotação de tipo, nunca React
   com TS. Nada de framework que ele não usa.
4. **Gabarito determinístico e testado.** Se a saída de um script depender de horário, IP, ordem de hash
   ou velocidade da máquina, **não use `entrega.tipo: "saida"`** — troque por `numero` com tolerância ou
   por `texto` com critérios. Se você não tem certeza da saída exata, não invente: mude o tipo de entrega.
5. **Atividade resolvida FORA do app.** O app só registra. Nada de "clique aqui no app" ou "use o
   editor embutido" — ele não existe.
6. **Nunca invente id de termo ou de deck.** Use exatamente os ids que eu colei; se não colei nenhum,
   deixe `"termos": []` e `"decks": []` (o treino funciona igual, só não avalia SM-2).
7. Ids em kebab-case, sem acento, únicos dentro do arquivo.
8. 4–14 etapas, no mínimo **4 tipos diferentes**, terminando em `retrospectiva`.
9. Nada de conteúdo genérico: cada etapa tem que exigir uma entrega que não existia antes. Prefira
   **medir** a "implementar" (`--cpu-prof`, `EXPLAIN ANALYZE`, `autocannon`, `curl -w`, heap snapshot).
10. `tempoMin` honesto; a soma das etapas tem que bater com `tempoTotalMin` (ou com `duracaoDias`).

## Exemplo curto e COMPLETO (é um arquivo válido de verdade)

```json
{
  "id": "sprint-ingles-tecnico",
  "titulo": "Sprint de inglês técnico",
  "subtitulo": "3 dias falando sozinho até a frase sair inteira",
  "objetivo": "Responder uma pergunta técnica em inglês por 2 minutos sem travar, usando trade-off explícito.",
  "nivel": 3,
  "duracaoDias": 3,
  "tempoTotalMin": 95,
  "decks": [],
  "termos": [],
  "tags": ["ingles", "entrevista"],
  "preRequisitos": ["Gravador de voz do celular", "Fone para ouvir a própria gravação sem vergonha"],
  "recompensa": "Você tem três gravações suas em inglês e sabe qual das três você mandaria para um recrutador.",
  "etapas": [
    {
      "id": "d1-aquecimento",
      "tipo": "aquecimento",
      "titulo": "Aquecer as expressões que travam",
      "dia": 1,
      "tempoMin": 10,
      "aquecimento": { "modo": "digitar", "fonte": "revisao", "quantidade": 10, "meta": "Leia cada uma em voz alta antes de responder." }
    },
    {
      "id": "d1-leitura",
      "tipo": "leitura",
      "titulo": "Ler o esqueleto de resposta que funciona",
      "dia": 1,
      "tempoMin": 15,
      "leitura": {
        "markdown": "Toda boa resposta técnica em inglês cabe em quatro movimentos: **clarify**, **position**, **trade-off**, **measure**.\n\n1. *Clarify* — uma pergunta de volta antes de responder: \"Before I answer, is this read-heavy or write-heavy?\". Isso compra 10 segundos e mostra senioridade.\n2. *Position* — a escolha, em uma frase: \"I would start with a simple TTL cache\".\n3. *Trade-off* — o custo, explícito: \"The trade-off here is correctness for latency\".\n4. *Measure* — como você saberia se acertou: \"I would watch the hit rate and the p99\".\n\nDecore os quatro movimentos, não as frases. Quando travar, diga \"let me think out loud for a second\" — é uma frase que todo entrevistador aceita e que te dá tempo de montar o movimento seguinte.",
        "fonte": "Esqueleto de resposta (clarify / position / trade-off / measure)",
        "perguntas": ["Qual é o movimento que você mais esquece quando está nervoso?"]
      }
    },
    {
      "id": "d2-simulado",
      "tipo": "simulado",
      "titulo": "Responder 2 perguntas em inglês, gravando",
      "dia": 2,
      "tempoMin": 30,
      "simulado": {
        "idioma": "en",
        "minutosPorPergunta": 5,
        "criterios": [
          "Usa os quatro movimentos na ordem",
          "Diz um trade-off explícito sem ser cobrado",
          "Frases curtas; nenhuma tradução literal do português",
          "Não trava por mais de 3 segundos sem usar uma frase de ponte"
        ],
        "perguntas": [
          {
            "id": "q1-cache",
            "idioma": "en",
            "pergunta": "Would you add a cache in front of this endpoint? Why or why not?",
            "contexto": "Read-heavy endpoint, 2k req/s, data changes once a minute.",
            "pontosEsperados": ["Asks how stale the data can be", "Names a TTL and why", "States the trade-off explicitly", "Says what to measure"],
            "respostaModelo": "Before I answer, how stale can this data be? If a minute of staleness is fine, I would start with a TTL cache of about thirty seconds. The trade-off here is correctness for latency: every cached read might be slightly wrong. I would measure the hit rate and the p99 before and after — under sixty percent hit rate, the cache is mostly overhead.",
            "seguimento": "What happens the moment the cache restarts?"
          },
          {
            "id": "q2-incident",
            "idioma": "en",
            "pergunta": "Tell me about a time you broke production. What did you do?",
            "contexto": "Behavioural question, 2 minutes.",
            "pontosEsperados": ["First person, clear ownership", "One measurable number", "Rollback before root cause", "A process change at the end"],
            "respostaModelo": "I shipped a change that silently stopped a background job. The symptom was zero orders overnight, with no errors. I rolled back first to stop the bleeding, then found the root cause the next morning: a lock that was never released. What changed afterwards is the part I care about — we now alert on the symptom, zero orders in six hours, not on the cause.",
            "seguimento": "What would you have done differently at 3am?"
          }
        ]
      }
    },
    {
      "id": "d3-ensinar",
      "tipo": "ensinar",
      "titulo": "Gravar a explicação de um conceito em inglês",
      "dia": 3,
      "tempoMin": 25,
      "ensinar": {
        "publico": "um colega brasileiro que vai ter a mesma entrevista na semana que vem",
        "formato": "audio",
        "duracaoMin": 4,
        "roteiro": ["Os quatro movimentos", "Onde você travou no dia 2", "A frase de ponte que te salvou"],
        "criterios": ["Fala em inglês do início ao fim", "Dá um exemplo concreto seu", "Termina com um conselho acionável"],
        "minimoChars": 400
      }
    },
    {
      "id": "d3-retro",
      "tipo": "retrospectiva",
      "titulo": "Ouvir as três gravações e escolher",
      "dia": 3,
      "tempoMin": 15,
      "retrospectiva": {
        "perguntas": [
          "Qual das gravações você mandaria para um recrutador, e por quê?",
          "Quantas vezes você travou por falta de palavra, e não de conteúdo?",
          "Qual movimento (clarify/position/trade-off/measure) você esqueceu mais vezes?"
        ],
        "proximoPasso": "Nota abaixo de 3: repita só o simulado daqui a 2 dias com perguntas novas.",
        "notaFinal": true
      }
    }
  ]
}
```

## Checklist final — rode antes de responder

Confira **item por item** e só então responda com o JSON:

1. [ ] A resposta é **só JSON válido** (nenhum texto fora, nenhuma cerca de markdown, nenhuma vírgula
       sobrando, todas as aspas fechadas).
2. [ ] Tem `id`, `titulo`, `objetivo`, `nivel` (1–5), `recompensa` e `etapas`.
3. [ ] Tem `duracaoDias` **ou** `tempoTotalMin`, e a soma dos `tempoMin` das etapas bate com ele.
4. [ ] Entre 4 e 14 etapas; **pelo menos 4 tipos diferentes**; a última é `retrospectiva`.
5. [ ] Todo `id` (treino, etapa, pergunta) é kebab-case, sem acento, e único no arquivo.
6. [ ] Toda etapa tem o objeto do próprio tipo com o mesmo nome (ex.: `"tipo": "ensinar"` →
       chave `"ensinar"`).
7. [ ] Nenhum id de termo ou deck inventado: ou são os que o Rafael colou, ou os arrays estão vazios.
8. [ ] Nenhum `entrega.tipo: "saida"` com resultado que dependa de tempo, IP, rede ou ordem de hash — e
       você **conferiu mentalmente** a saída de cada script linha a linha.
9. [ ] Todo `desafio` tem `solucao`; todo `desafio` com entrega `texto` tem `criterios`.
10. [ ] Todo `cronometrado` tem `resposta` em cada pergunta; todo `simulado` tem `pontosEsperados` e
        `respostaModelo` em cada pergunta.
11. [ ] Zero TypeScript, zero tecnologia fora da stack dele, zero atividade que exija algo dentro do app.
12. [ ] Cada etapa exige uma entrega concreta — se alguma dá para "concluir" só lendo, reescreva.

## O treino que eu quero

Tema: `<tema do treino>`
Formato: `<7 dias | sessão única de 90 min | 3 dias | boss fight de 2 h>`
Nível de saída: `<1 a 5>`
Foco: `<o que eu quero conseguir fazer no fim>`
Ids de termos que eu quero cobrir (use SÓ estes; se estiver vazio, deixe `termos: []`):

```
<cole aqui os ids, um por linha, no formato deckId/termoId — ou deixe vazio>
```

--- FIM DO PROMPT ---

---

## Variante: "gere a partir deste deck"

Use quando quiser um treino amarrado a um deck inteiro. Cole o prompt acima **inteiro** e, no lugar da
seção "O treino que eu quero", cole esta:

```
## O treino que eu quero

Gere o treino a partir deste deck. O JSON do deck vem abaixo: leia os campos `id` (do deck), `titulo` e
a lista `termos[]` (cada termo tem `id`, `termo`, `definicao`, `profundidade`, `exemplo`,
`perguntaEntrevista`, `nivelAlvo`).

Regras extras desta variante:
- `"decks": ["<o id do deck colado>"]`.
- Use SOMENTE ids que aparecem em `termos[].id` do deck colado. Nada de inventar.
- Escolha de 6 a 12 termos: os de `nivelAlvo` mais alto e os que o deck trata com mais profundidade.
  Distribua-os pelas etapas (cada etapa cobre 1–3 termos, no campo `termos` da etapa).
- O `aquecimento` aponta para `"fonte": "deck:<id do deck>"`.
- Aproveite os campos `perguntaEntrevista` / `perguntaEntrevistaEN` dos termos como matéria-prima das
  perguntas do `simulado` e do `cronometrado` — reescrevendo, não copiando literal.
- Formato: <7 dias | sessão única de 90 min>. Nível de saída: <1 a 5>.

Deck:

```json
<cole aqui o conteúdo de content/decks/<arquivo>.json>
```
```

Depois de colar a resposta em `content/treinos/`, rode:

```bash
node scripts/validar-treinos.mjs
```

Se aparecer `termo "x" não existe`, a IA inventou um id: apague o id da lista (ou troque pelo certo) —
o treino continua funcionando, só não avalia SM-2 naquele termo.
