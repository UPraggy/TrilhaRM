# MUDANÇAS V2 — changelog narrativo

> O que realmente mudou, etapa por etapa, e por quê. O plano está em [`PLANO-V2.md`](PLANO-V2.md);
> o mapa do projeto em [`AI-GUIA.md`](AI-GUIA.md).

## Decisões do Rafael (18/09/2026) — liberação do plano

As cinco perguntas de `PLANO-V2.md §B.9` foram respondidas com **"faz tudo"**:

1. **6 decks fantasmas** → criar os seis (19 módulos reais).
2. **Vocabulário** → **Trilha → Módulo → Lição** (a recomendação; é como o plano inteiro está escrito).
3. **Inglês** → completo: interface + bot do Telegram + cards PNG.
4. **XP** → XP **e** coroas. A meta diária continua sendo avaliações; XP é secundário.
5. **Ordem** → numérica, 0 → 8.

---

## Etapa 0 — Mapa e vocabulário ✅

**Por quê:** a queixa que abriu o V2 foi "não entendi a divisão de módulos e trilha". Antes de mexer em
tela, fixar as palavras.

- **`docs/AI-GUIA.md`** (novo): uma página com o vocabulário de três palavras, a tabela
  "preciso de X → arquivo Y" (agora incluindo os arquivos que as etapas seguintes criam), como rodar,
  como adicionar cada tipo de conteúdo e as pegadinhas que já custaram tempo.
- **`docs/MUDANCAS-V2.md`** (novo): este arquivo.
- Vocabulário fixado: **Trilha** (fase do plano) → **Módulo** (tema) → **Lição** (sessão de 8–12 itens).
  "Deck" continua sendo o nome do arquivo e do id na API; sumiu da interface.

---

## Etapa 1 — Modelo de domínio: `content/estrutura.json` ✅

**Por quê:** o mesmo tema estava espalhado em quatro pastas e nada os juntava. `trilhas.json` só
agrupava ids de deck — e apontava para seis que não existiam.

- **`content/estrutura.json`** (novo): a fonte da verdade da hierarquia. Declara 5 trilhas × 19 módulos;
  cada módulo aponta para o seu deck, curso(s), arquivo de práticas e treino(s), mais `titulo`,
  `resumo`, `icone`, `ordem`, `idioma` e `preRequisito`. **Nenhum arquivo de conteúdo se moveu.**
- **`server/estrutura.js`** (novo): resolve tudo contra decks/cursos/práticas/treinos e o progresso.
  Calcula coroas (nível médio 0–5), vencidos, nós concluídos e a **próxima ação**. Funções puras
  exportadas (`distribuir`, `contarNos`, `coroasDe`) para poderem ser testadas sozinhas.
- **Nós de um módulo**: `nNos = max(ceil(termos/6), leituras, exercícios)`, com teto de 12. Termos,
  leituras do curso e exercícios são distribuídos entre eles; o chefão (Treino Especial) entra como
  último nó. O nó fica disponível quando o anterior fecha; refazer é sempre permitido.
- **Pré-requisito é trava MACIA**: a tela avisa, nunca proíbe — ele estuda fora de ordem de propósito.
- **Rotas**: `GET /api/estrutura` (tudo resolvido) e `GET /api/modulos/:id`. `GET /api/trilhas` continua
  existindo por retrocompatibilidade, mas agora é **derivado** de `estrutura.json`.
- **`server/xp.js`** (novo): regras puras de XP e coroas. XP por item com peso por tipo
  (termo 10 · leitura 6 · exercício 20 · chefão 40), bônus de 15 por fechar um nó novo, meta de 60 XP/dia.
  ⚠️ A meta que conta para a **ofensiva continua sendo avaliações** — XP é a régua secundária.
- **`server/progresso.js`**: ganhou `nos`, `xp`, `diario` e `entrevistas` (versão 3). Um `progresso.json`
  antigo carrega com os campos vazios, sem migração e sem perda. `concluirNo()` **não** mexe na ofensiva:
  quem conta avaliação é `avaliar()`/`concluirPratica()`, item a item — senão uma lição de 10 itens
  contaria 11 avaliações.
- **`scripts/validar-conteudo.mjs`**: passou a validar a estrutura (deck órfão, deck em dois módulos,
  curso/treino apontado que não existe, pré-requisito fora da trilha) e imprime o mapa trilha → módulo.

## Etapa 5 (adiantada) — Conteúdo: os 6 decks fantasmas e o tipo `pesquisa` ✅

Executada antes da 2 porque tudo depois depende dos módulos existirem de verdade.

| Antes | Depois |
|---|---|
| 13 decks · 365 termos | **19 decks · 551 termos** |
| 71 exercícios em 13 arquivos | **107 exercícios em 19 arquivos** |
| 3 cursos · 24 lições · 16 atividades | **6 cursos · 52 lições · 26 atividades** |
| 6 módulos "em produção" | **0** |

- **Decks novos**: `postgres-internals` (35), `linux-processos` (33), `mensageria` (30),
  `resiliencia` (29), `sistemas-distribuidos` (29), `system-design` (30). Escritos no mesmo padrão dos
  anteriores, com `exemplo` ancorado nos sistemas reais do Rafael (Babita, AutoTrade, Trilha RM,
  NexusShell) e `perguntaEntrevista` + `perguntaEntrevistaEN` em todos.
- **6 arquivos de práticas novos**, 6 exercícios cada, com gabarito e critérios.
- **Tipo de entrega novo `pesquisa`** (`server/praticas.js`): o enunciado manda ler documentação ou um
  postmortem público e voltar com resposta curta **+ fonte**. Correção automática por palavras-chave
  obrigatórias (`deveConter`, com alternativas separadas por `|` e sem acento/caixa) e verificação de
  fonte (`temFonte`: URL, RFC/CVE/PEP/ADR ou citação entre aspas). Com `aberta: true`, quem avalia é o
  mentor IA. Há 6 exercícios de pesquisa, um por módulo novo.
- **Cursos novos**: `04-sistemas-que-nao-caem` (T3), `05-deploy-sem-downtime` (T4) e
  `06-interview-english` (T5, **escrito em inglês**). Agora há pelo menos um curso por trilha.
- **`02-postgres-que-nao-trava`** foi religado ao módulo `postgres-internals`, onde ele pertence.

## Etapa 2 — Shell e navegação: Início · Trilha · Biblioteca · Perfil ✅

- **`src/nav.js`** (novo): os menus são DADO, num lugar só. `PRINCIPAL` (4 destinos), `BIBLIOTECA`,
  `PERFIL` e `ROTAS_IMERSIVAS`. A barra inferior passou de 5 itens (que espelhavam a divisão técnica)
  para 4 (que espelham a intenção: o que fazer agora · o caminho · o acervo · eu).
- **`src/pages/Trilha.jsx`** (novo): o mapa vertical, com seletor das 5 trilhas, barra de progresso,
  coroas por módulo e o botão "continuar". Pré-requisito aparece como aviso, nunca como bloqueio.
- **`src/pages/Modulo.jsx`** (novo): os nós em ordem + "tudo deste tema" num lugar só (vocabulário,
  curso, laboratório, chefão, entrevista simulada).
- **`src/pages/Biblioteca.jsx`** e **`src/pages/Perfil.jsx`** (novos): as telas antigas (Glossário,
  Cursos, Laboratório, Treinos, Matriz, Config) continuam existindo — só passaram a ser alcançadas
  por aqui, em vez de disputar espaço na barra.
- **`src/pages/Anatomia.jsx`** (novo): o diagrama Trilha → Módulo → Lição e a tabela "quero X → vou em
  Y". É a resposta direta a "não entendi a divisão de módulos e trilha".
- **Tela cheia para a sessão**: `/licao/*` e `/entrevista/*` renderizam sem cabeçalho, sem barra e sem
  rodapé — só progresso e sair.
- **`src/components/{IconeModulo,Coroas}.jsx`** (novos): um ícone por módulo (do campo `icone`) e as
  coroas 0–5 (a mesma escala de sempre, agora com forma visual).
- `src/pages/Licao.jsx` do curso virou **`LicaoCurso.jsx`**; `/licao/:moduloId/:n` agora é a sessão.
- **Trocar de rota volta ao topo** (`Layout.jsx`): sem isso, sair de uma lição rolada até o fim abria a
  tela de resultado no meio, e ela aparecia em branco.

## Etapa 3 — A Lição e os 6 modos novos ✅

- **`server/licao.js`** (novo): monta o plano da sessão. Ordena os termos com **vencidos primeiro**
  (é a promessa do SM-2), escolhe o modo pelo NÍVEL de cada termo (`novo` → apresenta;
  `baixo` → reconhecer; `medio` → aplicar; `alto` → diagnosticar) e evita repetir o modo anterior.
  A escolha é determinística por semente: recarregar a página não embaralha a lição.
- **Sem campo novo no conteúdo**: `lacunaDe()` escolhe a palavra a apagar da própria definição
  (prefere uma palavra do termo) e `sequenciaDe()` extrai a sequência do padrão "(1) … (2) … (3) …"
  que a `profundidade` já usa. Módulos sem esse padrão simplesmente não recebem o modo "ordenar".
- **6 modos novos**: `SintomaCausa` (o mais valioso para o degrau 4 — um sintoma de produção, qual
  conceito explica), `Lacuna`, `Ordenar` (toque, não arrastar: arrastar a 360 px é impreciso),
  `Confundiveis` (contra o vizinho mais parecido por tags — distrator distante não mede nada),
  `Conexoes` (usa `relacionados[]`; marcar a mais conta) e `RecallLivre` (3 min escrevendo e SÓ DEPOIS
  a lista — ver antes vira reconhecimento, não recall).
- **`src/pages/Licao.jsx`** e **`Resultado.jsx`** (novos): um item por tela, barra no topo, e no fim
  XP, acertos, coroas, ofensiva e o próximo nó.
- **Itens que não são termo**: `leitura` (um bloco do curso dentro da sessão) e `missao` (o exercício
  de 20–50 min, que a lição PROPÕE e o laboratório entrega — meter um exercício longo no meio da
  sessão quebraria os 10 minutos).
- ⚠️ **Bug encontrado e corrigido no caminho**: `licaoConcluir` colidia com a chave de mesmo nome do
  curso no mesmo objeto literal de `src/api.js`. A última declarada vencia em silêncio e a lição
  fechava na rota do curso, dando 404. As do curso passaram a ter prefixo (`cursoLicaoConcluir`,
  `cursoLicaoVisto`), como as `cursoAtividade*`.

## Etapa 4 — Entrevista simulada, diário de erros e duelo ✅

- **`server/entrevista.js`** (novo): 3 a 5 rodadas em que o mentor pergunta **em cima da resposta
  anterior**; no fim avalia a conversa INTEIRA. Sem key ou sem rede, a entrevista continua com
  perguntas tiradas do próprio conteúdo (`perguntaEntrevista`) — degrada, não quebra. O módulo de
  inglês entrevista em inglês, porque `estrutura.json` marca `idioma: "en"`.
- **Diário de erros**: `progresso.diario` + rotas `/api/diario*` e `src/pages/DiarioErros.jsx`.
  Exporta em Markdown por `GET /api/diario.md`.
- **Duelo contra o passado** (`src/pages/Duelo.jsx` + `GET /api/licao/:m/:n/historico`): as duas
  últimas tentativas da MESMA lição, item a item, com o delta de nota.
- `mentor.completar` passou a ser exportado para a entrevista reusar a fila de modelos gratuitos.

## Etapa 7 — Sistema de design consolidado ✅ (parcial, com o número medido)

- **`src/styles/tokens.css`** (novo): o `:root` saiu de `styles.css` para um arquivo só dele, com o
  **contraste WCAG medido de cada cor** no cabeçalho. O achado que virou regra: `--rose` (#c5402a) dá
  4,0:1 sobre o fundo — **abaixo de AA em texto pequeno**. Ele fica para borda e fundo; texto de erro
  usa `--rose-soft` (6,4:1). É a mesma escolha que o app já fazia por intuição; agora está escrita.
- **`src/styles/base.css`** (novo): escala de espaçamento (`.mt-1`…`.mt-6`), utilitárias
  (`.ml-auto`, `.pre-wrap`, `.text-left`, `.nowrap`, `.rolavel`, `.btn--mini`), `:focus-visible`
  visível, `prefers-reduced-motion` desligando animação e **alto contraste opcional**
  (`data-contraste="alto"` + `prefers-contrast: more`). Tema claro **não** entra — é decisão de
  identidade.
- **Estilo inline: 182 → 65** (−64 %). Os `marginTop: N` espalhados viraram classes de escala.
  ⚠️ O critério do plano era "menos de 10". Não cheguei lá: dos 65 que restam, 8 são genuinamente
  dinâmicos (`--cor-modulo`, largura de barra) e os outros ~57 são valores únicos em telas antigas
  (`fontSize`, larguras específicas) que exigiriam abrir cada tela. Ficou registrado como pendência.

### Dois bugs de layout encontrados na verificação a 360 px

1. **A barra inferior estourava a tela.** `.bottomnav` é GRID com `repeat(5, …)` fixo (a V1 tinha 5
   itens). Com 4 filhos, ela media **428 px num viewport de 375**. A correção é uma linha
   (`grid-template-columns: repeat(4, …)` em `.bottomnav--4`) — e o que quase me enganou foi tentar
   resolver com `flex`, que não faz nada num contêiner grid.
2. **Uma palavra sem espaço rolava a página inteira.** O texto
   `Browser→DNS→TCP→TLS→Proxy→Node→DB→Response` é UMA palavra para o navegador, e empurrou a caixa de
   345 px para 413. Corrigido com `overflow-wrap: anywhere` no texto (e `normal` em `pre`/`code`, para
   comando não quebrar no meio). Conteúdo não deveria precisar evitar isso.

**Verificado a 360 px e a 375 px em 15 telas**: `scrollWidth === clientWidth` em todas.

## Etapa 8 — Testes, deploy e fechamento ✅

- **`tests/xp.test.js`** (21 testes): pesos, bônus de primeira vez, coroas presas em 0..5, e a guarda
  explícita de que **`nota: null` não é `nota: 0`** — `Number(null) === 0` já mordeu duas vezes nesta
  casa, e agora há teste.
- **`tests/licao.test.js`** (20 testes): `distribuir` não perde nem duplica item; `contarNos` com a
  regressão registrada (**exercício não pode criar nó** — quando criava, a lição vinha com 4 itens em
  vez de 8–12); `coroasDe` contando termo nunca visto como ZERO; `ordenarTermos` com vencido primeiro;
  `lacunaDe` e `sequenciaDe` extraindo do próprio conteúdo; escolha de modo determinística por semente.
- **`tests/pesquisa.test.js`** (16 testes): o que conta como fonte (URL, RFC com número, citação
  longa), casamento de palavra-chave sem acento e com alternativas por `|`, e — importante — que a
  mensagem de recusa **não entrega o gabarito** ("faltam 2 pontos", nunca "faltou fillfactor").
- **`tests/i18n.test.js`** (13 testes): todo `t('…')` existe em `en.json`, tradução vazia reprova, o
  servidor relê o idioma a cada chamada, e nenhum arquivo que traduz declara lambda com parâmetro `t`.
- **223 → 293 testes.** `npm run test:conteudo` limpo. `npm run build` ok.
- Docs atualizados: `AI-GUIA.md` (mapa + as duas armadilhas deste código), `HANDOFF.md` (status e a
  lista honesta de pendências) e este changelog.

## 23/09/2026 — Tutor, mentor que não chega mais cortado, cor e movimento

- **Tutor em toda tela** (`server/tutor.js` · `src/components/Tutor.jsx` · `POST /api/tutor`). Botão
  flutuante acima da barra inferior (na lição, só o ícone, acima dos botões de responder). O primeiro
  toque já **explica a tela**; depois vira chat. Ele "vê" a tela pelo texto visível de
  `<main id="conteudo">`, pelo que foi digitado nos campos (nunca em Ajustes) e pelo trecho selecionado.
  Conhece o app (vocabulário, mapa de 23 telas) e o aluno (trilha atual, próxima lição, ofensiva, XP).
  Usa a mesma fila de gratuitos do mentor, com 25 s por modelo. Servidor **sem estado**: o histórico
  vem do front (sessionStorage). Limite de 20 perguntas/min por IP (o túnel é público).
  Em lição ainda não respondida ele explica e dá pista, **sem entregar a resposta**.
- **Mentor cortado virava JSON cru na tela.** Causa: `max_tokens` 900 e modelos que raciocinam antes de
  responder (Nemotron) — o JSON parava no meio de `"faltou"`. Correção: 900 → 2000 (prática 2200,
  entrevista 2000) e `repararJSONCortado()` em `server/mentor.js`, que fecha string/array/objeto e
  aproveita tudo o que chegou inteiro (`cortada: true` avisa na tela).
- **Nota do mentor na escala 0–5** (`EscalaMentor` em `Comuns.jsx`): degraus coloridos até a nota, a
  nota "estala", e Certo/Faltou em blocos verde/âmbar.
- **Cor e movimento** (`src/styles/motion.css`, importado por último): hover só onde há mouse,
  `:active` que afunda no toque do celular, entrada em cascata das telas, barras que enchem, cor de
  cada trilha nos T1–T5 e nos chips da Trilha, notas 0–5 com a cor do nível, ponto no item ativo da
  barra inferior. `prefers-reduced-motion` desliga tudo.
- **5 `className` duplicados corrigidos** (DeckPage ×2, Pratica, Treino, Explique) — o botão
  Mostrar/Ocultar do DeckPage era um botão cru, sem estilo nem hover. `tests/jsx.test.js` agora reprova
  atributo JSX repetido. **293 → 309 testes.**
