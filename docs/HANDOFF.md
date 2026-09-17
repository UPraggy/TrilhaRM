# HANDOFF — Trilha RM (status em 16/09/2026, fim do dia)

> Ponto de entrada para quem retoma (eu, outra IA ou o Rafael). Leia isto, depois
> [`PLANO-V2.md`](PLANO-V2.md). Manual de uso: `ME/PlanejamentoCarreira/20-app-trilha-rm.md`.
> Plano de estudo que o app executa: `ME/PlanejamentoCarreira/19-trilha-profundidade-2026-09.md`.

## Estado: NO AR, AGUARDANDO LIBERAÇÃO DO PLANO V2

- **Código**: tudo commitado e publicado em `git@github.com:UPraggy/TrilhaRM.git` (branch `main`,
  último commit `Cards: remove import nao usado…`). Árvore limpa.
- **Celular** (M52, `ssh -i /c/Users/rafae/.ssh/id_rsa -p 2222 root@192.168.15.49`): PM2 `trilharm`
  (8790) + `trilharm-tunnel` online, sincronizado com o `main`. `bash scripts/deploy-celular.sh --status`
  mostra a URL atual do túnel (muda a cada restart do túnel; o bot avisa).
- **Bot** `@trilhaRM_bot`: ligado **no celular**, chat conectado, mandando cards PNG. **Não ligar no PC**
  (token único; dois polling = 409).
- **Mentor IA**: key do OpenRouter salva no PC e no celular; modelo `auto` (fila de gratuitos).
- **Testes**: `npm test` → 223/223. `npm run test:conteudo` → limpo.
- **PLANO V2**: escrito e **não executado**. Aguarda o Rafael responder as 5 decisões de `PLANO-V2.md
  §B.9` e dizer "pode fazer".

## Conteúdo hoje

| Tipo | Quantidade | Onde |
|---|---|---|
| Decks | 13 (365 termos) | `content/decks/` |
| Práticas | 71 exercícios em 13 arquivos | `content/praticas/` |
| Cursos | 3 (24 lições, 16 atividades) | `content/cursos/*.md` |
| Treinos Especiais | 5 | `content/treinos/*.json` |
| Decks **fantasmas** (no plano, sem arquivo) | 6: `postgres-internals` `linux-processos` `mensageria` `resiliencia` `sistemas-distribuidos` `system-design` | referenciados em `content/trilhas.json` |

Prompt para gerar ou editar qualquer conteúdo em outra IA: `content/PROMPT-MASTER.md`.

## Mapa rápido do projeto atual (até o AI-GUIA existir)

| Preciso de… | Arquivo |
|---|---|
| Rotas do front | `src/App.jsx` |
| Menu (barra inferior e "Mais") | `src/components/Layout.jsx` |
| Tela inicial (ação do dia, continuar, 4 camadas, fases) | `src/pages/Home.jsx` |
| Sessão de estudo por modo | `src/pages/Estudo.jsx` + `src/modes/*.jsx` |
| Exercício fora do app | `src/pages/Pratica.jsx` (fluxo) · `server/praticas.js` (correção) |
| Curso / lição em Markdown | `src/pages/{Cursos,Curso,Licao}.jsx` · `server/{cursos,markdown}.js` · `src/components/Blocos.jsx` |
| Treino Especial | `src/pages/{Treinos,Treino}.jsx` · `server/{treinos,progresso-treinos}.js` |
| Progresso, SM-2, ofensiva | `server/{progresso,sm2}.js` · `data/progresso.json` (gitignored) |
| Mentor IA (OpenRouter, fila de modelos, CA do antivírus) | `server/mentor.js` |
| Bot do Telegram | `server/telegram.js` · tela `src/components/ConfigTelegram.jsx` |
| Cards PNG / QR | `server/{png,qrcode,cards}.js` · `GET /api/cards/<nome>.png` |
| Estado global do front | `src/store.jsx` · cliente HTTP `src/api.js` |
| Tokens e CSS | `src/styles.css` (tokens no topo) + `cursos.css` `treinos.css` `telegram.css` |
| Validar conteúdo | `node scripts/validar-conteudo.mjs` · `node scripts/validar-treinos.mjs` |
| Deploy no celular | `scripts/deploy-celular.sh` (`--status`, `--primeira`) |
| Guias de fiação já feitos | `INTEGRACAO-{TREINOS,TELEGRAM,CARDS}.md` (históricos; tudo já ligado) |

## Pegadinhas que já custaram tempo

- `npm ci` com cache global **corrompe no PRoot** do celular → o script usa `--cache ./.npmcache`.
- Grade com `1fr` puro e filho de flex sem `min-width: 0` **estouram a tela** a 360 px.
- Medir largura no painel do navegador com viewport emulado **mente**; medir num `<iframe>` de 360 px.
- O `/link` do bot responde `127.0.0.1` se o bot estiver no PC: o bot vive onde vive o túnel.
- Não existe mais DeepSeek gratuito no OpenRouter; o `auto` resolve.
- `Number(null) === 0`: já mordeu duas vezes (nota nula, saldo do AutoTrade). Validar `null` explícito.

## Como retomar

1. `cd ME/TrilhaRM && npm run dev` (Vite 5173 → API 8790) ou usar o preview `trilharm` do launch.json.
2. Ler `docs/PLANO-V2.md`; se o Rafael liberou, começar pela **Etapa 0** e abrir `docs/MUDANCAS-V2.md`.
3. Toda etapa termina com: `npm test` verde, `npm run build`, commit sem coautor (autor `upraggy`),
   `git push`, `bash scripts/deploy-celular.sh`, uma linha em `MUDANCAS-V2.md`.
4. Conteúdo novo: gerar com `content/PROMPT-MASTER.md`, salvar na pasta certa, rodar os validadores.
   Não precisa de build nem restart.

## Registro

| Data | O que |
|---|---|
| 16/09/2026 noite | Plano V2 escrito (Duolingo, estrutura Trilha→Módulo→Lição, mecânicas sem áudio, mais conteúdo, inglês + i18n). **Aguardando liberação.** |
| 16/09/2026 | Cards PNG com QR, bot no celular, Home reorganizada, 223 testes, 5 treinos, 3 cursos, 71 práticas. Tudo no ar. |
| 11/09/2026 | App criado a partir do chat 5 do ChatGPT; decks das fases 1–2; primeiro deploy. |
