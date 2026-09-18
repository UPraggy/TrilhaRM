// Trilha RM - servidor Express: /api + dist/ estático (SPA).
// Dev: `npm run dev` (Vite na 5173 com proxy) | Prod/celular: `npm start` ou PM2 (ecosystem.config.cjs)
import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { criarCursos } from './cursos.js'
import { criarRepositorio } from './decks.js'
import { criarEstrutura } from './estrutura.js'
import { criarLicao } from './licao.js'
import { criarEntrevista } from './entrevista.js'
import { criarProgresso } from './progresso.js'
import { carregarEnv, criarMentor } from './mentor.js'
import { corrigir, criarPraticas, notaAutomatica, notaChecklist } from './praticas.js'
import { hojeISO, vencido } from './sm2.js'
import { faltaParaMeta, resultadoLicao } from './xp.js'
import { criarTelegram } from './telegram.js'
import { criarTreinos } from './treinos.js'
import { criarProgressoTreinos } from './progresso-treinos.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const RAIZ = path.resolve(__dirname, '..')
// --port N na linha de comando vence a env PORT (o launcher de preview exporta PORT=5173 para o Vite)
const argPorta = process.argv.indexOf('--port')
const PORT = (argPorta > -1 && Number(process.argv[argPorta + 1])) || Number(process.env.PORT) || 8790
const MAX_ITENS_RESPOSTA = 40
const DIST = path.join(RAIZ, 'dist')
const CONTEUDO = path.join(RAIZ, 'content')
const ARQ_PROGRESSO = path.join(RAIZ, 'data', 'progresso.json')
const ARQ_CONFIG = path.join(RAIZ, 'data', 'config.json')

carregarEnv(path.join(RAIZ, '.env')) // OPENROUTER_API_KEY etc. (não sobrescreve o ambiente)
const repo = criarRepositorio(CONTEUDO)
const praticas = criarPraticas(CONTEUDO, repo)
const cursos = criarCursos(CONTEUDO, repo)
const progresso = criarProgresso(ARQ_PROGRESSO)
const treinos = criarTreinos(CONTEUDO, repo)
const progTreinos = criarProgressoTreinos(progresso, { arquivo: path.join(RAIZ, 'data', 'progresso-treinos.json') })
// Trilha -> Módulo -> Lição: amarra deck + curso + práticas + treino por tema (content/estrutura.json)
const estrutura = criarEstrutura(CONTEUDO, { repo, cursos, praticas, treinos, progresso })
const licoes = criarLicao({ estrutura, repo, cursos, praticas, progresso })
const telegram = criarTelegram({
  arquivoConfig: ARQ_CONFIG, // o token mora ao lado da key do OpenRouter, fora do git
  arquivoEstado: path.join(RAIZ, 'data', 'telegram.json'),
  arquivoTunnel: path.join(RAIZ, 'data', 'tunnel-url.txt'), // o mesmo que tunnel.cjs escreve
  repo,
  praticas,
  cursos,
  treinos,
  progresso,
  progTreinos,
  porta: PORT,
})
const mentor = criarMentor({ arquivoConfig: ARQ_CONFIG, repo, progresso })
const entrevistas = criarEntrevista({ estrutura, repo, mentor, progresso })

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '256kb' }))

// ---- API ---------------------------------------------------------------
const api = express.Router()
api.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store')
  next()
})

api.get('/saude', (_req, res) => {
  res.json({
    ok: true,
    hoje: hojeISO(),
    decks: repo.listar().length,
    praticas: praticas.listar().length, treinos: treinos.listar().length, telegram: telegram.estado(),
    cursos: cursos.listar().length,
    erros: [...repo.erros(), ...praticas.erros(), ...treinos.erros(), ...cursos.erros(), ...estrutura.erros()],
  })
})

api.get('/decks', (_req, res) => {
  const decks = repo.listar().map((d) => ({
    id: d.id,
    titulo: d.titulo,
    fase: d.fase,
    trilha: d.trilha,
    ordem: d.ordem,
    descricao: d.descricao,
    exemplo: d.exemplo,
    totalTermos: d.termos.length,
    tags: [...new Set(d.termos.flatMap((t) => t.tags))].sort(),
  }))
  res.json({ decks, erros: repo.erros() })
})

api.get('/decks/:id', (req, res) => {
  const d = repo.obter(req.params.id)
  if (!d) return res.status(404).json({ erro: 'deck não encontrado' })
  res.json(d)
})

// todos os termos de todos os decks (glossário / misturar tudo) - um request só
api.get('/termos', (_req, res) => {
  const termos = repo.listar().flatMap((d) =>
    d.termos.map((t) => ({ ...t, deckId: d.id, deckTitulo: d.titulo, fase: d.fase })),
  )
  res.json({ termos })
})

// trilhas.json continua servido por retrocompatibilidade, mas agora é DERIVADO de estrutura.json
api.get('/trilhas', (_req, res) => {
  res.json(estrutura.trilhasCompativel())
})

// ---- estrutura: trilhas -> módulos -> nós (o caminho estilo Duolingo) ------
api.get('/estrutura', (_req, res) => {
  res.json(estrutura.resolver())
})

api.get('/modulos/:id', (req, res) => {
  const m = estrutura.modulo(String(req.params.id))
  if (!m) return res.status(404).json({ erro: 'módulo não encontrado' })
  res.json(m)
})

// ---- lição: a sessão de 8-12 itens de um nó --------------------------------
api.get('/licao/:moduloId/:n', (req, res) => {
  const r = licoes.montar(String(req.params.moduloId), String(req.params.n))
  if (r.erro) return res.status(r.status || 400).json({ erro: r.erro })
  res.json(r.licao)
})

/**
 * Fecha a lição. body { itens: [{ tipo, ref, ok, nota }] }
 * NÃO conta avaliação: cada termo já foi avaliado item a item por POST /progresso/avaliar durante a
 * sessão. Aqui entram XP, coroas e a marca de concluído - senão a ofensiva inflaria.
 */
api.post('/licao/:moduloId/:n/concluir', (req, res) => {
  const noId = `${req.params.moduloId}/${req.params.n}`
  const alvo = estrutura.no(noId)
  if (!alvo) return res.status(404).json({ erro: 'lição não encontrada' })
  const itens = Array.isArray(req.body?.itens) ? req.body.itens.slice(0, MAX_ITENS_RESPOSTA) : []
  if (!itens.length) return res.status(400).json({ erro: 'nenhum item respondido' })
  const primeiraVez = !progresso.no(noId)
  const r = resultadoLicao(itens, { primeiraVez })
  const gravado = progresso.concluirNo({ noId, xp: r.xp, acertos: r.acertos, total: r.total, itens })
  const modulo = estrutura.modulo(String(req.params.moduloId))
  const proximo = modulo ? modulo.nos.find((x) => x.estado === 'disponivel') : null
  res.json({
    ...r,
    primeiraVez: gravado.primeiraVez,
    xpDia: gravado.xpDia,
    xpTotal: gravado.xpTotal,
    meta: faltaParaMeta(gravado.xpDia),
    streak: gravado.streak,
    coroas: modulo ? modulo.progresso.coroas : 0,
    nivelMedio: modulo ? modulo.progresso.nivelMedio : 0,
    proximo: proximo ? { id: proximo.id, n: proximo.n, tipo: proximo.tipo, titulo: proximo.titulo, treinoId: proximo.treinoId || null } : null,
    moduloConcluido: modulo ? modulo.progresso.concluido : false,
  })
})

api.get('/progresso', (_req, res) => {
  res.json(progresso.obter())
})

// resumo de revisão: quantos vencem hoje, por deck, e a lista de chaves
api.get('/progresso/revisao', (_req, res) => {
  const p = progresso.obter()
  const hoje = hojeISO()
  const vencidos = []
  const porDeck = {}
  for (const d of repo.listar()) {
    let n = 0
    let nuncaVistos = 0
    for (const t of d.termos) {
      const chave = `${d.id}/${t.id}`
      const est = p.termos[chave]
      if (!est) nuncaVistos += 1
      if (est && vencido(est, hoje)) {
        n += 1
        vencidos.push({ deckId: d.id, termoId: t.id, proximaRevisao: est.proximaRevisao, nivel: est.nivel })
      }
    }
    porDeck[d.id] = { vencidos: n, nuncaVistos, total: d.termos.length }
  }
  vencidos.sort((a, b) => (a.proximaRevisao < b.proximaRevisao ? -1 : 1))
  res.json({ hoje, total: vencidos.length, vencidos, porDeck })
})

api.post('/progresso/avaliar', (req, res) => {
  const { deckId, termoId, nota, modo, resposta } = req.body || {}
  if (!deckId || !termoId) return res.status(400).json({ erro: 'deckId e termoId são obrigatórios' })
  // Number(null) é 0: sem esta guarda, um `nota: null` do cliente viraria "desconheço" e zeraria o termo
  const n = typeof nota === 'number' || (typeof nota === 'string' && nota.trim() !== '') ? Number(nota) : NaN
  if (!Number.isFinite(n) || n < 0 || n > 5) return res.status(400).json({ erro: 'nota deve ser 0..5' })
  const deck = repo.obter(String(deckId))
  if (!deck) return res.status(404).json({ erro: 'deck não encontrado' })
  if (!deck.termos.some((t) => t.id === String(termoId))) return res.status(404).json({ erro: 'termo não encontrado' })
  const r = progresso.avaliar({
    deckId: String(deckId),
    termoId: String(termoId),
    nota: n,
    modo: typeof modo === 'string' ? modo.slice(0, 32) : 'desconhecido',
    resposta: typeof resposta === 'string' ? resposta : undefined,
  })
  res.json(r)
})

api.post('/progresso/reset', async (_req, res) => {
  await progresso.reset()
  res.json({ ok: true, progresso: progresso.obter() })
})


// ---- duelo contra o passado: o histórico de um nó -------------------------
api.get('/licao/:moduloId/:n/historico', (req, res) => {
  const noId = `${req.params.moduloId}/${req.params.n}`
  if (!estrutura.no(noId)) return res.status(404).json({ erro: 'lição não encontrada' })
  const s = progresso.no(noId)
  res.json({ noId, historico: s ? s.historico || [] : [], melhorXp: s ? s.melhorXp : 0, vezes: s ? (s.historico || []).length : 0 })
})

// ---- diário de erros ------------------------------------------------------
api.get('/diario', (req, res) => {
  res.json({ erros: progresso.diario({ moduloId: req.query.modulo ? String(req.query.modulo) : undefined }) })
})

// body { moduloId, deckId, termoId, titulo, achei, era, detectar, origem }
api.post('/diario', (req, res) => {
  const b = req.body || {}
  if (!String(b.titulo || '').trim() && !String(b.achei || '').trim()) return res.status(400).json({ erro: 'escreva pelo menos o título ou "o que eu achei"' })
  res.json({ erro: null, entrada: progresso.anotarErro(b) })
})

api.put('/diario/:id', (req, res) => {
  const e = progresso.atualizarErro(String(req.params.id), req.body || {})
  if (!e) return res.status(404).json({ erro: 'entrada não encontrada' })
  res.json({ entrada: e })
})

api.delete('/diario/:id', (req, res) => {
  res.json(progresso.removerErro(String(req.params.id)))
})

// exporta o diário em Markdown - matéria-prima de revisão antes de uma entrevista
api.get('/diario.md', (_req, res) => {
  const lista = progresso.diario()
  const linhas = ['# Diário de erros — Trilha RM', '']
  for (const e of lista) {
    linhas.push(`## ${e.titulo || e.termoId || 'sem título'}`)
    linhas.push(`*${e.dia}${e.moduloId ? ` · ${e.moduloId}` : ''}*`, '')
    if (e.achei) linhas.push(`**O que eu achei:** ${e.achei}`, '')
    if (e.era) linhas.push(`**O que era:** ${e.era}`, '')
    if (e.detectar) linhas.push(`**Como detectar da próxima:** ${e.detectar}`, '')
    linhas.push('')
  }
  res.set('Content-Type', 'text/markdown; charset=utf-8')
  res.send(linhas.join('\n'))
})

// ---- entrevista simulada (multi-turno com o mentor) -----------------------
api.get('/entrevista/:moduloId', (req, res) => {
  const r = entrevistas.obter(String(req.params.moduloId))
  res.status(r.status).json(r.corpo)
})

api.post('/entrevista/:moduloId/iniciar', (req, res) => {
  const r = entrevistas.iniciar(String(req.params.moduloId))
  res.status(r.status).json(r.corpo)
})

api.post('/entrevista/:moduloId/responder', async (req, res) => {
  const r = await entrevistas.responder(String(req.params.moduloId), req.body?.resposta)
  res.status(r.status).json(r.corpo)
})

api.post('/entrevista/:moduloId/encerrar', async (req, res) => {
  const r = await entrevistas.encerrar(String(req.params.moduloId))
  res.status(r.status).json(r.corpo)
})

api.delete('/entrevista/:moduloId', (req, res) => {
  const r = entrevistas.descartar(String(req.params.moduloId))
  res.status(r.status).json(r.corpo)
})

// ---- práticas (exercícios resolvidos fora do app) -------------------------
// lista pública: sem gabarito; inclui o estado de cada exercício no progresso
api.get('/praticas', (_req, res) => {
  const p = progresso.obter()
  const lista = praticas.listar().map((arq) => ({
    deckId: arq.deckId,
    deckTitulo: arq.deckTitulo,
    fase: arq.fase,
    titulo: arq.titulo,
    exercicios: arq.exercicios.map((ex) => {
      const { enunciado, passos, dicas, criterios, ...resto } = praticas.publico(ex)
      return { ...resto, estado: p.praticas[`${arq.deckId}/${ex.id}`] || null }
    }),
  }))
  res.json({ praticas: lista, erros: praticas.erros() })
})

function acharExercicio(req, res) {
  const ex = praticas.exercicio(String(req.params.deckId), String(req.params.exId))
  if (!ex) {
    res.status(404).json({ erro: 'exercício não encontrado' })
    return null
  }
  return ex
}
const chaveDe = (req) => `${req.params.deckId}/${req.params.exId}`

api.get('/praticas/:deckId/:exId', (req, res) => {
  const ex = acharExercicio(req, res)
  if (!ex) return
  const estado = progresso.pratica(chaveDe(req))
  const corpo = { ...praticas.publico(ex), deckId: String(req.params.deckId), estado }
  // gabarito só volta se já concluiu ou já pediu para revelar
  if (estado && (estado.estado === 'concluida' || estado.revelou)) corpo.solucao = ex.solucao
  res.json(corpo)
})

api.post('/praticas/:deckId/:exId/iniciar', (req, res) => {
  if (!acharExercicio(req, res)) return
  res.json({ estado: progresso.iniciarPratica(chaveDe(req)) })
})

// body { texto } - guarda o rascunho da resposta (para começar no PC e terminar no celular)
api.put('/praticas/:deckId/:exId/rascunho', (req, res) => {
  if (!acharExercicio(req, res)) return
  const texto = typeof req.body?.texto === 'string' ? req.body.texto : ''
  res.json({ estado: progresso.rascunhoPratica(chaveDe(req), texto) })
})

// body { n } - marca que usou até a dica n (1..3); devolve o texto da dica
api.post('/praticas/:deckId/:exId/dica', (req, res) => {
  const ex = acharExercicio(req, res)
  if (!ex) return
  const n = Math.max(1, Math.min(ex.dicas.length, Number(req.body?.n) || 1))
  if (!ex.dicas.length) return res.status(400).json({ erro: 'exercício sem dicas' })
  const estado = progresso.dicaPratica(chaveDe(req), n)
  res.json({ estado, dicas: ex.dicas.slice(0, n) })
})

api.post('/praticas/:deckId/:exId/revelar', (req, res) => {
  const ex = acharExercicio(req, res)
  if (!ex) return
  const estado = progresso.revelarPratica(chaveDe(req))
  res.json({ estado, solucao: ex.solucao, criterios: ex.criterios })
})

api.post('/praticas/:deckId/:exId/reabrir', (req, res) => {
  if (!acharExercicio(req, res)) return
  res.json({ estado: progresso.reabrirPratica(chaveDe(req)) })
})

/**
 * Entrega de um exercício — usada pelas práticas E pelas atividades embutidas nos cursos.
 * body { resposta, nota?, marcados? }
 * - saida/numero/escolha: corrige; errado → conta tentativa e devolve { correto:false }; certo → conclui com nota automática
 * - checklist: `marcados` (array de índices) → nota proporcional
 * - texto: exige `nota` 0..5 (auto-avaliação depois de ver solução/critérios)
 * - qualquer tipo já concluído: `nota` ajusta a nota final (re-conclui)
 * @returns {{ status: number, corpo: object }}
 */
function responderExercicio(ex, chave, corpoReq) {
  const res = { json: (c) => ({ status: 200, corpo: c }), status: (n) => ({ json: (c) => ({ status: n, corpo: c }) }) }
  const { resposta, nota, marcados } = corpoReq || {}
  const termoPrincipal = ex.termos[0] || null
  const estadoAtual = progresso.pratica(chave) || {}
  const notaManual = nota === undefined || nota === null || nota === '' ? null : Number(nota)
  if (notaManual != null && (!Number.isFinite(notaManual) || notaManual < 0 || notaManual > 5)) return res.status(400).json({ erro: 'nota deve ser 0..5' })

  const respostaTexto = Array.isArray(resposta) ? JSON.stringify(resposta) : typeof resposta === 'string' ? resposta : resposta == null ? '' : String(resposta)

  if (ex.auto && notaManual == null) {
    const r = corrigir(ex, resposta)
    if (!r.correto) {
      const estado = progresso.tentativaErradaPratica(chave)
      return res.json({ correto: false, detalhe: r.detalhe || null, estado })
    }
    const n = notaAutomatica({ tentativasErradas: estadoAtual.tentativasErradas || 0, dicasUsadas: estadoAtual.dicasUsadas || 0, revelou: Boolean(estadoAtual.revelou) })
    const out = progresso.concluirPratica({ chave, nota: n, auto: true, resposta: respostaTexto, termoPrincipal })
    return res.json({ correto: true, nota: n, ...out, solucao: ex.solucao, criterios: ex.criterios })
  }

  if (ex.entrega.tipo === 'checklist' && notaManual == null) {
    const idx = Array.isArray(marcados) ? [...new Set(marcados.map(Number).filter((i) => Number.isInteger(i) && i >= 0 && i < ex.entrega.itens.length))] : []
    const n = notaChecklist(idx.length, ex.entrega.itens.length)
    const out = progresso.concluirPratica({ chave, nota: n, auto: true, resposta: JSON.stringify(idx), termoPrincipal })
    return res.json({ correto: true, nota: n, marcados: idx, ...out, solucao: ex.solucao, criterios: ex.criterios })
  }

  if (notaManual == null) return res.status(400).json({ erro: 'nota é obrigatória para este tipo de entrega' })
  const out = progresso.concluirPratica({ chave, nota: notaManual, auto: false, resposta: respostaTexto, termoPrincipal })
  return res.json({ correto: true, nota: Math.round(notaManual), ...out, solucao: ex.solucao, criterios: ex.criterios })
}

api.post('/praticas/:deckId/:exId/responder', (req, res) => {
  const ex = acharExercicio(req, res)
  if (!ex) return
  const r = responderExercicio(ex, chaveDe(req), req.body)
  res.status(r.status).json(r.corpo)
})

// body { resposta } - mentor IA avalia a entrega (texto/código/postmortem) contra critérios + gabarito
api.post('/praticas/:deckId/:exId/mentor', async (req, res) => {
  const ex = acharExercicio(req, res)
  if (!ex) return
  const r = await mentor.avaliarPratica({ exercicio: ex, chave: chaveDe(req), resposta: req.body?.resposta })
  res.status(r.status).json(r.corpo)
})

// ---- cursos (lições em Markdown em content/cursos) ------------------------
/** progresso de um curso: concluídas por módulo, percentual e por onde continuar */
function progressoCurso(curso, est) {
  const licoes = (est && est.licoes) || {}
  const porModulo = {}
  let concluidas = 0
  for (const m of curso.modulos) {
    const feitas = m.licoes.filter((l) => licoes[l.id] && licoes[l.id].concluidaEm).length
    porModulo[m.id] = { total: m.licoes.length, concluidas: feitas, pct: m.licoes.length ? Math.round((feitas / m.licoes.length) * 100) : 0 }
    concluidas += feitas
  }
  const total = curso.totalLicoes
  const todas = curso.modulos.flatMap((m) => m.licoes.map((l) => ({ id: l.id, titulo: l.titulo, moduloId: m.id })))
  // "continuar de onde parei": a última vista se ainda não concluída, senão a primeira que falta
  const ultima = est && est.ultimaLicao ? todas.find((l) => l.id === est.ultimaLicao) : null
  const faltando = todas.find((l) => !(licoes[l.id] && licoes[l.id].concluidaEm)) || null
  const continuar = (ultima && !(licoes[ultima.id] && licoes[ultima.id].concluidaEm) ? ultima : faltando) || faltando || ultima || todas[0] || null
  return {
    total,
    concluidas,
    pct: total ? Math.round((concluidas / total) * 100) : 0,
    porModulo,
    licoes,
    ultimaLicao: (est && est.ultimaLicao) || null,
    atualizadoEm: (est && est.atualizadoEm) || null,
    continuar,
  }
}

/** atividade sem gabarito; a solução só sai depois de concluir ou revelar (igual às práticas) */
function atividadePublica(a) {
  const estado = progresso.pratica(a.chave) || null
  const corpo = { ...cursos.publico(a), estado }
  if (estado && (estado.estado === 'concluida' || estado.revelou)) {
    corpo.solucao = a.solucao
    corpo.solucaoBlocos = a.solucaoBlocos
  }
  return corpo
}

function resumoCurso(c) {
  return {
    id: c.id,
    titulo: c.titulo,
    descricao: c.descricao,
    fase: c.fase,
    ordem: c.ordem,
    deck: c.deck,
    tags: c.tags,
    nivel: c.nivel,
    arquivo: c.arquivo,
    legado: Boolean(c.legado),
    totalModulos: c.modulos.length,
    totalLicoes: c.totalLicoes,
    totalAtividades: c.totalAtividades,
  }
}

api.get('/cursos', (_req, res) => {
  const lista = cursos.listar().map((c) => ({ ...resumoCurso(c), progresso: progressoCurso(c, progresso.curso(c.id)) }))
  res.json({ cursos: lista, erros: cursos.erros() })
})

// curso completo: módulos, lições (com os blocos já prontos para renderizar) e atividades
api.get('/cursos/:id', (req, res) => {
  const c = cursos.obter(String(req.params.id))
  if (!c) return res.status(404).json({ erro: 'curso não encontrado' })
  const prog = progressoCurso(c, progresso.curso(c.id))
  res.json({
    ...resumoCurso(c),
    intro: c.intro,
    progresso: prog,
    modulos: c.modulos.map((m) => ({
      id: m.id,
      titulo: m.titulo,
      intro: m.intro,
      progresso: prog.porModulo[m.id],
      licoes: m.licoes.map((l) => ({
        id: l.id,
        titulo: l.titulo,
        moduloId: m.id,
        atividades: l.atividades || [],
        blocos: l.blocos,
        estado: prog.licoes[l.id] || null,
      })),
    })),
    atividades: c.atividades.map(atividadePublica),
  })
})

function acharLicao(req, res) {
  const r = cursos.licao(String(req.params.id), String(req.params.licaoId))
  if (!r) {
    res.status(404).json({ erro: 'lição não encontrada' })
    return null
  }
  return r
}

// body { concluida?: boolean } - marca/desmarca a lição como concluída
api.post('/cursos/:id/licao/:licaoId/concluir', (req, res) => {
  const r = acharLicao(req, res)
  if (!r) return
  const concluida = req.body && req.body.concluida === false ? false : true
  const est = progresso.concluirLicao(r.curso.id, r.licao.id, r.modulo.id, concluida)
  res.json({ concluida, estado: est.licoes[r.licao.id], progresso: progressoCurso(r.curso, est) })
})

// marca a lição como a última vista (para o botão "continuar"); não conclui nada
api.post('/cursos/:id/licao/:licaoId/visto', (req, res) => {
  const r = acharLicao(req, res)
  if (!r) return
  const est = progresso.verLicao(r.curso.id, r.licao.id, r.modulo.id)
  res.json({ estado: est.licoes[r.licao.id], progresso: progressoCurso(r.curso, est) })
})

// ---- atividades do curso: mesmo fluxo (e mesma correção/SM-2) das práticas ---
function acharAtividade(req, res) {
  const a = cursos.atividade(String(req.params.id), String(req.params.atvId))
  if (!a) {
    res.status(404).json({ erro: 'atividade não encontrada' })
    return null
  }
  return a
}

api.get('/cursos/:id/atividade/:atvId', (req, res) => {
  const a = acharAtividade(req, res)
  if (!a) return
  res.json(atividadePublica(a))
})

api.post('/cursos/:id/atividade/:atvId/iniciar', (req, res) => {
  const a = acharAtividade(req, res)
  if (!a) return
  res.json({ estado: progresso.iniciarPratica(a.chave) })
})

api.put('/cursos/:id/atividade/:atvId/rascunho', (req, res) => {
  const a = acharAtividade(req, res)
  if (!a) return
  const texto = typeof req.body?.texto === 'string' ? req.body.texto : ''
  res.json({ estado: progresso.rascunhoPratica(a.chave, texto) })
})

api.post('/cursos/:id/atividade/:atvId/dica', (req, res) => {
  const a = acharAtividade(req, res)
  if (!a) return
  if (!a.dicas.length) return res.status(400).json({ erro: 'atividade sem dicas' })
  const n = Math.max(1, Math.min(a.dicas.length, Number(req.body?.n) || 1))
  res.json({ estado: progresso.dicaPratica(a.chave, n), dicas: a.dicas.slice(0, n) })
})

api.post('/cursos/:id/atividade/:atvId/revelar', (req, res) => {
  const a = acharAtividade(req, res)
  if (!a) return
  res.json({ estado: progresso.revelarPratica(a.chave), solucao: a.solucao, solucaoBlocos: a.solucaoBlocos, criterios: a.criterios })
})

api.post('/cursos/:id/atividade/:atvId/reabrir', (req, res) => {
  const a = acharAtividade(req, res)
  if (!a) return
  res.json({ estado: progresso.reabrirPratica(a.chave) })
})

api.post('/cursos/:id/atividade/:atvId/responder', (req, res) => {
  const a = acharAtividade(req, res)
  if (!a) return
  const r = responderExercicio(a, a.chave, req.body)
  if (r.status === 200 && r.corpo.correto) r.corpo.solucaoBlocos = a.solucaoBlocos
  res.status(r.status).json(r.corpo)
})

api.post('/cursos/:id/atividade/:atvId/mentor', async (req, res) => {
  const a = acharAtividade(req, res)
  if (!a) return
  const r = await mentor.avaliarPratica({ exercicio: a, chave: a.chave, resposta: req.body?.resposta })
  res.status(r.status).json(r.corpo)
})

// ---- config + mentor IA (OpenRouter) -------------------------------------
// A key nunca sai inteira: GET devolve só temKey/keyMascarada/origemKey.
api.get('/config', (_req, res) => {
  res.json(mentor.obterConfig())
})

// body { openrouterKey?, modelo?, idiomaFeedback? } - key vazia/omitida mantém; "__apagar__" remove
api.put('/config', (req, res) => {
  const { openrouterKey, modelo, idiomaFeedback } = req.body || {}
  const r = mentor.salvarConfig({ openrouterKey, modelo, idiomaFeedback })
  if (!r.ok) return res.status(400).json({ erro: r.erro })
  res.json({ ok: true, config: mentor.obterConfig() })
})

// modelos gratuitos do OpenRouter (deepseek primeiro), cache 1 h; fallback fixo se a rede falhar
api.get('/mentor/modelos', async (_req, res) => {
  res.json(await mentor.listarModelos())
})

// body { deckId, termoId, resposta, idioma: 'pt'|'en' }
api.post('/mentor/avaliar', async (req, res) => {
  const { deckId, termoId, resposta, idioma } = req.body || {}
  const r = await mentor.avaliar({ deckId, termoId, resposta, idioma })
  res.status(r.status).json(r.corpo)
})

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

// detalhe: treino público (sem gabarito), estado de cada etapa e o gabarito só do que já foi concluído/revelado
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

// entrega da etapa: a correção objetiva é a MESMA das práticas (corrigir/notaAutomatica/notaChecklist)
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

// URL publica do tunel Cloudflare (gravada por tunnel.cjs; muda a cada restart do cloudflared)
api.get('/tunnel', (_req, res) => {
  const arq = path.join(RAIZ, 'data', 'tunnel-url.txt')
  let url = null
  try { url = fs.readFileSync(arq, 'utf8').trim() || null } catch {}
  res.json({ url, ativo: Boolean(url) })
})

// ---- bot do Telegram ------------------------------------------------------
// A API nunca devolve o token inteiro (so `tokenMascarado`) e o bot so atende o chat conectado.
api.get('/telegram', (_req, res) => {
  res.json(telegram.obterConfig())
})

// body { telegramToken?, lembrete?, avisos?, chat? } - "__apagar__" no token remove e para o bot
api.put('/telegram', async (req, res) => {
  const { telegramToken, lembrete, avisos, chat } = req.body || {}
  const r = await telegram.salvarConfig({ telegramToken, lembrete, avisos, chat })
  if (!r.ok) return res.status(400).json({ erro: r.erro })
  res.json({ ok: true, config: r.config })
})

// religar depois de corrigir o token (o 409 para o polling de proposito)
api.post('/telegram/iniciar', async (_req, res) => {
  const r = await telegram.iniciar()
  res.json({ ok: Boolean(r.ok), config: telegram.obterConfig() })
})

api.post('/telegram/parar', async (_req, res) => {
  await telegram.parar()
  res.json({ ok: true, config: telegram.obterConfig() })
})

api.post('/telegram/teste', async (_req, res) => {
  res.json(await telegram.enviarTeste())
})

// ---- cards PNG (as mesmas imagens que o bot manda no Telegram) -------------
// GET /api/cards/link.png | hoje | ofensiva | matriz | sugestao | treino
api.get('/cards/:nome.png', (req, res) => {
  const r = telegram.card(req.params.nome)
  if (!r.ok) return res.status(404).json({ erro: r.erro })
  res.set('Content-Type', 'image/png')
  res.send(r.png)
})

api.use((_req, res) => res.status(404).json({ erro: 'rota não encontrada' }))
app.use('/api', api)

// erros (inclui JSON inválido do body-parser, que estoura antes do router) sempre em JSON
app.use((err, req, res, _next) => {
  if (req.path.startsWith('/api')) {
    if (err.type !== 'entity.parse.failed') console.error('[api]', err)
    const status = err.type === 'entity.parse.failed' ? 400 : err.status || 500
    return res.status(status).json({ erro: status === 400 ? 'JSON inválido' : err.message || 'erro interno' })
  }
  console.error('[web]', err)
  res.status(500).type('text/plain').send('erro interno')
})

// ---- estático (dist) + fallback SPA --------------------------------------
if (fs.existsSync(DIST)) {
  app.use(
    express.static(DIST, {
      maxAge: '1h',
      setHeaders(res, filePath) {
        if (filePath.endsWith('index.html')) res.set('Cache-Control', 'no-cache')
        if (/\/assets\//.test(filePath.replace(/\\/g, '/'))) res.set('Cache-Control', 'public, max-age=31536000, immutable')
      },
    }),
  )
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(path.join(DIST, 'index.html'))
  })
} else {
  app.get('/', (_req, res) => {
    res
      .status(200)
      .type('text/plain')
      .send('Trilha RM API ok. Sem dist/: rode `npm run build` (ou use `npm run dev` com o Vite na 5173).')
  })
}

const server = app.listen(PORT, '0.0.0.0', () => {
  const erros = repo.erros()
  console.log(`[trilharm] http://localhost:${PORT}  decks=${repo.listar().length}  dist=${fs.existsSync(DIST) ? 'sim' : 'não'}`)
  if (erros.length) console.warn('[trilharm] avisos de conteúdo:\n  - ' + erros.join('\n  - '))
  telegram.iniciar().then((r) => {
    if (r.ok) console.log('[trilharm] telegram: ligado')
    else console.log('[trilharm] telegram:', r.erro || 'não ligou')
  })
})

function desligar(sinal) {
  console.log(`[trilharm] ${sinal} - encerrando`)
  telegram.parar() // para o long polling e aborta o fetch pendente (senao o proximo boot pega 409)
  server.close(() => {
    Promise.all([progresso.aguardarEscrita(), mentor.aguardarEscrita(), telegram.aguardarEscrita()]).then(() => process.exit(0))
  })
  setTimeout(() => process.exit(0), 3000).unref()
}
process.on('SIGINT', () => desligar('SIGINT'))
process.on('SIGTERM', () => desligar('SIGTERM'))
