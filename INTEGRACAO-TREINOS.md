# Integração dos Treinos Especiais — a fiação que falta

Tudo que é novo já está escrito e testado. O que falta é **ligar**, e de propósito eu não toquei em
`server/index.js`, `src/App.jsx`, `src/api.js` nem `src/components/Layout.jsx`. Este documento tem os
trechos prontos para colar.

**Arquivos novos** (nenhum arquivo existente foi alterado):

```
content/treinos/README.md                     esquema do JSON
content/treinos/PROMPT-MASTER.md              prompt para qualquer IA gerar um treino novo
content/treinos/01-semana-event-loop.json     exemplo real (7 dias, deck node-internals)
content/treinos/02-simulado-entrevista-senior.json  exemplo real (90 min, PT + EN)
server/treinos.js                             carregador + validação + versão pública
server/progresso-treinos.js                   progresso, notas e a ponte para o SM-2
scripts/validar-treinos.mjs                   validador (node scripts/validar-treinos.mjs)
src/pages/Treinos.jsx                         lista
src/pages/Treino.jsx                          trilha de etapas
src/treinos.css                               estilos (importado pelas duas páginas)
src/lib/apiTreinos.js                         cliente HTTP (ver passo 2)
```

---

## 1. `server/index.js`

### 1.1 imports (junto dos outros, no topo)

```js
import { criarTreinos } from './treinos.js'
import { criarProgressoTreinos } from './progresso-treinos.js'
```

### 1.2 instâncias (logo depois de `const progresso = criarProgresso(ARQ_PROGRESSO)`)

```js
const treinos = criarTreinos(CONTEUDO, repo)
const progTreinos = criarProgressoTreinos(progresso, { arquivo: path.join(RAIZ, 'data', 'progresso-treinos.json') })
```

> O progresso dos treinos mora em `data/progresso-treinos.json` para eu não precisar mexer em
> `server/progresso.js`. O conteúdo é exatamente a chave `treinos` que caberia em `data/progresso.json`
> (`{ "versao": 1, "treinos": { … } }`), então a unificação depois é copiar e colar. O SM-2, a ofensiva e
> o histórico do dia continuam saindo do `progresso` injetado.

### 1.3 `/saude` (opcional, uma linha em cada lista)

```js
    treinos: treinos.listar().length,
    erros: [...repo.erros(), ...praticas.erros(), ...cursos.erros(), ...treinos.erros()],
```

### 1.4 rotas — cole este bloco depois das rotas de cursos, antes de `app.use('/api', api)`

```js
// ---- treinos especiais (content/treinos/*.json) ---------------------------
function acharTreino(req, res) {
  const t = treinos.obter(String(req.params.id))
  if (!t) {
    res.status(404).json({ erro: 'treino não encontrado' })
    return null
  }
  return t
}
function acharEtapa(req, res) {
  const t = acharTreino(req, res)
  if (!t) return null
  const e = t.etapas.find((x) => x.id === String(req.params.etapaId))
  if (!e) {
    res.status(404).json({ erro: 'etapa não encontrada' })
    return null
  }
  return { treino: t, etapa: e }
}

// lista: cabeçalho + progresso de cada treino (sem as etapas, que são grandes)
api.get('/treinos', (_req, res) => {
  const lista = treinos.listar().map((t) => ({
    id: t.id,
    titulo: t.titulo,
    subtitulo: t.subtitulo,
    objetivo: t.objetivo,
    nivel: t.nivel,
    duracaoDias: t.duracaoDias,
    tempoTotalMin: t.tempoTotalMin,
    decks: t.decks,
    tags: t.tags,
    recompensa: t.recompensa,
    etapas: t.etapas.length,
    tipos: t.tipos,
    progresso: progTreinos.resumo(t),
  }))
  res.json({ treinos: lista, erros: treinos.erros() })
})

// detalhe: treino público (sem gabarito), estado de cada etapa e o gabarito só do que já foi
// concluído/revelado
api.get('/treinos/:id', (req, res) => {
  const t = acharTreino(req, res)
  if (!t) return
  const estados = {}
  const gabaritos = {}
  const revelar = []
  for (const e of t.etapas) {
    const s = progTreinos.etapa(t.id, e.id)
    if (s) estados[e.id] = s
    if (s && (s.estado === 'concluida' || s.revelou)) {
      revelar.push(e.id)
      const g = treinos.gabarito(e)
      if (g) gabaritos[e.id] = g
    }
  }
  res.json({ treino: treinos.publico(t, { revelar }), progresso: progTreinos.resumo(t), estados, gabaritos })
})

api.post('/treinos/:id/iniciar', (req, res) => {
  const t = acharTreino(req, res)
  if (!t) return
  res.json(progTreinos.iniciar(t))
})

// zera a temporada inteira (o "recomeçar" da tela final)
api.post('/treinos/:id/reabrir', (req, res) => {
  const t = acharTreino(req, res)
  if (!t) return
  res.json({ progresso: progTreinos.reabrirTreino(t) })
})

api.post('/treinos/:id/etapa/:etapaId/abrir', (req, res) => {
  const r = acharEtapa(req, res)
  if (!r) return
  res.json({ estado: progTreinos.abrirEtapa(r.treino.id, r.etapa.id) })
})

// body { texto } - rascunho da entrega (começar no PC, terminar no celular)
api.put('/treinos/:id/etapa/:etapaId/rascunho', (req, res) => {
  const r = acharEtapa(req, res)
  if (!r) return
  res.json({ estado: progTreinos.rascunho(r.treino.id, r.etapa.id, req.body?.texto) })
})

// body { n } - só faz sentido em etapa do tipo desafio (as dicas são do exercício)
api.post('/treinos/:id/etapa/:etapaId/dica', (req, res) => {
  const r = acharEtapa(req, res)
  if (!r) return
  const dicas = r.etapa.tipo === 'desafio' ? r.etapa.corpo.exercicio.dicas : []
  if (!dicas.length) return res.status(400).json({ erro: 'etapa sem dicas' })
  const n = Math.max(1, Math.min(dicas.length, Number(req.body?.n) || 1))
  res.json({ estado: progTreinos.dica(r.treino.id, r.etapa.id, n), dicas: dicas.slice(0, n) })
})

// libera o gabarito da etapa (solução do desafio, respostas do cronometrado, modelo do simulado)
api.post('/treinos/:id/etapa/:etapaId/revelar', (req, res) => {
  const r = acharEtapa(req, res)
  if (!r) return
  res.json({ estado: progTreinos.revelar(r.treino.id, r.etapa.id), gabarito: treinos.gabarito(r.etapa) })
})

// entrega da etapa: body { resposta?, nota?, marcados?, acertos?, notas?, segundos? }
// a correção objetiva é a MESMA das práticas (corrigir/notaAutomatica/notaChecklist de praticas.js)
api.post('/treinos/:id/etapa/:etapaId/responder', (req, res) => {
  const r = acharEtapa(req, res)
  if (!r) return
  const out = progTreinos.responderEtapa(r.treino, r.etapa, req.body)
  res.status(out.status).json(out.corpo)
})

api.post('/treinos/:id/etapa/:etapaId/reabrir', (req, res) => {
  const r = acharEtapa(req, res)
  if (!r) return
  res.json(progTreinos.reabrirEtapa(r.treino, r.etapa.id))
})
```

### 1.5 tabela das rotas

| método | caminho | corpo | resposta |
|---|---|---|---|
| GET | `/api/treinos` | – | `{ treinos: [{ id, titulo, subtitulo, objetivo, nivel, duracaoDias, tempoTotalMin, decks, tags, recompensa, etapas: <número>, tipos, progresso }], erros }` |
| GET | `/api/treinos/:id` | – | `{ treino, progresso, estados: { etapaId: estado }, gabaritos: { etapaId: gabarito } }` |
| POST | `/api/treinos/:id/iniciar` | `{}` | `{ treino, resumo }` |
| POST | `/api/treinos/:id/reabrir` | `{}` | `{ progresso }` (zera a temporada) |
| POST | `/api/treinos/:id/etapa/:etapaId/abrir` | `{}` | `{ estado }` |
| PUT | `/api/treinos/:id/etapa/:etapaId/rascunho` | `{ texto }` | `{ estado }` |
| POST | `/api/treinos/:id/etapa/:etapaId/dica` | `{ n }` | `{ estado, dicas }` · 400 se a etapa não tem dicas |
| POST | `/api/treinos/:id/etapa/:etapaId/revelar` | `{}` | `{ estado, gabarito }` |
| POST | `/api/treinos/:id/etapa/:etapaId/responder` | ver abaixo | `{ correto, nota, etapa, resumo, termos, proximaEtapa, recompensa?, solucao? }` · 400 com `{ erro }` |
| POST | `/api/treinos/:id/etapa/:etapaId/reabrir` | `{}` | `{ etapa, resumo }` |

Corpo do `responder`, por tipo de etapa:

| tipo | corpo | nota |
|---|---|---|
| `aquecimento`, `leitura` | `{ nota? }` | a que você mandar (ou `null`) |
| `desafio` (saida/numero/escolha) | `{ resposta }` | automática; errado devolve `{ correto: false }` e conta tentativa |
| `desafio` (checklist) | `{ marcados: [0,2] }` | proporção × 5 |
| `desafio` (texto) | `{ resposta, nota }` | a sua |
| `cronometrado` | `{ acertos: ["q1","q3"], segundos }` | proporção × 5; SM-2 4/1 por pergunta |
| `simulado` | `{ notas: { q1: 4, … }, resposta? }` | média; SM-2 com a nota de cada pergunta |
| `mao-na-massa` | `{ marcados: [0,1], resposta? }` | proporção × 5 |
| `ensinar`, `retrospectiva` | `{ nota, resposta }` | a sua (obrigatória) |

---

## 2. `src/api.js`

As páginas já funcionam sozinhas: elas importam de `src/lib/apiTreinos.js`, que é uma cópia mínima do
`req()` daqui. Se você quiser tudo centralizado (é o certo), cole no objeto `api`:

```js
  // treinos especiais (content/treinos)
  treinos: () => req('/api/treinos'),
  treino: (id) => req(`/api/treinos/${encodeURIComponent(id)}`),
  treinoIniciar: (id) => req(`/api/treinos/${encodeURIComponent(id)}/iniciar`, { method: 'POST', body: '{}' }),
  treinoReabrir: (id) => req(`/api/treinos/${encodeURIComponent(id)}/reabrir`, { method: 'POST', body: '{}' }),
  treinoEtapaAbrir: (id, etapaId) => req(`/api/treinos/${encodeURIComponent(id)}/etapa/${encodeURIComponent(etapaId)}/abrir`, { method: 'POST', body: '{}' }),
  treinoEtapaRascunho: (id, etapaId, texto) =>
    req(`/api/treinos/${encodeURIComponent(id)}/etapa/${encodeURIComponent(etapaId)}/rascunho`, { method: 'PUT', body: JSON.stringify({ texto }) }),
  treinoEtapaDica: (id, etapaId, n) =>
    req(`/api/treinos/${encodeURIComponent(id)}/etapa/${encodeURIComponent(etapaId)}/dica`, { method: 'POST', body: JSON.stringify({ n }) }),
  treinoEtapaRevelar: (id, etapaId) => req(`/api/treinos/${encodeURIComponent(id)}/etapa/${encodeURIComponent(etapaId)}/revelar`, { method: 'POST', body: '{}' }),
  treinoEtapaResponder: (id, etapaId, corpo) =>
    req(`/api/treinos/${encodeURIComponent(id)}/etapa/${encodeURIComponent(etapaId)}/responder`, { method: 'POST', body: JSON.stringify(corpo) }),
  treinoEtapaReabrir: (id, etapaId) => req(`/api/treinos/${encodeURIComponent(id)}/etapa/${encodeURIComponent(etapaId)}/reabrir`, { method: 'POST', body: '{}' }),
```

Se colar isso, troque nas duas páginas:

```js
// de:
import { apiTreinos } from '../lib/apiTreinos.js'
// para:
import { api } from '../api.js'
// e o objeto: apiTreinos.listar() → api.treinos(), apiTreinos.obter(id) → api.treino(id), etc.
```

Enquanto você não fizer isso, `src/lib/apiTreinos.js` continua funcionando — só apague o arquivo depois
de migrar.

---

## 3. `src/App.jsx` — rotas do React Router

```js
import Treinos from './pages/Treinos.jsx'
import Treino from './pages/Treino.jsx'
```

```jsx
        <Route path="/treinos" element={<Treinos />} />
        <Route path="/treino/:id" element={<Treino />} />
```

(coloque antes do `<Route path="*" …>`, que é o catch-all.)

A página do treino usa `?etapa=<id>` na query para saber qual etapa está aberta — nada a configurar,
mas é bom saber que o link de uma etapa específica é compartilhável.

---

## 4. `src/components/Layout.jsx` — item de menu

Na constante `LINKS`, entre "Praticar" e "Glossário":

```js
  { to: '/treinos', rotulo: 'Treinos', Ico: IcoChama },
```

`IcoChama` já está importado no arquivo (é o ícone da ofensiva). Se você quiser um ícone próprio, o
lugar é `src/components/Icones.jsx` — eu não mexi lá.

---

## 5. Conferir depois de ligar

```bash
node scripts/validar-treinos.mjs        # esquema + ids reais dos decks
node --check server/treinos.js
node --check server/progresso-treinos.js
curl -s localhost:8790/api/treinos | head -c 400
```

E na tela: `/treinos` lista os dois exemplos; `/treino/semana-event-loop` abre a trilha; concluir a etapa
`d2-ordem-de-execucao` com a saída certa deve dar nota 4 (ou 3 se você errar uma vez) e mexer no nível do
termo `node-internals/fases-event-loop` na Matriz.
