# HANDOFF — Trilha RM (status em 18/09/2026)

> Ponto de entrada para quem retoma (eu, outra IA ou o Rafael). Leia isto, depois
> [`AI-GUIA.md`](AI-GUIA.md) (o mapa do projeto). O que mudou na V2 está em
> [`MUDANCAS-V2.md`](MUDANCAS-V2.md); o plano original, em [`PLANO-V2.md`](PLANO-V2.md).
> Manual de uso: `ME/PlanejamentoCarreira/20-app-trilha-rm.md`.
> Plano de estudo que o app executa: `ME/PlanejamentoCarreira/19-trilha-profundidade-2026-09.md`.

## Estado: PLANO V2 EXECUTADO

O Rafael liberou o V2 em 18/09/2026 respondendo **"faz tudo"** às cinco decisões do
`PLANO-V2.md §B.9`. As nove etapas (0 a 8) foram executadas. O que ficou de fora está em
**Pendências**, no fim deste arquivo — nada foi deixado implícito.

- **Código**: commitado em `git@github.com:UPraggy/TrilhaRM.git` (branch `main`). Árvore limpa.
- **Testes**: `npm test` → **293/293** (eram 223). `npm run test:conteudo` → limpo.
- **Layout**: verificado a **360 px e 375 px** em 15 telas, `scrollWidth === clientWidth` em todas.
- **Celular** (M52, `ssh -i /c/Users/rafae/.ssh/id_rsa -p 2222 root@192.168.15.49`): PM2 `trilharm`
  (8790) + `trilharm-tunnel`. `bash scripts/deploy-celular.sh --status` mostra a URL do túnel.
- **Bot** `@trilhaRM_bot`: ligado **no celular**. **Não ligar no PC** (token único; dois polling = 409).
- **Mentor IA**: key do OpenRouter no PC e no celular; modelo `auto`.

## O que o app é hoje

**Três palavras: Trilha → Módulo → Lição.** Trilha = uma fase do plano (T1…T5). Módulo = um tema, que
junta *tudo* daquele tema. Lição = uma sessão de 8–12 itens, 5–10 min, um item por tela.

| | Antes da V2 | Agora |
|---|---|---|
| Decks / termos | 13 / 365 | **19 / 551** |
| Exercícios | 71 | **107** |
| Cursos · lições · atividades | 3 · 24 · 16 | **6 · 48 · 26** |
| Módulos "em produção" (sem deck) | 6 | **0** |
| Lições no caminho | — | **104 nós** |
| Modos de estudo | 8 | **14** |
| Testes | 223 | **293** |
| Idiomas | PT | **PT / EN** (site, bot e cards) |

## Mapa rápido (o completo está em [`AI-GUIA.md`](AI-GUIA.md))

| Preciso de… | Arquivo |
|---|---|
| Quem é módulo de quem | `content/estrutura.json` ← **a fonte da verdade da hierarquia** |
| Resolver estrutura + progresso | `server/estrutura.js` → `GET /api/estrutura` |
| Montar a sessão de um nó | `server/licao.js` → `GET /api/licao/:moduloId/:n` |
| XP e coroas (regras puras) | `server/xp.js` |
| Entrevista simulada multi-turno | `server/entrevista.js` |
| Diário de erros | rotas `/api/diario*` em `server/index.js` · `src/pages/DiarioErros.jsx` |
| Idioma (site) | `src/i18n/{nucleo.js,index.jsx,en.json}` |
| Idioma (bot e cards) | `server/i18n.js` |
| Tokens e utilitárias | `src/styles/{tokens.css,base.css}` · telas novas em `src/v2.css` |

## Pegadinhas que já custaram tempo

- `npm ci` com cache global **corrompe no PRoot** do celular → o script usa `--cache ./.npmcache`.
- Grade com `1fr` puro e filho de flex sem `min-width: 0` **estouram a tela** a 360 px.
- **`.bottomnav` é GRID** com colunas fixas: mudar o número de itens exige mudar
  `grid-template-columns`. `flex` não faz nada ali. (Custou um estouro de 428 px num viewport de 375.)
- **Palavra sem espaço rola a página inteira** (`Browser→DNS→TCP→…`). Resolvido com
  `overflow-wrap: anywhere` em `src/styles/base.css` — mas se voltar a aparecer, é aí que se olha.
- Medir largura no painel do navegador com viewport emulado **mente**; medir num `<iframe>` de 360 px.
- Painel do navegador **escondido não renderiza**: `getComputedStyle` devolve o valor inicial.
- **Duas chaves iguais num objeto literal**: `licaoConcluir` do curso sobrescreveu a da lição em
  `src/api.js` e a lição fechava num 404. As do curso agora têm prefixo (`cursoLicaoConcluir`).
- **`t` da tradução vs `(t)` de lambda**: sombreou em `Biblioteca.jsx` e quebrou a tela.
  `tests/i18n.test.js` agora reprova o padrão no build inteiro.
- O `/link` do bot responde `127.0.0.1` se o bot estiver no PC: **o bot vive onde vive o túnel**.
- Não existe mais DeepSeek gratuito no OpenRouter; o `auto` resolve.
- `Number(null) === 0`: `server/xp.js` trata `nota` nula como *ausência de nota*, não como zero —
  e há teste para isso.

## Como retomar

1. `cd ME/TrilhaRM && npm run dev` (Vite 5173 → API 8790) ou o preview `trilharm` do launch.json.
2. Ler [`AI-GUIA.md`](AI-GUIA.md); o vocabulário e o "preciso de X → arquivo Y" estão lá.
3. Toda mudança termina com: `npm test` verde, `npm run test:conteudo`, `npm run build`, commit sem
   coautor (autor `upraggy`), `git push`, `bash scripts/deploy-celular.sh`, e uma linha em
   `MUDANCAS-V2.md`.
4. Conteúdo novo: gerar com `content/PROMPT-MASTER.md`, salvar na pasta certa, rodar os validadores.
   Não precisa de build nem restart.

## Pendências (o que NÃO foi feito, e por quê)

1. **i18n das telas de acervo.** O mecanismo está completo (site + bot + cards, com teste). Estão
   traduzidas: navegação, Início, Trilha, Módulo, Lição, Resultado, Biblioteca, Perfil, Anatomia,
   Diário, Duelo e os 6 modos novos — ou seja, **o caminho que se percorre todo dia**.
   Ainda caem no PT com EN ligado: Glossário, Matriz, Cursos, Curso, LicaoCurso, Laboratório,
   Prática, Treinos, Treino, DeckPage, Estudo e a parte do Mentor em Ajustes.
   Isso **não quebra nada** — a chave é o próprio texto em português, então string sem tradução
   aparece em PT. Para terminar: envolver com `t(...)` e acrescentar as chaves em
   `src/i18n/en.json`; `npm test` aponta exatamente o que falta.
2. **Estilo inline: 65 restantes** (de 182). 8 são dinâmicos e devem ficar; ~57 são valores únicos
   em telas antigas. O critério do plano era "menos de 10".
3. **Mensagens de TEXTO do bot** ainda são PT fixas; os **cards PNG** já são bilíngues. O
   `server/i18n.js` está pronto e o dicionário existe — falta trocar as strings em `telegram.js`.
4. **Conteúdo continua em PT-BR**, por decisão do plano (§B.10: "não traduzir conteúdo em massa por
   IA nesta rodada"). O curso `06-interview-english.md` é escrito em inglês de propósito.

## Registro

| Data | O que |
|---|---|
| 18/09/2026 | **V2 executado**: estrutura Trilha→Módulo→Lição, 104 lições, 6 decks novos (551 termos), 6 modos novos, XP e coroas, entrevista simulada, diário de erros, duelo, i18n PT/EN, tokens e utilitárias. 293 testes. |
| 16/09/2026 noite | Plano V2 escrito. Aguardando liberação. |
| 16/09/2026 | Cards PNG com QR, bot no celular, Home reorganizada, 223 testes, 5 treinos, 3 cursos, 71 práticas. |
| 11/09/2026 | App criado a partir do chat 5 do ChatGPT; decks das fases 1–2; primeiro deploy. |
