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
