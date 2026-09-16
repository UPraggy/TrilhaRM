# content/cursos/

**Cursos escritos em Markdown.** Um arquivo `.md` aqui dentro = um curso no app, com módulos, lições e
atividades corrigidas. Não precisa tocar em código, não precisa de restart: o servidor recarrega a pasta
quando o mtime muda, do mesmo jeito que faz com os decks.

Para gerar conteúdo novo com qualquer IA (ChatGPT, Gemini, Claude…), copie o prompt pronto de
[`COMO-PEDIR-PARA-UMA-IA.md`](COMO-PEDIR-PARA-UMA-IA.md). Este README é a **especificação** completa.

> Formato antigo: `content/cursos/*.json` com `{ id, titulo, licoes: [{ id, titulo, markdown }] }`
> continua sendo aceito (vira um curso de um módulo só). Não escreva JSON novo — use Markdown.

---

## Esqueleto

````markdown
---
id: http-do-zero
deck: http-networking
fase: 1
ordem: 1
nivel: 3
tags: [http, redes, node]
descricao: Uma frase que aparece no card do curso.
---

# HTTP do zero

Parágrafo de abertura. Aparece no sumário do curso, antes dos módulos.

## O caminho de um request

Texto opcional do módulo (aparece só no sumário).

### Do nome ao pacote

O corpo da lição, em Markdown comum. Termos viram links: [[dns]], [[http-networking/tcp]].

### Quando o HTTP finalmente fala

Outra lição.

## Conexões que você não vê

### Portas e TIME_WAIT

…
````

| Nível | Significa | id |
| --- | --- | --- |
| `#` | título do curso | vem do `id:` do frontmatter, ou do título |
| `##` | **módulo** | kebab-case do título, ou `{#id-explicito}` |
| `###` | **lição** | kebab-case do título, ou `{#id-explicito}` |
| `####` em diante | subtítulo dentro da lição | — |

Para fixar um id (e não quebrar o progresso quando você reescrever o título), escreva
`### Portas e TIME_WAIT {#portas-e-time-wait}`.

## Frontmatter

Tudo é opcional menos, na prática, `id` e `descricao`.

| chave | o que faz |
| --- | --- |
| `id` | id do curso (kebab-case, único). Sem ele, sai do nome do arquivo sem o prefixo numérico |
| `titulo` | vence o `# Título` do corpo |
| `descricao` | 1–2 frases no card. Sem ela, usa o primeiro parágrafo |
| `deck` | deck padrão: wikilinks e `termos:` das atividades podem omitir o `deckId/` |
| `fase` | 1–5, agrupa junto com os decks. Padrão 99 |
| `ordem` | desempate dentro da fase |
| `nivel` | 1–5, informativo |
| `tags` | `[a, b]` ou lista `- a` |

## Markdown suportado

Parágrafos · `## ###` títulos · listas `-` e `1.` (com aninhamento por indentação de 2 espaços) ·
` ```js ` blocos de código com linguagem · tabelas GFM (`| a | b |` + `| --- | --- |`) · citações `>` ·
`---` linha horizontal · `**negrito**` · `*itálico*` · `` `code` `` · `[texto](url)` ·
`[[wikilink]]`.

Não há HTML: o que não está nessa lista vira texto normal.

### Wikilinks

`[[deckId/termoId]]` vira link para o termo no glossário. Com `deck:` no frontmatter, `[[termoId]]`
basta. Se o termo não existir em nenhum deck, o texto continua legível (em vermelho) e o
`node scripts/validar-conteudo.mjs` **avisa**.

- `[[tcp]]` → link com o nome do termo ("TCP (3-way handshake…)")
- `[[http-networking/tcp|o handshake]]` → link com o rótulo que você escolher

### Blocos destacados

Containers com três dois-pontos. Todos opcionais; o texto do lado direito vira o título:

```markdown
:::objetivo Ao terminar você consegue
- item
- item
:::

:::nota Título opcional
Texto normal, com **markdown** dentro.
:::

:::alerta Cuidado
O erro que todo mundo comete aqui.
:::

:::exemplo A conta que dói
Um caso concreto, com números.
:::
```

| container | uso | cor |
| --- | --- | --- |
| `:::objetivo` | o que a pessoa vai saber fazer | verde |
| `:::nota` | observação lateral | periwinkle |
| `:::alerta` | armadilha, erro comum, risco | rose |
| `:::exemplo` | caso concreto com números | âmbar |
| `:::atividade` | exercício corrigido (abaixo) | — |

---

## `:::atividade` — o exercício embutido

Uma atividade usa **exatamente o mesmo esquema** dos exercícios de
[`content/praticas/README.md`](../praticas/README.md) — e o mesmo motor: a mesma correção automática, a
mesma nota automática e a mesma gravação SM-2 no termo principal (modo `pratica`). O que muda é só onde
ela mora.

Estrutura: **YAML** · `---` · **enunciado em Markdown** · `---` · **solução em Markdown**.

````markdown
:::atividade
id: provar-que-o-keep-alive-reusa
titulo: Provar que o keep-alive está reusando o socket
termos: [connection-pool, socket-porta-ephemeral]
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
criterios:
  - Entendeu que o número é a quantidade de portas efêmeras distintas
---
O enunciado, em Markdown: pode ter ```blocos de código```, listas, [[wikilinks]] e tabelas.

Termine sempre dizendo **o que entregar**.
---
A solução, em Markdown. Só aparece depois de acertar ou de pedir para revelar.
:::
````

### Campos

| campo | obrigatório | regras |
| --- | --- | --- |
| `id` | sim | kebab-case, **único no curso** (é a chave do progresso) |
| `titulo` | sim | curto |
| `termos` | sim | ids de termos. O **primeiro** é o principal: a nota vira avaliação SM-2 nele. Com `deck:` no frontmatter dá para omitir o `deckId/` |
| `nivel` | sim | 1–5 na escala: 2 explico · 3 aplico · 4 diagnostico · 5 ensino |
| `tempoMin` | sim | estimativa honesta |
| `ambiente` | sim | `node` `bash` `postgres` `redis` `docker` `nginx` `browser` `papel` `celular` `git` `http` |
| `entrega` | sim | ver a tabela abaixo |
| `dicas` | não | 0–3; cada dica usada derruba a nota automática |
| `criterios` | sim para `texto` | a rubrica que o mentor IA e a auto-avaliação cobram |
| `postmortem` | não | `true` = failure lab (sintoma → evidência → causa → correção → processo) |
| enunciado | sim | o texto depois do 1º `---` |
| solução | sim | o texto depois do 2º `---` |

### Tipos de entrega

| `tipo` | campos | correção |
| --- | --- | --- |
| `saida` | `esperado` (use `\|` para várias linhas), `esperadoQualquer: [a, b]`, `normalizar` (padrão true) | compara normalizando espaços, CRLF e maiúsculas |
| `numero` | `esperado`, `tolerancia` (fração) **ou** `min`/`max`, `unidade` | intervalo |
| `escolha` | `opcoes` (lista), `correta` (índice, base 0) ou `corretas` (lista) | conjunto igual |
| `texto` | `minimoChars` (padrão 80) + `criterios` | você se avalia 0–5 depois de ver o gabarito; pode chamar o mentor IA |
| `checklist` | `itens` (lista de 2–8) | nota = proporção × 5 |

Nota automática (`saida`/`numero`/`escolha`): **4** de primeira sem dica · **3** com dica ou até 3
tentativas · **2** depois disso · **1** se revelou antes. Sempre dá para ajustar depois.

### Pegadinhas do YAML

- `esperado: 200` vira **número**. Para uma saída de texto escreva `esperado: "200"` (ou use `|`).
- Saída com várias linhas: `esperado: |` e o bloco indentado com 4 espaços.
- Dois-pontos dentro de um valor: ponha entre aspas — `rotulo: "Formato: chave valor"`.
- A linha `---` sozinha separa YAML / enunciado / solução. Se precisar de uma régua **dentro** do texto,
  use `***`.

---

## Regras

1. `id` de curso, de módulo, de lição e de atividade em **kebab-case** e únicos.
2. Trocar um título muda o id derivado e **zera o progresso daquela lição** — se for reescrever títulos,
   fixe os ids com `{#id}`.
3. Conteúdo em **PT-BR**; código sempre em **JavaScript/Node** (nunca TypeScript).
4. Toda atividade tem gabarito. Sem solução, o validador reclama.
5. A atividade é resolvida **fora do app** (terminal, psql, Docker, papel) — o app só registra.
6. Saída de `saida` precisa ser determinística. Se depende de tempo, IP ou ordem de hash, vire `numero`
   com tolerância ou `texto`.

## Testar antes de subir

```bash
node scripts/validar-conteudo.mjs     # decks, práticas, trilhas e cursos; sai 1 se houver aviso
```

O validador aponta: id inválido, título de lição repetido, módulo sem lição, atividade sem gabarito,
atividade com id duplicado e **wikilink apontando para termo que não existe**. Os mesmos avisos aparecem
em `GET /api/saude` e no topo da tela de Cursos.

## API

| método | rota |
| --- | --- |
| GET | `/api/cursos` — lista com progresso por curso |
| GET | `/api/cursos/:id` — curso completo (módulos, lições em blocos, atividades) |
| POST | `/api/cursos/:id/licao/:licaoId/concluir` — `{ concluida?: true }` |
| POST | `/api/cursos/:id/licao/:licaoId/visto` — "continuar de onde parei" |
| GET/POST | `/api/cursos/:id/atividade/:atvId[/iniciar\|/dica\|/revelar\|/reabrir\|/responder\|/mentor]` |
| PUT | `/api/cursos/:id/atividade/:atvId/rascunho` |

O progresso de curso vive em `data/progresso.json` em `cursos[cursoId]` (lições concluídas + última
vista); as atividades vivem em `praticas["curso:<cursoId>/<atividadeId>"]`, o mesmo formato das práticas.
