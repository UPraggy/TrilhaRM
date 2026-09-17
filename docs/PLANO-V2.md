# Plano V2 — Trilha RM organizado como Duolingo (pré-implementação)

> Documento escrito **antes** de qualquer alteração de código, a pedido do Rafael: primeiro a ideia,
> depois o plano, depois **aguardar liberação** para executar. Nada aqui foi implementado.
> Status e retomada: [`HANDOFF.md`](HANDOFF.md). Manual atual do app: `ME/PlanejamentoCarreira/20-app-trilha-rm.md`.
> Referência de organização estudada: `E:/projects/ClaudeCode/ClaudCodeCodes/escritorio-virtual`.

## O pedido (16/09/2026)

> "pode fazer Mecânicas que precisam de código e valem o investimento: sem o áudio, quero que veja o
> projeto atual e veja o que pode melhorar com base no escritorio-virtual, digo em estrutura, módulos e
> organização de interface, pois a atual está meio confusa mas com uma identidade visual bonita, mas
> ainda não entendi a divisão de módulos e trilha, e se puder aumente o conteúdo, exercícios no site, e
> práticos fora dele precisando só retornar o resultado que deu o código ou pesquisa, claro se
> necessário a IA avaliando se for pergunta aberta, melhore para um estilo Duolingo, quero que
> primeiramente só planeje e documente depois aguarde para eu liberar fazer. Quero também uma melhoria
> no módulo inglês e poder converter todo o site para inglês, documente a ideia primeiro, depois planeje
> e depois aguarde liberação para executar, e claro deixe um handoff de status para isso e plano."

---

# PARTE A — A ideia

## A.1 Por que está confuso hoje (diagnóstico honesto)

O app cresceu em um dia por quatro frentes em paralelo. Cada frente ficou boa sozinha, mas juntas
expõem o usuário a **sete substantivos** para falar de estudo:

| Palavra na tela | O que é de fato | Onde vive |
|---|---|---|
| Fase | um período do plano de carreira (F1…F5) | `content/trilhas.json` |
| Trilha | usado como sinônimo de fase (e o app se chama Trilha RM) | título da Home |
| Deck | um tema com ~30 termos para decorar | `content/decks/*.json` |
| Modo | uma forma de estudar um deck (flashcards, quiz…) | `src/modes/` |
| Prática | exercício resolvido fora do app, agrupado por deck | `content/praticas/*.json` |
| Curso | aula em Markdown com lições e atividades, ligado a um deck | `content/cursos/*.md` |
| Treino Especial | temporada de 5 a 30 dias com etapas, ligada a decks | `content/treinos/*.json` |

Três problemas concretos saem disso:

1. **O mesmo tema está espalhado em quatro lugares.** "Cache" existe como deck (22 termos), como
   prática (6 exercícios) e como lição no curso de Postgres, e é etapa em um treino. Na tela, são quatro
   menus diferentes. O aluno precisa saber onde procurar; o app não junta.
2. **A Home explica "quatro camadas" (Decorar / Praticar / Aprender / Treinar)**, que é a divisão
   *técnica* do conteúdo, não o caminho de estudo. É correto e não ajuda a decidir o que fazer hoje.
3. **Seis decks fantasmas.** `content/trilhas.json` lista 19 decks, o plano 19 fala em 19 decks, mas
   só **13 existem**. Faltam `postgres-internals`, `linux-processos` (F1), `mensageria` (F2),
   `resiliencia`, `sistemas-distribuidos`, `system-design` (F3). O app ignora em silêncio; a Fase 1
   aparece com 2 decks quando o plano promete 4. Isso faz a divisão parecer arbitrária.

O que **não** é problema e fica: a identidade visual, a escala 0–5, o SM-2, o conteúdo em arquivo, o
mentor, o bot, o laboratório fora do app.

## A.2 O modelo mental novo: Trilha → Módulo → Lição (como o Duolingo)

Uma hierarquia só, com três palavras, e **tudo de um tema mora dentro do módulo daquele tema**.

```
TRILHA  (= a fase do plano; 5 trilhas; um caminho vertical na tela, como o Duolingo)
 └─ MÓDULO  (= um tema; hoje "deck"; ~19 módulos no total)
     ├─ vocabulário      ← o deck de termos (decorar, com os modos de hoje)
     ├─ lições           ← o curso em Markdown daquele tema (aprender)
     ├─ exercícios       ← as práticas fora do app + exercícios interativos no site (praticar)
     └─ chefão           ← o Treino Especial do tema, destravado ao final (provar)
         (uma LIÇÃO = sessão curta de 8–12 itens que mistura os quatro, dura 5–10 min)
```

**O que muda para o aluno:** ele abre o app, vê **a trilha atual como um mapa vertical** (nós = módulos,
o atual pulsando), toca no módulo e vê **as lições em ordem** (nó 1, nó 2, nó 3… chefão). Cada nó é uma
sessão curta com barra de progresso no topo, um item por tela, XP no fim. As "coroas" do nó são a escala
0–5 que ele já usa. Nunca precisa escolher entre "Praticar", "Cursos" e "Treinos": a lição já mistura.

**O que muda para o conteúdo:** nada de arquivo se move. `decks/`, `praticas/`, `cursos/` e `treinos/`
continuam onde estão. O que entra é **um arquivo declarativo** que amarra tudo por tema
(`content/estrutura.json`), no espírito do `estrutura.js` do escritorio-virtual: módulo = dado, não tela.

**O que fica acessível por fora do caminho:** o glossário (buscar um termo), a matriz (medir), o
laboratório completo (lista de todos os exercícios, para quem quer escolher) e a biblioteca (todos os
cursos). Eles viram "Biblioteca" e "Perfil", não destinos principais.

## A.3 O que o escritorio-virtual ensina (e o que não)

Estudei `escritorio-virtual/app` (React 18 + Vite, JSX puro, PWA sem backend, também um app de estudo
gamificado: módulos → trilhas → missões). Relatório completo no fim deste arquivo (Apêndice).

**Levar:**

1. **`AI-GUIA.md` dentro do app**: uma página com vocabulário, tabela "preciso de X → arquivo Y",
   pegadinhas e "como adicionar coisa nova". É o antídoto direto para "não entendi a divisão".
2. **Estrutura do domínio como dado declarativo** (`estrutura.js`): módulos com `id, ordem, cor, icone`;
   a UI só renderiza. Aqui vira `content/estrutura.json`.
3. **Shell com menus declarativos e tela cheia para a sessão** (`AppShell.jsx` + `routes.jsx`): arrays
   `PRINCIPAL/MAIS/BOTTOM` alimentam sidebar no desktop e barra inferior no celular; a rota de sessão
   (`/missao/*`) renderiza **sem shell**, só a barra de progresso e o botão de sair. O Trilha RM já fez
   metade disso na Home nova; falta a tela cheia da sessão.
4. **Tokens + classes utilitárias em vez de estilo inline**: `colors.css` comentado com contraste WCAG
   e `.btn/.chip/.panel/.grid/.progress/.empty` globais. O Trilha RM tem os tokens, mas tem estilo inline
   espalhado (`style={{ marginTop: 12 }}` em dezenas de lugares).
5. **O app explica a si mesmo**: onboarding de 3 passos com o "por quê" de cada pergunta, tela
   `/anatomia` com o diagrama da hierarquia e "onde está cada coisa", e **estados vazios que ensinam a
   próxima ação** em vez de "nada aqui".

Bônus de formato: o par **`PLANO-Vn.md` (estado atual / mudança / arquivos / critério de aceite) +
`MUDANCAS-Vn.md`** (changelog narrativo). Este documento já segue esse formato.

**Não levar:**

1. Estilo inline gigante com `onMouseEnter` mutando `style` (o escritorio contradiz o próprio design
   system em `Modulos.jsx`).
2. Agregador manual com 80 imports e 80 spreads (`conteudo/index.js`). O Trilha RM já lê a pasta pelo
   mtime; manter assim.
3. Ausência de i18n, de tema e de camada assíncrona. O escritorio é "tudo local, tudo síncrono, tudo em
   PT". Para o inglês da interface **não há nada para copiar**; é decisão do zero (Parte B, etapa 6).

## A.4 Estilo Duolingo: o que exatamente copiar

Não é a coruja. São cinco mecânicas que fazem a pessoa voltar:

| Mecânica | Como fica no Trilha RM |
|---|---|
| **Caminho vertical com nós** | a trilha atual como mapa; nó = módulo; dentro, nós = lições; chefão no fim |
| **Sessão curta de itens variados** | lição de 8–12 itens, um por tela, misturando os modos existentes e os novos; barra de progresso no topo; sem menu |
| **Feedback imediato e tela de resultado** | verde/vermelho no ato, com a explicação curta; no fim: XP, acertos, termos que subiram de nível |
| **Coroas por nó** | a escala 0–5 vira coroas do módulo (nível médio dos termos); "nível 3 = aplico" continua sendo a régua |
| **Ofensiva e meta diária** | já existe (10 avaliações); ganha a meta em XP e o "ainda faltam N para fechar o dia" na tela de resultado |

O que **não** copiar do Duolingo: vidas/corações (punição), loja, ligas com estranhos. É app pessoal.

## A.5 Aprender fazendo fora do app, com o app só recebendo o resultado

É o que já funciona nas práticas e vai virar o padrão de exercício em toda lição:

- **Saída/número**: o aluno roda no terminal e cola o resultado. O servidor corrige. Já existe.
- **Pesquisa** (tipo novo): a tarefa é ler a documentação ou um postmortem público e voltar com uma
  resposta curta + a fonte (URL ou citação). Correção: palavras-chave obrigatórias (automático) **ou**
  mentor IA quando a pergunta é aberta. Isso é "aprender pesquisando", com o app só conferindo.
- **Aberta**: código, ADR, explicação. O mentor IA avalia contra critérios, como já faz.

Regra que se mantém: o gabarito **nunca** sai da API antes da entrega.

## A.6 Inglês em duas camadas

**Camada 1: o módulo de inglês melhor.** O deck `vocabulario-entrevista-en` (50 termos) vira um módulo
completo com lições em inglês, exercícios de escrita (pitch, STAR, explicar sistema), a
**correção de inglês do mentor** (já existe no retorno `correcaoIngles`, hoje quase invisível na tela) e
o **modo "explique em inglês"** para qualquer termo dos outros módulos (a pergunta EN já existe em
`perguntaEntrevistaEN`). **Sem áudio**, por decisão do Rafael.

**Camada 2: a interface inteira em inglês.** Um seletor PT/EN na Config (e no bot). Toda string da
interface sai de um dicionário; o conteúdo continua em PT-BR por padrão, e onde já existe campo EN
(`termoEN`, `perguntaEntrevistaEN`) o app mostra a versão EN. Isso também serve ao plano de carreira:
ele passa a usar o próprio app em inglês todo dia.

---

# PARTE B — O plano

Cada etapa traz: estado atual, mudança, arquivos a tocar, critério de aceite e esforço (em sessões de
trabalho de ~2 h com agentes em paralelo). **Ordem recomendada é a numérica**; as etapas 4, 5 e 6 podem
correr em paralelo depois da 2.

## Etapa 0 — Mapa e vocabulário (docs, sem código)

**Estado atual:** não existe mapa do projeto no repo; o vocabulário está espalhado; `README.md` é
técnico e longo.
**Mudança:** criar `docs/AI-GUIA.md` (1 página: o que é, rodar, vocabulário Trilha/Módulo/Lição,
tabela "preciso de → arquivo", como adicionar conteúdo, pegadinhas, estado atual) e fixar o vocabulário
que a Parte A define. Reescrever as descrições da Home/Anatomia com essas três palavras.
**Arquivos:** `docs/AI-GUIA.md` (novo), `docs/MUDANCAS-V2.md` (novo, vai crescendo), `README.md` (só
a abertura).
**Critério de aceite:** uma pessoa nova lê o AI-GUIA e acha qualquer arquivo em menos de um minuto.
**Esforço:** 0,5 sessão.

## Etapa 1 — Modelo de domínio: `content/estrutura.json`

**Estado atual:** `content/trilhas.json` só agrupa ids de deck em fases e referencia 6 decks que não
existem; cursos e treinos apontam para decks por convenção (`deck:` no frontmatter, `decks[]` no treino)
mas nada junta os quatro tipos por tema.
**Mudança:** `content/estrutura.json` declara **trilhas → módulos**, e cada módulo aponta para o seu
deck, curso(s), arquivo de práticas e treino(s), além de `titulo`, `descricao`, `cor`, `icone`, `ordem`
e `preRequisito`. O servidor monta `GET /api/estrutura` com tudo resolvido (contagens, progresso por
módulo, próximo nó). `trilhas.json` continua aceito por retrocompatibilidade e vira gerado.
**Decks fantasmas:** decisão do Rafael (ver B.9). Recomendação: **criar os 6** com o prompt master, porque
o plano 19 depende deles (F1 sem Postgres e Linux fica pela metade). Enquanto não existem, o módulo
aparece como "em produção" com o botão de gerar (padrão do escritorio: mostrar, não esconder).
**Arquivos:** `content/estrutura.json` (novo), `server/estrutura.js` (novo), `server/index.js` (rota),
`scripts/validar-conteudo.mjs` (valida a estrutura: todo módulo aponta para arquivos que existem, todo
deck pertence a exatamente um módulo), `content/README.md` (novo, esquema), `content/PROMPT-MASTER.md`
(seção "módulo").
**Critério de aceite:** validador limpo; `GET /api/estrutura` devolve 5 trilhas, 19 módulos, e para
cada módulo o que existe e o que falta; nenhum deck órfão.
**Esforço:** 1 sessão (+ 1 sessão de agentes de conteúdo se os 6 decks forem criados).

## Etapa 2 — Shell e navegação: Início · Trilha · Biblioteca · Perfil

**Estado atual:** barra de 5 itens (Início, Praticar, Cursos, Treinos, Mais) que reflete a divisão
técnica; Home com "quatro camadas".
**Mudança:**
- Barra inferior com **4 destinos**: **Início** (ação do dia + continuar), **Trilha** (o mapa vertical
  da trilha atual, com seletor das 5), **Biblioteca** (glossário, todos os cursos, laboratório completo,
  treinos) e **Perfil** (matriz, ofensiva, diário de erros, configurações, idioma).
- Menus declarativos em um só lugar (`src/nav.js`: `PRINCIPAL`, `BIBLIOTECA`, `PERFIL`), alimentando
  barra inferior no celular e sidebar/cabeçalho no desktop, como no `AppShell` do escritorio.
- **Tela cheia** para `/licao/*`: sem cabeçalho e sem barra; só progresso e "sair".
- **Tela `/anatomia`**: o diagrama Trilha → Módulo → Lição e "onde está cada coisa".
- **Estados vazios que orientam** em todas as listas.
- Kicker de contexto em toda tela interna ("Trilha 1 · Módulo 3 de 4 · Lição 2 de 6") e botão de voltar
  **nomeado** para o pai.
**Arquivos:** `src/nav.js` (novo), `src/components/Layout.jsx`, `src/App.jsx`, `src/pages/Trilha.jsx`
(novo, o mapa), `src/pages/Modulo.jsx` (novo, os nós do módulo), `src/pages/Biblioteca.jsx` (novo),
`src/pages/Perfil.jsx` (novo), `src/pages/Anatomia.jsx` (novo), `src/pages/Home.jsx` (simplificar),
`src/styles.css`. As páginas atuais (`Praticas`, `Cursos`, `Treinos`, `Glossario`, `Matriz`, `Config`)
**continuam existindo** e passam a ser alcançadas pela Biblioteca/Perfil.
**Critério de aceite:** a 360 px, o aluno chega de Início ao nó atual da trilha em **dois toques**; a
sessão abre sem menu; `scrollWidth === clientWidth` em toda tela; console limpo.
**Esforço:** 1,5 sessão.

## Etapa 3 — A Lição (sessão estilo Duolingo) e os modos novos

**Estado atual:** `Estudo.jsx` já roda sessões de N termos em um modo ou "misto"; as práticas e as
atividades de curso têm fluxo próprio; não há tela de resultado nem XP.
**Mudança:**
- **`/licao/:moduloId/:n`**: uma sessão de 8–12 itens montada pelo servidor (`GET /api/licao/...`) a
  partir do módulo: termos vencidos primeiro, depois termos novos, um bloco de leitura curta (lição do
  curso), um exercício (interativo ou fora do app), e no último nó do módulo o chefão (treino).
- **Tela de resultado**: XP, acertos, termos que subiram de nível, o que faltou para fechar o dia,
  botões "continuar" e "revisar os erros".
- **XP e coroas**: XP por item (peso por tipo), meta diária em XP ao lado da meta de avaliações; coroas
  do módulo = nível médio dos termos (a escala 0–5). Guardado em `progresso.json` (retrocompatível).
- **Modos novos**, todos usando o conteúdo que já existe:
  - **sintoma → causa** (um sintoma de produção; escolher o termo que explica; distratores do mesmo
    módulo) — o mais valioso para o degrau 4;
  - **lacuna** (definição com o conceito-chave apagado no meio);
  - **ordenar** (fases, passos, etapas: usa listas já presentes em `exemplo`/`profundidade` ou um campo
    novo `sequencia[]` no deck);
  - **pares confundíveis** (termos que o aluno erra juntos; o servidor já sabe);
  - **mapa de conexões** (dado um termo, marcar os relacionados; usa `relacionados[]`);
  - **recall livre** (3 minutos escrevendo tudo do módulo; depois a lista para marcar o que faltou).
**Arquivos:** `server/licao.js` (novo: monta a sessão), `server/xp.js` (novo: regras puras),
`server/progresso.js` (XP, coroas), `src/pages/Licao.jsx` (nova sessão; a atual `Licao.jsx` de curso
vira `LicaoCurso.jsx`), `src/pages/Resultado.jsx` (novo), `src/modes/{SintomaCausa,Lacuna,Ordenar,
Confundiveis,Conexoes,RecallLivre}.jsx` (novos), `src/lib/util.js` (MODOS), `tests/licao.test.js`,
`tests/xp.test.js`.
**Critério de aceite:** uma lição completa em menos de 10 min a 360 px; cada item dá feedback no ato;
resultado mostra XP e níveis; SM-2 continua registrando; 6 modos novos com teste.
**Esforço:** 2 sessões.

## Etapa 4 — Mecânicas: entrevista simulada, diário de erros, duelo contra o passado

**Estado atual:** o mentor dá **uma** avaliação e para; erros não ficam registrados como aprendizado;
não há comparação com sessões antigas.
**Mudança:**
- **Entrevista simulada** (`/entrevista/:moduloId`): conversa de 3–5 rodadas com o mentor IA, que faz a
  pergunta de aprofundamento **em cima da resposta anterior**; ao fim, uma avaliação da conversa inteira
  (classificação, nível, o que faltou, correção de inglês se for EN). Histórico gravado. Fila de modelos
  gratuitos como hoje.
- **Diário de erros** (`/perfil/erros`): todo erro em qualquer modo pode virar uma entrada com três
  campos: *o que eu achei*, *o que era*, *como detectar da próxima*. Preenchimento opcional na tela de
  resultado; lista filtrável por módulo; exportável em Markdown (matéria-prima de entrevista).
- **Duelo contra o passado**: refazer uma lição concluída e ver lado a lado a nota anterior e a atual,
  item a item.
**Arquivos:** `server/entrevista.js` (novo), `server/mentor.js` (chamada multi-turno), `server/diario.js`
(novo), `server/progresso.js` (histórico de lições por id), `src/pages/Entrevista.jsx`,
`src/pages/DiarioErros.jsx`, `src/pages/Duelo.jsx` (novos), `src/api.js`, `tests/`.
**Critério de aceite:** uma entrevista de 4 rodadas termina com avaliação consolidada; um erro vira
entrada do diário em dois toques; o duelo mostra a diferença de nota por item.
**Esforço:** 1,5 sessão.

## Etapa 5 — Mais conteúdo: exercícios no site e fora dele

**Estado atual:** 13 decks · 365 termos · 71 exercícios · 3 cursos (24 lições, 16 atividades) ·
5 treinos.
**Mudança (metas):**
- **6 decks novos** (os fantasmas), ~30 termos cada → 19 decks, ~545 termos.
- **Práticas para cada módulo novo** (5–6 por módulo) → ~105 exercícios.
- **Tipo de entrega novo `pesquisa`**: enunciado pede para ler doc/postmortem e voltar com resposta
  curta + fonte; correção por palavras-chave obrigatórias (`deveConter[]`) ou mentor IA quando
  `aberta: true`.
- **Exercícios interativos no site** por módulo: os modos novos da etapa 3 já são isso; além deles,
  **"ache o bug"** em trecho de código (escolha) e **"complete o comando"** (lacuna em linha de shell).
- **Um curso por trilha** (hoje há 3; meta 5), e **um treino por trilha** (já há 5, revisar amarração).
**Arquivos:** só `content/**` e o `content/PROMPT-MASTER.md` (seção "pesquisa"); `server/praticas.js`
(tipo `pesquisa`), `scripts/validar-conteudo.mjs`.
**Critério de aceite:** validadores limpos; todo módulo tem no mínimo deck + 4 exercícios; gabaritos
de saída/número executados de verdade antes de entrar.
**Esforço:** 1 sessão de agentes em paralelo (um por trilha).

## Etapa 6 — Inglês: módulo melhor e interface bilíngue

**Estado atual:** deck EN com 50 termos e 4 práticas; `perguntaEntrevistaEN` em todos os termos;
o mentor devolve `correcaoIngles` mas a tela quase não mostra; interface 100 % em PT (≈250 strings no
front, ≈450 no servidor e no bot).
**Mudança:**
- **Módulo EN completo**: curso em inglês (3 módulos: pitch, STAR, system design falado), práticas
  de escrita com o mentor corrigindo o inglês em destaque, e o modo **"explique em inglês"** disponível
  em qualquer módulo (usa `perguntaEntrevistaEN`). Sem áudio.
- **i18n da interface**: `src/i18n/pt.json` e `src/i18n/en.json`, hook `useT()` com `t('chave')` e
  interpolação `{n}`, seletor PT/EN em Perfil/Config e `?lang=en`; persistência em `localStorage` **e**
  no servidor (`config.idioma`) para o bot falar a mesma língua. Datas e números pelo `Intl` do idioma.
- **Conteúdo bilíngue onde já existe campo EN** (`termoEN`, `perguntaEntrevistaEN`); o resto fica em
  PT com um selo "PT". Não traduzir os 365 termos automaticamente nesta etapa (qualidade > cobertura);
  o `PROMPT-MASTER` ganha a opção "gerar também em EN" para conteúdo novo.
- **Bot em EN**: as mensagens do `telegram.js` saem do mesmo dicionário (`server/i18n.js`).
**Arquivos:** `src/i18n/{pt,en}.json` (novos), `src/i18n/index.js` (hook), `server/i18n.js` (novo),
**todas as páginas e componentes** (troca de string por `t()`), `server/telegram.js`, `server/cards.js`
(textos dos cards), `content/cursos/04-interview-english.md` (novo), `content/praticas/
vocabulario-entrevista-en.json` (+6), `tests/i18n.test.js` (toda chave de `pt.json` existe em `en.json`).
**Critério de aceite:** com EN ligado, **nenhuma** string em PT aparece na interface, no bot ou nos
cards (teste automático de cobertura de chaves + varredura visual das telas); o módulo EN tem curso,
6+ práticas e o modo "explique em inglês" em todos os módulos.
**Esforço:** 2 sessões (a troca de strings é mecânica e paralelizável por pasta).

## Etapa 7 — Sistema de design consolidado

**Estado atual:** `styles.css` com 2.185 linhas e tokens bons, mais `cursos.css`, `treinos.css`,
`telegram.css`; estilo inline em dezenas de pontos (`style={{ marginTop: 12 }}`).
**Mudança:** `src/styles/tokens.css` (só tokens, comentados com contraste), `src/styles/base.css`
(classes globais `.btn .chip .card .grid .stack .progress .empty .kicker`), um CSS por tela; **zerar o
estilo inline** com utilitárias de espaçamento (`.mt-2`, `.gap-3`) ou classes da tela; `prefers-reduced-
motion` desliga animações. Tema claro **não** entra (o app é escuro por identidade); alto contraste
opcional entra (é barato: um atributo no `<html>`).
**Arquivos:** `src/styles/*` (novo), todas as telas (troca de inline por classe).
**Critério de aceite:** `grep "style={{" src | wc -l` cai de dezenas para menos de 10 (só posições
dinâmicas, como largura de barra); nenhuma regressão visual nas 12 telas a 360 e 1280 px.
**Esforço:** 1 sessão.

## Etapa 8 — Testes, deploy e fechamento

**Mudança:** testes para cada regra nova (lição, XP, i18n, pesquisa, entrevista); `npm test` verde;
deploy no celular; `docs/MUDANCAS-V2.md` narrando o que mudou; atualizar o manual 20 e o AI-GUIA.
**Critério de aceite:** 223+ testes verdes, app no ar pelo túnel, bot avisando, documento 20 atualizado.
**Esforço:** 0,5 sessão.

## B.9 Decisões que só o Rafael pode tomar (antes de liberar)

1. **Os 6 decks fantasmas**: criar (recomendado, ~1 sessão de agentes) ou tirar do plano?
2. **Vocabulário final**: *Trilha → Módulo → Lição* está bom? (Alternativa: *Fase → Tema → Sessão*.)
3. **Inglês**: interface inteira + bot + cards (recomendado), ou só a interface?
4. **XP**: quer XP e coroas de verdade, ou só as coroas (nível 0–5) sem pontuação?
5. **Ordem**: seguir 0 → 8, ou priorizar o inglês (6) antes da lição (3)?

## B.10 Riscos e o que NÃO fazer

- **Não** mover arquivos de conteúdo: os quatro tipos ficam onde estão; só entra a estrutura por cima.
- **Não** reescrever as páginas atuais: elas passam a viver na Biblioteca; a lição nova é uma página a
  mais, não uma substituição.
- **Não** traduzir conteúdo em massa por IA nesta rodada: qualidade primeiro.
- **Não** instalar dependência para i18n; um dicionário JSON e um hook de 30 linhas bastam.
- **Risco real**: trocar ~700 strings por `t()` é mecânico mas grande; fazer por pasta, com o teste de
  cobertura de chaves rodando desde o primeiro arquivo.
- **Risco real**: XP pode inflar a ofensiva; a meta diária continua sendo **avaliações**, XP é
  secundário.

## B.11 Estimativa total

| Etapa | Esforço |
|---|---|
| 0 Mapa | 0,5 |
| 1 Estrutura | 1 (+1 de conteúdo) |
| 2 Shell | 1,5 |
| 3 Lição + modos | 2 |
| 4 Mecânicas | 1,5 |
| 5 Conteúdo | 1 |
| 6 Inglês | 2 |
| 7 Design | 1 |
| 8 Fechamento | 0,5 |
| **Total** | **≈ 11–12 sessões**, com 4, 5 e 6 em paralelo após a 2 |

---

## Apêndice — O que o escritorio-virtual faz (relatório da exploração, 16/09/2026)

- **Stack**: React 18 + Vite 5, JSX puro, CSS com tokens, `localStorage` como banco, PWA, Capacitor
  para Android. Sem TS, sem Tailwind, sem store externo (decisão em `aboutproject/DevProfile.md`).
- **Pastas**: `app/src/components/screens/*.jsx` (1 por rota), `subComponents/` (peças com lógica),
  `data/estrutura.js` (módulos/trilhas/missões/troféus como **dados**, 1.181 linhas),
  `data/conteudo/*.js` (1 por trilha), `assets/css/*.css` (1 por tela), `lib/design-kit.js`.
  Divisão **por camada**, não por feature; a feature é amarrada por convenção de nome.
- **Navegação**: `/bem-vindo` → `/`; sidebar 260 px no desktop e bottom-nav de 5 no celular, ambos de
  arrays declarativos (`AppShell.jsx:14`); rotas de foco em tela cheia (`routes.jsx:58`); hierarquia
  comunicada por **kicker** ("Missão 5 de 14 · Word"), **voltar nomeado** e **stepper**.
- **Design**: `colors.css` com contraste WCAG anotado por cor; classes globais `.panel .btn .chip
  .grid .progress .empty`; sem tema claro; eixo de acessibilidade (`data-fontstep`, `data-contrast`,
  `prefers-reduced-motion`).
- **i18n**: não existe; "inglês" é conteúdo de curso, interface 100 % PT.
- **Estado**: um Context fino que delega para `GlobalVar` (classe estática com persistência e backup)
  e regras puras em `estrutura.js`. Sem fetch, sem backend (diretriz do dono).
- **Auto-explicação**: onboarding de 3 passos com o "por quê", tela `/anatomia`, estados vazios que
  orientam, "conteúdo em produção" visível.
- **Docs**: `app/docs/AI-GUIA.md` (o melhor artefato: mapa de 1 página), `aboutproject/{AI-HANDOFF,
  FRONTEND-IMPL, FLUXO, DevProfile}.md`, `PLANO-V11.md` + `MUDANCAS-V12.md`. O `README.md` da raiz
  está obsoleto (lição: mapa junto do código sobrevive; setup na raiz apodrece).
- **Defeitos a não repetir**: estilo inline gigante em `Modulos.jsx`; agregador manual de 80 imports;
  duas cópias dessincronizadas de `data/` e um protótipo morto de 65 mil linhas.
