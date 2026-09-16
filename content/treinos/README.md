# content/treinos/

**Treino Especial** = um _módulo_ de crescimento com começo, meio e fim. Não é deck (decorar termo) nem
prática solta (um exercício): é uma **temporada** temática — "Semana do Event Loop", "Simulado de
entrevista sênior", "Sprint de inglês técnico" — montada com **etapas de tipos diferentes**, na ordem,
para sair do lado de lá sabendo algo que não sabia.

Um arquivo por treino: `content/treinos/<nn>-<id>.json`. O nome do arquivo é livre (o que vale é o `id`
de dentro), mas prefixar com número mantém a pasta ordenada. O servidor recarrega quando o mtime muda —
**não precisa reiniciar nada: cole o arquivo na pasta e recarregue a página**.

Quem escreve o JSON é você ou qualquer IA: mande o `PROMPT-MASTER.md` desta pasta para o ChatGPT/Gemini/Claude
e cole o resultado aqui.

---

## Esquema — cabeçalho

```json
{
  "id": "semana-event-loop",
  "titulo": "Semana do Event Loop",
  "subtitulo": "7 dias medindo o que o Node faz enquanto seu código espera",
  "objetivo": "Explicar as fases do event loop olhando para uma medição sua, e defender por que um endpoint travou.",
  "nivel": 4,
  "duracaoDias": 7,
  "tempoTotalMin": 260,
  "decks": ["node-internals", "concorrencia-performance"],
  "termos": ["node-internals/event-loop", "node-internals/fases-event-loop"],
  "tags": ["node", "performance", "diagnostico"],
  "preRequisitos": ["Node 22 instalado", "Deck node-internals visto ao menos uma vez"],
  "recompensa": "Você consegue abrir um flame graph e dizer, em uma frase, onde o loop parou — e provar.",
  "etapas": []
}
```

| campo | obrigatório | regras |
|---|---|---|
| `id` | sim | kebab-case, único na pasta. É o que aparece na URL (`/treino/<id>`) |
| `titulo` | sim | nome da temporada, curto (até ~50 caracteres) |
| `subtitulo` | não | uma linha de gancho |
| `objetivo` | sim | **o que o Rafael sai sabendo** — começa com verbo no infinitivo ("Explicar…", "Diagnosticar…") |
| `nivel` | sim | 1–5 na escala: 0 desconheço · 1 reconheço · 2 explico · 3 aplico · 4 diagnostico · 5 ensino/defendo. É o nível **de saída** do treino |
| `duracaoDias` | um dos dois | inteiro 1–30. Use quando o treino é por dias (aí as etapas usam `dia`) |
| `tempoTotalMin` | um dos dois | inteiro. Use quando é uma sessão só (simulado, boss fight). Se faltar, o carregador soma os `tempoMin` das etapas |
| `decks` | não | ids de decks existentes. Id inexistente vira aviso e é descartado |
| `termos` | não | ids de termos: `"event-loop"` (usa o 1º deck de `decks`) ou `"node-internals/event-loop"`. Ids inválidos viram aviso e são descartados. **Pode ser `[]`** |
| `tags` | não | até 8, minúsculas |
| `preRequisitos` | não | até 6 linhas: o que precisa existir na máquina/cabeça antes de começar |
| `recompensa` | sim | frase do que ele **destrava/prova** ao terminar. Aparece na tela final |
| `etapas` | sim | 4–14 etapas, na ordem de execução |

---

## Esquema — etapas

Toda etapa tem o mesmo cabeçalho e **um corpo com o nome do seu tipo**:

```json
{
  "id": "d1-aquecimento",
  "tipo": "aquecimento",
  "titulo": "Reconhecer as 6 fases",
  "dia": 1,
  "tempoMin": 12,
  "resumo": "Uma linha dizendo o que essa etapa cobra.",
  "opcional": false,
  "termos": ["fases-event-loop"],
  "aquecimento": { "modo": "flashcards", "fonte": "deck:node-internals", "quantidade": 12 }
}
```

| campo | obrigatório | regras |
|---|---|---|
| `id` | sim | kebab-case, único **dentro do treino** |
| `tipo` | sim | um de: `aquecimento` · `leitura` · `desafio` · `cronometrado` · `simulado` · `mao-na-massa` · `ensinar` · `retrospectiva` |
| `titulo` | sim | curto, começa com verbo |
| `dia` | não | inteiro ≥ 1, só faz sentido com `duracaoDias`. Etapas do mesmo dia aparecem agrupadas |
| `tempoMin` | sim | estimativa honesta (5–120) |
| `resumo` | não | uma linha; aparece na lista de etapas |
| `opcional` | não | `true` = não conta para "treino concluído" nem para a nota final |
| `termos` | não | ids de termos (mesmo formato do cabeçalho). Vazio = herda os `termos` do treino. O **primeiro** é o termo principal: é nele que a nota vira SM-2 |
| `<tipo>` | sim | objeto com o corpo do tipo, com **o mesmo nome do `tipo`** (`mao-na-massa` → chave `"mao-na-massa"`) |

### 1. `aquecimento` — revisar N termos em um modo do app

```json
"aquecimento": {
  "modo": "flashcards",
  "fonte": "deck:node-internals",
  "quantidade": 12,
  "soVencidos": false,
  "meta": "Passar por todos sem olhar a resposta antes de tentar."
}
```

| campo | obrigatório | regras |
|---|---|---|
| `modo` | sim | `flashcards` · `quiz` · `quiz-inv` · `digitar` · `associar` · `vf` · `explique` · `misto` |
| `fonte` | sim | `deck:<deckId>` · `revisao` (só o que venceu) · `tudo` · `termo:<deckId>/<termoId>` |
| `quantidade` | não | 5–50, default 12 |
| `soVencidos` | não | `true` acrescenta `&so=vencidos` |
| `meta` | não | uma linha do que perseguir |

O app monta o link `/estudar/<modo>?fonte=<fonte>&n=<quantidade>[&so=vencidos]`. **Cada termo já é avaliado
lá dentro pelo SM-2** — por isso a etapa em si não avalia termo nenhum de novo (ver "Avaliação" abaixo).

### 2. `leitura` — texto curto em markdown

```json
"leitura": {
  "markdown": "O event loop não é uma fila: são **6 fases**…",
  "fonte": "Node.js docs — Event Loop, Timers, and process.nextTick()",
  "link": "https://nodejs.org/en/learn/asynchronous-work/event-loop-timers-and-nexttick",
  "perguntas": ["Qual fase drena a fila do libuv?"]
}
```

| campo | obrigatório | regras |
|---|---|---|
| `markdown` | sim | 400–4000 caracteres. `\n\n` separa parágrafo; bloco de três crases vira `<pre>`; `**negrito**` e crase simples para código funcionam |
| `fonte` | não | de onde veio (nome humano) |
| `link` | não | URL, só `http(s)` |
| `perguntas` | não | até 4 perguntas de checagem, respondidas de cabeça (não gravam nada) |

### 3. `desafio` — exercício prático, mesmo esquema de `content/praticas`

```json
"desafio": {
  "ambiente": "node",
  "nivel": 3,
  "enunciado": "…Entregue: a saída exata.",
  "passos": ["…"],
  "entrega": { "tipo": "saida", "esperado": "A\nB", "rotulo": "Cole a saída" },
  "dicas": ["…"],
  "solucao": "…",
  "criterios": ["…"],
  "postmortem": false,
  "termos": ["event-loop"]
}
```

É **literalmente** um exercício de `content/praticas/README.md` (leia lá a tabela de campos e os tipos de
entrega `saida` / `numero` / `escolha` / `texto` / `checklist`), sem `id`/`titulo` próprios — herda os da
etapa, e herda `termos`/`nivel`/`tempoMin` da etapa quando não declara os seus. O carregador usa a **mesma
função** de normalização e a **mesma correção** das práticas: nada é reimplementado aqui.

### 4. `cronometrado` — responder X perguntas em Y minutos

```json
"cronometrado": {
  "minutos": 10,
  "acertosMin": 8,
  "criterio": "8 de 10 sem consultar nada",
  "perguntas": [
    { "id": "q1", "pergunta": "Em que fase roda o callback do fs.readFile?", "resposta": "poll", "termos": ["fases-event-loop"] }
  ]
}
```

| campo | obrigatório | regras |
|---|---|---|
| `minutos` | sim | 1–60. O app roda um cronômetro regressivo |
| `perguntas` | sim | 5–20 itens, cada um com `id` (kebab-case, único na etapa), `pergunta`, `resposta` (curta e objetiva) e `termos` opcional |
| `acertosMin` | não | quantos acertos contam como "passou" (default: 70 % arredondado para cima) |
| `criterio` | não | frase do que conta como sucesso |

Fluxo: o app mostra uma pergunta por vez com o relógio correndo; no fim revela as respostas e **você marca
quais acertou** (honestidade é o preço do método).

### 5. `simulado` — perguntas de entrevista em sequência (PT ou EN)

```json
"simulado": {
  "idioma": "misto",
  "minutosPorPergunta": 5,
  "criterios": ["Responde em 2 min", "Dá um trade-off explícito", "Termina com o que mediria"],
  "perguntas": [
    {
      "id": "q1",
      "idioma": "en",
      "pergunta": "Walk me through what happens when your Node service p99 jumps to 8s while CPU stays at 30%.",
      "contexto": "Entrevistador técnico, 15 min de conversa.",
      "pontosEsperados": ["event loop lag", "fila de I/O", "medir antes de otimizar"],
      "respostaModelo": "I would start by separating…",
      "seguimento": "And if the CPU were at 95%?",
      "termos": ["node-internals/event-loop-lag"]
    }
  ]
}
```

| campo | obrigatório | regras |
|---|---|---|
| `idioma` | não | `pt` · `en` · `misto` (default `pt`). Cada pergunta pode sobrescrever com o seu próprio `idioma` |
| `minutosPorPergunta` | não | 2–15, default 5 |
| `criterios` | sim | 3–6 linhas de rubrica: é por elas que você se dá a nota |
| `perguntas` | sim | 3–10 itens. `pergunta` obrigatória; `pontosEsperados` (3–6) e `respostaModelo` obrigatórios — sem gabarito a auto-nota vira chute |

Fluxo: uma pergunta por vez, você responde **em voz alta ou escrevendo**; depois vê `pontosEsperados` +
`respostaModelo` e **dá a nota 0–5 de cada pergunta**.

### 6. `mao-na-massa` — mini-projeto com critério de pronto

```json
"mao-na-massa": {
  "contexto": "Você tem 1 h e um endpoint que trava.",
  "stack": ["node", "express"],
  "tempoCaixa": 60,
  "entregavel": "Uma pasta com server.js e um README de 10 linhas.",
  "passos": ["Suba um endpoint que faz JSON.parse de 5 MB", "Meça o lag", "Mova para worker_threads", "Meça de novo"],
  "criterioPronto": [
    "O endpoint responde 200 sob carga de 50 conexões",
    "O lag do loop fica abaixo de 50 ms no p99",
    "O README explica o antes/depois com número"
  ]
}
```

| campo | obrigatório | regras |
|---|---|---|
| `passos` | sim | 3–10 passos, na ordem |
| `criterioPronto` | sim | 3–8 itens **verificáveis** — é o checklist que vira a nota |
| `contexto` | não | a situação, em 1–3 linhas |
| `stack` | não | até 6 tecnologias (só o que o Rafael já tem: Node, Express, PostgreSQL, Redis, Docker, Nginx, PM2, papel) |
| `tempoCaixa` | não | minutos de time-box |
| `entregavel` | não | o que sobra no disco quando terminar |

### 7. `ensinar` — explicar para outra pessoa (degrau 5 da escala)

```json
"ensinar": {
  "publico": "um dev júnior que nunca ouviu falar de event loop",
  "formato": "audio",
  "duracaoMin": 5,
  "roteiro": ["Analogia do balcão", "As 6 fases", "Um caso real seu", "O erro que quase todo mundo comete"],
  "criterios": ["Zero jargão sem definição", "Um exemplo concreto", "Termina com um 'como eu provaria isso'"],
  "minimoChars": 400
}
```

| campo | obrigatório | regras |
|---|---|---|
| `publico` | sim | para **quem** você explica (muda tudo) |
| `formato` | sim | `audio` · `video` · `texto` · `ao-vivo` |
| `criterios` | sim | 3–6 itens de rubrica |
| `duracaoMin` | não | 2–20 |
| `roteiro` | não | até 8 tópicos sugeridos |
| `minimoChars` | não | mínimo do texto colado no app (default 300). Para `audio`/`video`/`ao-vivo`, cole o roteiro ou a transcrição |

### 8. `retrospectiva` — fechamento + auto-nota

```json
"retrospectiva": {
  "perguntas": [
    "O que você sabia fazer no dia 1 e não sabia explicar?",
    "Qual número você mediu que te surpreendeu?",
    "O que você ainda não sabe defender numa entrevista?"
  ],
  "proximoPasso": "Se a nota ficou < 3, refaça só as etapas 3 e 5 na semana que vem.",
  "notaFinal": true
}
```

| campo | obrigatório | regras |
|---|---|---|
| `perguntas` | sim | 3–6 perguntas de fechamento |
| `proximoPasso` | não | o que fazer dependendo da nota |
| `notaFinal` | não | `true` marca esta etapa como a que fecha o treino (deve ser a última) |

Todo treino deveria terminar com uma `retrospectiva`. É onde o aprendizado vira frase — e frase é o que
sai na entrevista.

---

## Avaliação — como cada etapa vira nota, e como a nota vira SM-2

| tipo | como conclui | nota da etapa | avalia termo (SM-2)? |
|---|---|---|---|
| `aquecimento` | botão "concluir etapa" depois de voltar do modo de estudo | opcional (0–5), default `null` | **não** — cada termo já foi avaliado dentro do modo de estudo; avaliar de novo seria contar duas vezes |
| `leitura` | botão "li e entendi" | opcional | **não** |
| `desafio` | mesma entrega das práticas | `saida`/`numero`/`escolha` → nota automática · `checklist` → proporção × 5 · `texto` → auto-nota 0–5 | **sim**, no termo principal do desafio |
| `cronometrado` | marca quais perguntas acertou | proporção de acertos × 5 (arredondada) | **sim**: cada pergunta com `termos` avalia o seu termo principal com **4** se acertou e **1** se errou |
| `simulado` | dá nota 0–5 a cada pergunta | média das notas (arredondada) | **sim**: cada pergunta com `termos` recebe a **própria** nota |
| `mao-na-massa` | marca o `criterioPronto` cumprido | proporção × 5 | **sim**, no termo principal da etapa |
| `ensinar` | auto-nota obrigatória depois de colar roteiro/transcrição | a auto-nota | **sim**, no termo principal da etapa |
| `retrospectiva` | auto-nota obrigatória | a auto-nota | **não** |

Regras que valem para todas:

- A nota é sempre **0–5**, na escala do Rafael. `>= 3` conta como acerto para o SM-2 (ver `server/sm2.js`).
- **Nada de SM-2 nem de correção é reimplementado aqui**: `server/treinos.js` usa `corrigir`,
  `notaAutomatica`, `notaChecklist` e `normalizarExercicio` de `server/praticas.js`, e
  `server/progresso-treinos.js` chama o `progresso.avaliar()` de sempre (modo `"treino"`), que aplica o
  SM-2, a ofensiva e o histórico do dia.
- Toda etapa concluída pode ser **reaberta**; o histórico guarda cada passagem e a nota que vale é a última.
- **Nota final do treino** = média das notas das etapas obrigatórias que produziram nota (etapas
  `opcional: true` e as que ficam com `null` não entram). O treino fica `concluido` quando toda etapa
  obrigatória está concluída — e só aí a `recompensa` aparece.

## Regras gerais de escrita

- Ids em **kebab-case** (`d3-flame-graph`), únicos; nada de acento, espaço ou maiúscula.
- Tudo em **PT-BR**, menos o que é de propósito em inglês (perguntas `idioma: "en"` do simulado).
- Código só em **JavaScript/Node** — sem TypeScript, sem `.ts`, sem tipos. O app é JSX puro.
- Gabarito **determinístico**: se a saída depende de tempo, IP ou ordem de hash, vire `numero` com
  tolerância ou `texto`. Escreva só exercício que você mesmo rodaria.
- A atividade é resolvida **fora do app** (terminal, psql, Docker, papel, gravador de voz). O app é o
  lugar de registrar, não de executar.
- 4–14 etapas, com **pelo menos 4 tipos diferentes**, sempre terminando em `retrospectiva`.
- Um treino que não muda o que o Rafael consegue fazer não é treino: cada etapa tem que exigir uma
  entrega que não existia antes.

## Validar

```bash
node scripts/validar-treinos.mjs
```

Valida todos os `content/treinos/*.json` contra este esquema e contra os ids reais dos decks. Sai com
código 1 se achar erro. Aviso de termo inexistente não derruba o treino — a etapa continua, só não avalia
SM-2 naquele termo.
