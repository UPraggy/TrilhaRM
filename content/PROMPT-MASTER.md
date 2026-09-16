# PROMPT-MASTER — conteúdo do Trilha RM para qualquer IA

**Como usar:** cole este arquivo inteiro numa conversa nova (Claude, ChatGPT, DeepSeek, Gemini…),
escreva no fim o que você quer e mande. Ele é autocontido: a IA não precisa do repositório para
responder. Serve para **criar** conteúdo novo e para **editar** conteúdo que já existe.

> Para detalhes que não cabem aqui, aponte a IA (ou você mesmo) para:
> [`praticas/README.md`](praticas/README.md) · [`cursos/README.md`](cursos/README.md) ·
> [`cursos/COMO-PEDIR-PARA-UMA-IA.md`](cursos/COMO-PEDIR-PARA-UMA-IA.md) ·
> [`treinos/README.md`](treinos/README.md) · [`treinos/PROMPT-MASTER.md`](treinos/PROMPT-MASTER.md)
> (este arquivo não repete o que está lá — ele dá o suficiente para você acertar de primeira).

---

## 1. Quem vai estudar isso

Rafael — **dev full stack pleno**, mirando sênior e entrevista em inglês.

- **Stack diária:** Node.js (22) + Express, React em **JSX puro**, PostgreSQL, Redis, Docker, Nginx,
  PM2, Git. Windows 11 + Git Bash, e um Android S23 com Termux/PRoot rodando dois apps em PM2.
- **Não usa TypeScript.** Nenhum exemplo, nenhum trecho, nenhuma menção como se fosse o padrão dele.
- Sabe fazer funcionar; quer saber **por que funciona, onde quebra e como medir**. Ele não precisa de
  "o que é uma variável" — precisa de "a conta que prova que era o event loop, não o banco".
- Conteúdo em **PT-BR**. Inglês só onde é o objetivo (deck de vocabulário, simulado em EN).

## 2. A escala 0–5 (use exatamente esta)

| nível | significa |
| --- | --- |
| 0 | desconheço |
| 1 | reconheço o nome |
| 2 | consigo explicar |
| 3 | consigo aplicar |
| 4 | consigo **diagnosticar** (achar a causa com evidência) |
| 5 | consigo **ensinar/defender** numa entrevista sênior |

Todo `nivel` de exercício, atividade e treino é o nível **de saída**: onde a pessoa fica depois de
fazer. A maior parte do conteúdo bom mora em 3 e 4.

## 3. Os quatro tipos de conteúdo

| tipo | arquivo | quando usar |
| --- | --- | --- |
| **Deck de termos** | `content/decks/<n>-<nome>.json` | vocabulário/conceitos para memorizar e revisar (SM-2) |
| **Exercícios práticos** | `content/praticas/<deckId>.json` | "prove isso na sua máquina" — um arquivo por deck |
| **Curso** | `content/cursos/<nn>-<nome>.md` | aula em Markdown, com módulos, lições e atividades |
| **Treino Especial** | `content/treinos/<nn>-<nome>.json` | temporada com etapas (semana temática, simulado) |

---

## 4. Deck de termos

```json
{
  "id": "node-internals",
  "titulo": "Node.js internals",
  "fase": 1,
  "trilha": "Backend Engineering",
  "ordem": 1,
  "descricao": "1–2 frases sobre o recorte do deck.",
  "termos": [
    {
      "id": "event-loop",
      "termo": "Event Loop",
      "termoEN": "Event Loop",
      "definicao": "1–2 frases: o que é.",
      "profundidade": "3–6 frases: como funciona por dentro, onde quebra, qual é o trade-off.",
      "exemplo": "Caso concreto, com número ou código curto (use \\n para quebrar linha).",
      "perguntaEntrevista": "Pergunta de entrevista em português.",
      "perguntaEntrevistaEN": "The same question in English.",
      "relacionados": ["libuv", "http-networking/keep-alive"],
      "tags": ["node", "concorrencia"],
      "nivelAlvo": 4
    }
  ]
}
```

- `id` do deck e de cada termo em **kebab-case**, únicos.
- `relacionados` aceita `"termoId"` (mesmo deck) ou `"deckId/termoId"` — **só ids que existem**.
- `profundidade` é o gabarito do modo Explique e do mentor IA: sem ela o termo vira decoreba.
- 25–30 termos por deck. Nada de dois termos que são o mesmo conceito com nomes diferentes.

## 5. Exercícios práticos

Um arquivo por deck. O exercício é resolvido **fora do app** (terminal, psql, Docker, papel) e o app
só registra a resposta; a nota vira uma avaliação SM-2 no **primeiro** termo de `termos`.

```json
{
  "deckId": "node-internals",
  "titulo": "Práticas · Node.js internals",
  "exercicios": [
    {
      "id": "ordem-event-loop",
      "titulo": "Ordem de execução: timers, microtasks e I/O",
      "termos": ["event-loop", "microtasks"],
      "nivel": 3,
      "tempoMin": 15,
      "ambiente": "node",
      "enunciado": "Escreva um script que… Entregue: a saída exata do comando.",
      "passos": ["Crie o arquivo", "Rode com node ordem.js"],
      "entrega": { "tipo": "saida", "rotulo": "Cole a saída exata", "esperado": "A\nB\nC" },
      "dicas": ["Dica que custa nota"],
      "solucao": "Explicação + código da solução.",
      "criterios": ["O que uma resposta boa precisa ter"],
      "postmortem": false
    }
  ]
}
```

- `ambiente`: `node` `bash` `postgres` `redis` `docker` `nginx` `browser` `papel` `celular` `git` `http`.
- `entrega.tipo`: `saida` (`esperado` / `esperadoQualquer`) · `numero` (`esperado` + `tolerancia`, ou
  `min`/`max`) · `escolha` (`opcoes` + `correta`/`corretas`, índice base 0) · `texto` (exige
  `criterios`) · `checklist` (`itens`, 3–8).
- Nota automática: **4** de primeira sem dica · **3** com dica ou até 3 tentativas · **2** depois disso
  · **1** se revelou antes.
- 4–6 exercícios por deck, misturando tipos, do nível 2 ao 4/5.

## 6. Curso em Markdown

`#` é o curso, `##` um módulo, `###` uma lição. Frontmatter YAML no topo.

````markdown
---
id: http-do-zero
titulo: HTTP do zero
descricao: O caminho de um request, do DNS ao byte que volta.
deck: http-networking
fase: 1
ordem: 1
tags: [http, redes]
---

# HTTP do zero

## O caminho de um request

### Do nome ao pacote

:::objetivo Ao terminar você consegue
- explicar o que acontece entre o Enter e o primeiro byte
:::

Texto normal, com [[http-networking/tcp]] virando link para o glossário, tabelas, `código` e
```js
blocos de código em JavaScript
```

:::alerta A armadilha
O erro que todo mundo comete aqui.
:::

:::atividade
id: medir-o-ttfb
titulo: Medir o TTFB de verdade
termos: [ttfb, tcp]
nivel: 3
tempoMin: 15
ambiente: bash
entrega:
  tipo: numero
  rotulo: Quantos ms de TTFB?
  esperado: 120
  tolerancia: 0.5
criterios:
  - Separou conexão de espera do servidor
---
O enunciado em Markdown. Termine dizendo **o que entregar**.
---
A solução em Markdown, com o comando e a leitura do número.
:::
````

- Blocos: `:::objetivo` `:::nota` `:::alerta` `:::exemplo` `:::atividade`.
- A `:::atividade` usa **o mesmo esquema do exercício prático** (seção 5), em YAML, com
  `---` separando YAML / enunciado / solução.
- Ids de lição saem do título; para não perder progresso ao reescrever um título, fixe:
  `### Portas e TIME_WAIT {#portas-e-time-wait}`.
- Pegadinhas de YAML: `esperado: 200` é **número** — para texto use `"200"` ou `|`; valor com
  dois-pontos vai entre aspas; régua dentro do texto é `***`, nunca `---`.

## 7. Treino Especial

Uma "temporada": cabeçalho + 4–14 etapas na ordem de execução. A última etapa é sempre
`retrospectiva`.

```json
{
  "id": "semana-event-loop",
  "titulo": "Semana do Event Loop",
  "objetivo": "Explicar as fases do event loop olhando para uma medição sua.",
  "nivel": 4,
  "duracaoDias": 7,
  "decks": ["node-internals"],
  "termos": ["node-internals/event-loop"],
  "recompensa": "Você aponta a fase que travou e prova com número.",
  "etapas": [
    {
      "id": "d1-aquecimento",
      "tipo": "aquecimento",
      "titulo": "Reconhecer as 6 fases",
      "dia": 1,
      "tempoMin": 12,
      "termos": ["fases-event-loop"],
      "aquecimento": { "modo": "flashcards", "fonte": "deck:node-internals", "quantidade": 12 }
    }
  ]
}
```

- Tipos de etapa: `aquecimento` · `leitura` · `desafio` · `cronometrado` · `simulado` ·
  `mao-na-massa` · `ensinar` · `retrospectiva`. **Cada etapa tem um objeto com o mesmo nome do
  `tipo`** (`mao-na-massa` → chave `"mao-na-massa"`).
- `duracaoDias` **ou** `tempoTotalMin` — um dos dois.
- O corpo de cada tipo está em [`treinos/README.md`](treinos/README.md); o prompt dedicado, com
  exemplo completo e válido, em [`treinos/PROMPT-MASTER.md`](treinos/PROMPT-MASTER.md).

---

## 8. Editar o que já existe

Este prompt também serve para **acrescentar** conteúdo a um arquivo existente. Peça assim:

> Aqui está o arquivo atual `content/praticas/cache.json`. **Acrescente 3 exercícios** de nível 4
> sobre invalidação, **mantendo todo o resto exatamente igual** (mesma ordem, mesmos ids, mesmo texto).
> Devolva o arquivo **inteiro**, pronto para salvar por cima.
>
> ```json
> …cole o arquivo aqui…
> ```

Regras da edição — valem para qualquer um dos quatro tipos:

1. **Nunca renomeie um `id` existente.** Id é a chave do progresso: renomear zera o histórico SM-2,
   a ofensiva e os exercícios concluídos daquele item.
2. Não reordene, não reescreva e não "melhore" o que não foi pedido. Diff pequeno.
3. Itens novos vão **no fim** da lista (ou no ponto que o pedido disser), com ids novos e únicos.
4. Devolva o **arquivo inteiro e válido**, não um trecho solto nem "… resto igual …".
5. Se algo do arquivo atual estiver quebrado (id duplicado, termo inexistente), **avise** em uma linha
   antes do arquivo — não conserte por conta própria.
6. Em curso, mexer no texto de um `###` muda o id da lição: se precisar mudar o título, **fixe o id
   antigo** com `{#id-antigo}` na mesma linha.

---

## 9. Regras invioláveis (as seis)

1. **PT-BR** no conteúdo. Inglês só quando é o objetivo do material.
2. **JavaScript/Node** em todo código. **Nunca TypeScript** — nem em exemplo, nem em anotação de tipo.
3. **Ids em kebab-case**, únicos no escopo (deck, arquivo, curso, treino) e estáveis.
4. **Gabarito determinístico e testado.** Se a saída depende de tempo, IP, ordem de hash ou versão,
   não é `saida`: vire `numero` com tolerância ou `texto` com critérios. Rode o comando antes de
   afirmar a saída; se não puder rodar, mude o tipo de entrega.
5. **O exercício se resolve FORA do app.** O app mostra o enunciado e registra a resposta — ele não é
   um runtime. Nada de "clique no botão X do Trilha RM".
6. **Não invente id de termo.** Só referencie termos que existem nos decks. Na dúvida, use menos
   `relacionados`/`termos` — id inexistente vira aviso no validador.

Além disso: nada de conteúdo genérico de tutorial. Todo item precisa responder "onde isso quebra na
produção e como eu provo".

## 10. Onde salvar e como validar

| conteúdo | salve em |
| --- | --- |
| deck | `content/decks/<fase>-<nome>.json` |
| exercícios | `content/praticas/<deckId>.json` |
| curso | `content/cursos/<nn>-<nome>.md` |
| treino | `content/treinos/<nn>-<nome>.json` |

```bash
node scripts/validar-conteudo.mjs   # decks, práticas, cursos e trilhas
node scripts/validar-treinos.mjs    # treinos (ids de termos, tipos de etapa, tempos)
```

Os dois saem com código 1 se houver erro e listam o arquivo e o item. **Conteúdo novo não precisa de
restart**: o servidor recarrega `content/` quando o mtime muda.

## 11. As mensagens do bot de Telegram

O bot manda sugestões de estudo no Telegram (`/hoje`, `/pratica`, lembrete diário). Se você pedir a
uma IA para escrever ou revisar um texto dessas mensagens, o padrão é:

- **Uma ação por mensagem.** "Faça este exercício" — não "faça isto, depois aquilo, e veja também".
- **Curto**: 1 linha de contexto + 1 linha do que fazer. Ninguém lê parágrafo no celular às 7h.
- **Sempre com link** para a tela exata (o exercício, a lição, a etapa), nunca só para a home.
- **Diga o custo**: nível e tempo estimado ("nível 3 · ~15 min"). Ele decide em 2 segundos.
- Sem emoji em excesso: no máximo um, no começo, como ícone do tipo de tarefa.
- Sem cobrança moral. "Faltam 4 avaliações para fechar o dia" — nunca "você está falhando".
- Formato **HTML** do Telegram (`<b>`, `<i>`, `<a href>`), com `&`, `<` e `>` escapados. Markdown do
  Telegram quebra com qualquer título que tenha `-` ou `_`.

---

## 12. O que eu quero agora

<!-- escreva aqui, em 3–10 linhas, e apague o exemplo -->

> Exemplo: "Crie `content/praticas/observabilidade.json` com 5 exercícios, nível 3 a 5, sobre
> cardinalidade de métricas, p99 vs média, trace de request e alerta que não acorda ninguém à toa.
> Pelo menos um `postmortem: true` e um `numero` com tolerância. Termos disponíveis no deck
> `observabilidade`: (cole aqui os ids)."

**Antes de responder, confira:** JSON/YAML válido · ids kebab-case únicos · nenhum termo inventado ·
gabarito determinístico · PT-BR · JavaScript, nunca TypeScript · arquivo inteiro, pronto para salvar.
