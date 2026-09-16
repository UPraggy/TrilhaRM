# Trilha RM

App pessoal para **aprender e decorar termos de engenharia de software** de todas as formas — flashcards,
quiz, digitar, associar, verdadeiro/falso, "explique" (pergunta de entrevista), glossário, revisão espaçada
(SM-2), matriz de nível e ofensiva diária. Estilo Exercism / Anki / Duolingo, na identidade visual "Rafael MR".

- Frontend: Vite + React 18 em **JSX** (sem TypeScript), CSS puro com variáveis.
- Backend: Express, sem banco — o progresso vive em `data/progresso.json` (escrita atômica).
- Conteúdo: arquivos JSON em `content/decks/`. Soltar um JSON novo na pasta basta.
- Roda no PC e no celular Android (Termux/PRoot, Node 22, PM2). Mobile-first.

## Como rodar

```bash
npm i
npm run dev        # Vite em http://localhost:5173 (proxy /api → 8790) + Express em :8790 com --watch
```

Produção / celular:

```bash
npm run build      # gera dist/
npm start          # Express na 8790 servindo dist/ + /api   (PORT=9000 npm start para trocar a porta)
```

Com PM2 (é assim que roda no celular):

```bash
npm run build
pm2 start ecosystem.config.cjs     # app "trilharm", PORT=8790
pm2 save
```

Depois de mudar código: `npm run build && pm2 restart trilharm`. Decks novos **não** precisam de restart —
o servidor recarrega `content/` quando o mtime muda.

## Scripts

| script          | o que faz                                                                  |
| --------------- | -------------------------------------------------------------------------- |
| `npm run dev`   | `concurrently`: Vite (5173) + `node --watch server/index.js` (8790)        |
| `npm run build` | build do Vite para `dist/`                                                 |
| `npm start`     | só o Express (8790): serve `dist/` estático + `/api`. Porta por `PORT`     |
| `npm run preview` | preview do Vite do build (sem API — use `npm start` para o conjunto)     |

## Práticas — exercícios resolvidos fora do app

Além de decorar termos, o app tem um **laboratório**: exercícios reais (`content/praticas/<deckId>.json`)
que você resolve no terminal, no psql, no Docker ou no papel e volta para registrar a resposta.

- **Tipos de entrega**: `saida` (cola a saída do comando; o servidor compara normalizando espaços/case),
  `numero` (com tolerância ou faixa), `escolha` (múltipla escolha), `texto` (código/postmortem/raciocínio:
  você compara com o gabarito e se dá a nota 0–5; pode pedir a opinião do **mentor IA**) e `checklist`.
- **Nota automática** (saída/número/escolha): 4 de primeira sem dica · 3 com dica ou até 3 tentativas ·
  2 depois disso · 1 se revelou a solução antes. Qualquer nota pode ser ajustada depois.
- **A nota vira uma avaliação SM-2 no termo principal** do exercício (modo `pratica`): conta para nível,
  revisão e ofensiva, como qualquer outro modo.
- O exercício fica **em andamento** entre o "Comecei" e a entrega; o rascunho da resposta é salvo no
  servidor, então dá para começar no PC e terminar no celular.
- Gabarito e respostas certas **não saem da API** antes da hora (`GET /api/praticas/:deck/:ex` só devolve
  `solucao` depois de concluir ou revelar).

Esquema completo, regras e boas práticas em [`content/praticas/README.md`](content/praticas/README.md).
Valide tudo (decks, práticas, trilhas) sem subir o servidor:

```bash
node scripts/validar-conteudo.mjs
```

### Mentor IA (OpenRouter, gratuito)

Nos modos **Explique** e **Praticar (texto)**, um modelo gratuito do OpenRouter (DeepSeek por padrão) lê a
sua resposta, compara com o gabarito e sugere nível, o que faltou e uma pergunta de aprofundamento.
Cole a key em **Config** (fica só em `data/config.json`, gitignored) ou exporte `OPENROUTER_API_KEY`
(`.env` na raiz também é lido). Sem key, o resto do app funciona normalmente.

## Conteúdo hoje (16/09/2026)

| Fase | Decks | Termos | Exercícios |
| --- | --- | --- | --- |
| F1 · Fundamentos do que já uso | node-internals · http-networking | 60 | 10 |
| F2 · Medir e prever o comportamento | concorrencia-performance · observabilidade · cache | 72 | 18 |
| F3 · Resiliência, distribuídos e arquitetura | arquitetura-software | 30 | 6 |
| F4 · Produção, segurança e equipe | testes · containers-deploy · seguranca · producao-equipe | 103 | 22 |
| F5 · Fundamentos e entrevista | cs-fundamentals · algoritmos-estruturas · vocabulario-entrevista-en | 100 | 15 |
| **Total** | **13 decks** | **365** | **71** |

## Como adicionar um deck

Crie `content/decks/<qualquer-nome>.json` seguindo o esquema:

```json
{
  "id": "node-internals",
  "titulo": "Node.js internals",
  "fase": 1,
  "trilha": "Backend Engineering",
  "ordem": 1,
  "descricao": "1-2 frases",
  "termos": [
    {
      "id": "event-loop",
      "termo": "Event Loop",
      "termoEN": "Event Loop",
      "definicao": "1-2 frases: o que é",
      "profundidade": "3-6 frases: como funciona por dentro, onde quebra, trade-off",
      "exemplo": "exemplo concreto (pode ter código curto, com \\n)",
      "perguntaEntrevista": "pergunta de entrevista em PT",
      "perguntaEntrevistaEN": "mesma pergunta em EN",
      "relacionados": ["libuv", "microtasks"],
      "tags": ["node", "concorrencia"],
      "nivelAlvo": 4
    }
  ]
}
```

Regras:

- `id` do deck e dos termos únicos (kebab-case). Deck com `id` repetido é ignorado com aviso.
- `relacionados` aceita `"termoId"` (mesmo deck) ou `"deckId/termoId"`. Vira link no glossário.
- Campos faltando não quebram o app: `definicao` vazia gera aviso; `perguntaEntrevista` vazia tira o termo do modo Explique.
- Deck com `"exemplo": true` ganha um selo "exemplo" (o `0-exemplo.json` que vem junto pode ser apagado).
- Avisos de conteúdo (JSON inválido, id duplicado, termo sem definição) aparecem no topo da tela inicial e em `GET /api/saude`.

### Fases (opcional): `content/trilhas.json`

```json
{
  "fases": [
    { "numero": 1, "titulo": "Fundamentos do que já uso", "descricao": "...", "decks": ["node-internals", "http"] }
  ]
}
```

Se o arquivo não existir, o app agrupa os decks pelo campo `fase`. Decks que existem mas não estão em
nenhuma fase declarada são anexados à fase do próprio campo `fase`.

## Como adicionar um curso (futuro)

`content/cursos/` já existe com um `README.md` descrevendo o formato
(`{ id, titulo, licoes: [{ id, titulo, markdown }] }`). A tela ainda é um placeholder "em breve" no menu.

## Modos de estudo

| #  | modo                | como avalia                                                                 |
| -- | ------------------- | --------------------------------------------------------------------------- |
| 1  | Flashcards          | você se dá nota 0–5. Swipe ←/→ no celular, `espaço` vira, `0–5` avalia no PC |
| 2  | Quiz / Quiz invertido | 4 opções (distratores do mesmo deck, depois decks da mesma fase). Acerto = 3, erro = 1 |
| 3  | Digitar             | case-insensitive, sem acento, Levenshtein ≤ 2 = "quase". Exato = 4, quase = 3, revelado = 1. Dica de 1ª letra após 2 erros |
| 4  | Associar            | 6 pares termo ↔ definição. Sem erro no termo = 3, com erro = 1              |
| 5  | Verdadeiro ou falso | definição real ou trocada por outro termo. Acerto = 3, erro = 1              |
| 6  | Explique            | pergunta de entrevista PT/EN, você escreve, compara com a profundidade e dá nota 0–5. A resposta fica guardada |
| 7  | Glossário           | busca instantânea, filtro por deck/tag/nível, relacionados como links      |
| 8  | Revisão espaçada    | SM-2 simplificado; "Revisar agora" mistura os vencidos de todos os decks em modos aleatórios |
| 9  | Matriz de nível     | Deck × nível médio, % ≥3, % ≥4, nunca vistos, vencidos; barra por fase; histórico de 28 dias |
| 10 | Ofensiva            | dias consecutivos com ≥ 10 avaliações; no topo de toda tela                 |

Escala (do Rafael): **0** desconheço · **1** reconheço · **2** explico · **3** aplico · **4** diagnostico · **5** ensino/defendo.

Rotas de estudo: `/estudar/<modo>?fonte=deck:<id>` · `?fonte=tudo` · `?fonte=revisao` · `?fonte=termo:<deck/termo>`;
`&so=vencidos` restringe aos vencidos; `&n=50` muda o tamanho da sessão (padrão 30). Modos:
`flashcards` `quiz` `quiz-inv` `digitar` `associar` `vf` `explique` `misto`.

## SM-2 (server/sm2.js)

Cada avaliação atualiza `nivel` (média móvel curta), `facilidade` (fator SM-2, 1.3–3.0), `intervaloDias`
(1 → 6 → ×facilidade; nota < 3 volta a 0/1) e `proximaRevisao` (data local). Um termo está "vencido" quando
`proximaRevisao <= hoje` ou nunca foi visto.

## API

| método | rota                        | corpo / resposta                                                 |
| ------ | --------------------------- | ---------------------------------------------------------------- |
| GET    | `/api/decks`                | lista resumida + `erros` de conteúdo                             |
| GET    | `/api/decks/:id`            | deck completo                                                    |
| GET    | `/api/termos`               | todos os termos de todos os decks (com `deckId`, `deckTitulo`)   |
| GET    | `/api/trilhas`              | `{ fases, origem: 'trilhas.json' | 'auto' }`                     |
| GET    | `/api/progresso`            | progresso completo (streak já "vivo")                            |
| GET    | `/api/progresso/revisao`    | vencidos hoje, por deck                                          |
| POST   | `/api/progresso/avaliar`    | `{ deckId, termoId, nota, modo, resposta? }` → `{ termo, streak, hoje }` |
| POST   | `/api/progresso/reset`      | zera tudo (o front pede confirmação)                             |
| GET    | `/api/saude`                | `{ ok, hoje, decks, erros }`                                     |

Sem autenticação — fica atrás do túnel.

Formato de `data/progresso.json`:

```json
{
  "termos": { "deckId/termoId": { "nivel": 3.3, "vistos": 4, "acertos": 3, "erros": 1, "facilidade": 2.36, "intervaloDias": 6, "proximaRevisao": "2026-09-17", "ultimaResposta": "…", "ultimoModo": "quiz", "respostasExplique": [] } },
  "streak": { "atual": 3, "melhor": 5, "ultimoDia": "2026-09-11" },
  "historico": [{ "dia": "2026-09-11", "avaliacoes": 14 }]
}
```

## Estrutura de pastas

```
TrilhaRM/
├─ package.json            scripts dev/build/start
├─ vite.config.js          porta 5173, proxy /api → 8790
├─ ecosystem.config.cjs    PM2 (app trilharm, PORT=8790)
├─ index.html
├─ content/
│  ├─ decks/*.json         os decks (0-exemplo.json é descartável)
│  ├─ trilhas.json         opcional: fases
│  └─ cursos/README.md     formato futuro dos cursos
├─ data/
│  ├─ .gitkeep
│  └─ progresso.json       gerado em runtime (ignorado no git)
├─ public/
│  ├─ favicon.svg
│  └─ fonts/               Space Grotesk (Regular/Medium/Bold) + OFL
├─ server/
│  ├─ index.js             Express: /api + dist/ + fallback SPA
│  ├─ decks.js             leitura/validação/recarga de content/
│  ├─ progresso.js         persistência atômica + streak + histórico
│  └─ sm2.js               algoritmo de revisão
└─ src/
   ├─ main.jsx, App.jsx    bootstrap + rotas
   ├─ store.jsx            contexto: decks, termos, progresso, avaliar()
   ├─ api.js               cliente fetch
   ├─ styles.css           tokens da identidade (void-frio), grade blueprint, componentes
   ├─ lib/                 texto.js (normalizar/Levenshtein), util.js, sessao.js (fila, distratores, plano)
   ├─ components/          Logo (monograma RM em <path>), Layout, Nivel (0–5), Icones, Comuns
   ├─ pages/               Home, DeckPage, Estudo, Glossario, Matriz, Cursos
   └─ modes/               Flashcards, Quiz, Digitar, Associar, VF, Explique
```

## Identidade visual

Paleta **void-frio**: fundo `#0a0c12`, superfícies `#11131c` / `#181b26`, periwinkle `#9db1ea` (estrutura,
links, foco), âmbar `#eaa94e` (primária/CTA), bone `#f1ede2` (texto), verde `#7bbf5e` (acerto), rose
`#c5402a` (erro). Grade de blueprint de 24px no fundo, nós de construção nos cantos dos cards, Space Grotesk
servida localmente (`public/fonts`) — funciona offline.

## Acesso remoto (túnel Cloudflare)

O `ecosystem.config.cjs` traz um segundo processo, `trilharm-tunnel` (`tunnel.cjs`), que sobe um
**quick tunnel** do `cloudflared` apontando para a porta do app e grava a URL pública em
`data/tunnel-url.txt`. O app expõe em `GET /api/tunnel`. Não precisa de conta Cloudflare.

```bash
pm2 start ecosystem.config.cjs      # sobe trilharm + trilharm-tunnel
pm2 save
cat data/tunnel-url.txt             # ou: curl -s localhost:8790/api/tunnel
```

Atenção: a URL de quick tunnel **muda a cada restart** do cloudflared. Sem autenticação — quem tiver
a URL entra; se preferir, deixe só o acesso pela LAN (`pm2 stop trilharm-tunnel`).
Requer `cloudflared` no PATH ou `CLOUDFLARED_PATH=/caminho/cloudflared`.
