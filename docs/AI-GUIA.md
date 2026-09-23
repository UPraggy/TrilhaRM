# AI-GUIA — Trilha RM em uma página

> Para quem chega agora (você, outra IA, o Rafael daqui a três meses). Leia isto antes de tocar em
> qualquer arquivo. Status do que está feito: [`MUDANCAS-V2.md`](MUDANCAS-V2.md). Plano completo:
> [`PLANO-V2.md`](PLANO-V2.md). Manual de uso: `ME/PlanejamentoCarreira/20-app-trilha-rm.md`.

## O que é

App pessoal de estudo do Rafael para subir de nível em engenharia de software (plano de carreira em
`ME/PlanejamentoCarreira/19-trilha-profundidade-2026-09.md`). Roda no PC e no celular (Termux/PRoot +
PM2 + túnel Cloudflare), com bot do Telegram e mentor IA gratuito (OpenRouter).

**Stack:** React 18 + Vite 5 (JSX puro, sem TypeScript) · Express 4 · Node ≥ 20 · zero banco de dados —
**todo conteúdo é arquivo em `content/`** e todo progresso é `data/progresso.json`.

## Vocabulário (três palavras, e só três)

| Palavra | O que é | Onde vive |
|---|---|---|
| **Trilha** | uma fase do plano de carreira (T1…T5). É o caminho. | `content/estrutura.json` → `trilhas[]` |
| **Módulo** | um tema (Cache, HTTP, Testes…). Junta **tudo** daquele tema. | `content/estrutura.json` → `modulos[]` |
| **Lição** | uma sessão curta de 8–12 itens, 5–10 min, um item por tela. | montada pelo servidor em `server/licao.js` |

Dentro de um módulo há quatro tipos de material, e o aluno **não precisa escolher entre eles** — a lição
mistura os quatro:

```
TRILHA (fase do plano)
 └─ MÓDULO (tema)
     ├─ vocabulário  → content/decks/*.json      (termos: decorar)
     ├─ lições        → content/cursos/*.md       (Markdown: aprender)
     ├─ exercícios    → content/praticas/*.json   (fazer fora do app: praticar)
     └─ chefão        → content/treinos/*.json    (temporada longa: provar)
```

Palavras que **não** usamos mais na interface: "fase" (virou trilha), "deck" (virou o vocabulário de um
módulo), "camada". `deck` continua sendo o nome do **arquivo** e do id na API — só sumiu da tela.

## Preciso de… → arquivo

| Preciso de… | Arquivo |
|---|---|
| Quem é módulo de quem, ordem, cor, ícone | `content/estrutura.json` (**a fonte da verdade da hierarquia**) |
| Resolver a estrutura com progresso e contagens | `server/estrutura.js` → `GET /api/estrutura` |
| Rotas do front | `src/App.jsx` |
| Menus (barra inferior, sidebar, Biblioteca, Perfil) | `src/nav.js` (declarativo) + `src/components/Layout.jsx` |
| Tela inicial (o que fazer agora) | `src/pages/Home.jsx` |
| Mapa vertical da trilha (estilo Duolingo) | `src/pages/Trilha.jsx` |
| Os nós de um módulo | `src/pages/Modulo.jsx` |
| A sessão (lição) e a tela de resultado | `src/pages/Licao.jsx` · `src/pages/Resultado.jsx` · `server/licao.js` |
| XP, coroas e meta do dia | `server/xp.js` (regras puras) · `server/progresso.js` (grava) |
| Um modo de estudo | `src/modes/*.jsx` (um arquivo por modo) · lista em `src/lib/util.js` (`MODOS`) |
| Sessão livre por deck (tela antiga, ainda viva) | `src/pages/Estudo.jsx` |
| Exercício fora do app | `src/pages/Pratica.jsx` · `server/praticas.js` (correção) |
| Curso / lição em Markdown | `src/pages/{Cursos,Curso,LicaoCurso}.jsx` · `server/{cursos,markdown}.js` · `src/components/Blocos.jsx` |
| Treino Especial (chefão) | `src/pages/{Treinos,Treino}.jsx` · `server/{treinos,progresso-treinos}.js` |
| Entrevista simulada multi-turno | `src/pages/Entrevista.jsx` · `server/entrevista.js` |
| Diário de erros | `src/pages/DiarioErros.jsx` · rotas `/api/diario*` em `server/index.js` · dados em `server/progresso.js` |
| Duelo contra o passado | `src/pages/Duelo.jsx` · `server/licao.js` (histórico) |
| Revisão espaçada (SM-2) | `server/sm2.js` |
| Mentor IA (OpenRouter, fila de gratuitos, CA do antivírus) | `server/mentor.js` |
| Tutor (botão flutuante: explica a tela + chat) | `server/tutor.js` (contexto do app, do aluno e da tela) · `src/components/Tutor.jsx` · `POST /api/tutor` |
| Cor e movimento (hover, toque, entradas) | `src/styles/motion.css` (vem por último) |
| Bot do Telegram | `server/telegram.js` · `src/components/ConfigTelegram.jsx` |
| Cards PNG / QR Code | `server/{png,qrcode,cards}.js` · `GET /api/cards/<nome>.png` |
| Idioma PT/EN | `src/i18n/nucleo.js` (lógica, sem JSX) + `index.jsx` (hook) + `en.json` (dicionário) · `server/i18n.js` (bot e cards) |
| Estado global do front | `src/store.jsx` · cliente HTTP `src/api.js` |
| Tokens, classes globais e CSS por tela | `src/styles/tokens.css` (cores, com o contraste medido) · `src/styles/base.css` (utilitárias, reduced-motion) · `src/styles.css` (legado) · `src/v2.css` (telas novas) |
| Validar conteúdo | `node scripts/validar-conteudo.mjs` · `node scripts/validar-treinos.mjs` |
| Deploy no celular | `bash scripts/deploy-celular.sh` (`--status`, `--primeira`) |

## Como rodar

```bash
npm install
npm run dev          # Vite 5173 (proxy) + API 8790
npm test             # node --test tests/*.test.js
npm run test:conteudo
npm run build
```

## Como adicionar coisa nova

| Quero… | Faço |
|---|---|
| **um termo** | edito `content/decks/<n>-<id>.json`, array `termos[]`. Sem build, sem restart. |
| **um módulo novo** | crio o deck, depois acrescento o módulo em `content/estrutura.json` na trilha certa. |
| **um exercício fora do app** | `content/praticas/<deckId>.json`, array `exercicios[]`. Tipos: `saida`, `numero`, `escolha`, `checklist`, `texto`, `pesquisa`. |
| **um curso** | `content/cursos/NN-<id>.md` com frontmatter (`id`, `deck`, `fase`, `ordem`, `nivel`, `tags`, `descricao`). |
| **um treino (chefão)** | `content/treinos/NN-<id>.json` — esquema em `content/treinos/README.md`. |
| **gerar com outra IA** | `content/PROMPT-MASTER.md` (decks, práticas, pesquisa, módulo) e `content/treinos/PROMPT-MASTER.md`. |
| **um modo de estudo** | `src/modes/<Nome>.jsx` + entrada em `MODOS` (`src/lib/util.js`) + o caso em `server/licao.js`. |
| **uma string na interface** | escrevo em português dentro de `t('…')` e acrescento a mesma frase como CHAVE em `src/i18n/en.json`. Não existe `pt.json`: **a chave é o próprio texto em PT** — sem tradução, a tela fica em PT em vez de mostrar a chave crua. `tests/i18n.test.js` reprova chave faltando. |

Depois de mexer em conteúdo: `npm run test:conteudo`. Depois de mexer em código: `npm test` e
`npm run build`.

## Pegadinhas que já custaram tempo

- `npm ci` com cache global **corrompe no PRoot** do celular → o script usa `--cache ./.npmcache`.
- Grade com `1fr` puro e filho de flex sem `min-width: 0` **estouram a tela** a 360 px.
- Medir largura no painel do navegador com viewport emulado **mente**; medir num `<iframe>` de 360 px.
- Painel do navegador **escondido não renderiza**: `getComputedStyle` devolve o valor inicial para sempre.
- O `/link` do bot responde `127.0.0.1` se o bot estiver no PC: **o bot vive onde vive o túnel** (celular).
- Token do Telegram é único: dois pollings = **409**. Não ligar o bot no PC e no celular ao mesmo tempo.
- Não existe mais DeepSeek gratuito no OpenRouter; o modelo `auto` resolve com a fila de gratuitos.
- `Number(null) === 0`: já mordeu duas vezes. Validar `null` **explicitamente** antes de converter nota.
- O gabarito **nunca** sai da API antes da entrega (vale para prática, atividade de curso e etapa de treino).

## Estado atual (18/09/2026)

**19 módulos · 551 termos · 107 exercícios · 6 cursos (48 lições) · 5 treinos · 104 lições no caminho.**
293 testes verdes. Interface em PT e EN.

Ver [`MUDANCAS-V2.md`](MUDANCAS-V2.md) (o changelog narrativo, etapa por etapa) e
[`HANDOFF.md`](HANDOFF.md) (status e **pendências** — o que ficou de fora está listado lá).

## Duas armadilhas deste código em particular

1. **`t` é a função de tradução E o nome que todo mundo dá a um item numa lambda.**
   `termos.map((t) => …)` dentro de um componente que traduz sombreia a função e quebra a tela.
   `tests/i18n.test.js` reprova o padrão — se ele acusar, renomeie o parâmetro (`tr`, `termo`, `x`).
2. **Duas chaves iguais num objeto literal não dão erro: a última vence.** Aconteceu em `src/api.js`
   (`licaoConcluir` do curso sobrescreveu a da lição) e a lição fechava num 404. Ao acrescentar uma
   rota, confira se o nome já existe.
