// Treinos Especiais (content/treinos/*.json): módulos temáticos com etapas de tipos variados.
// Leitura com recarga por mtime, validação e versão pública (sem gabarito).
// Esquema documentado em content/treinos/README.md.
// A correção e o SM-2 NÃO moram aqui: etapas com entrega objetiva reusam server/praticas.js.
import fs from 'node:fs'
import path from 'node:path'
import { exercicioPublico, normalizarExercicio } from './praticas.js'

export const TIPOS_ETAPA = ['aquecimento', 'leitura', 'desafio', 'cronometrado', 'simulado', 'mao-na-massa', 'ensinar', 'retrospectiva']
export const MODOS_ESTUDO = ['flashcards', 'quiz', 'quiz-inv', 'digitar', 'associar', 'vf', 'explique', 'misto']
export const FORMATOS_ENSINAR = ['audio', 'video', 'texto', 'ao-vivo']
export const IDIOMAS = ['pt', 'en', 'misto']

/** como o servidor avalia cada tipo de etapa (ver tabela em content/treinos/README.md) */
export const AVALIACAO_POR_TIPO = {
  aquecimento: 'marcar',
  leitura: 'marcar',
  desafio: 'exercicio',
  cronometrado: 'perguntas-acerto',
  simulado: 'perguntas-nota',
  'mao-na-massa': 'checklist',
  ensinar: 'auto-nota',
  retrospectiva: 'auto-nota',
}
/** tipos cuja nota vira avaliação SM-2 nos termos (aquecimento não: o modo de estudo já avaliou) */
export const GERA_SM2 = new Set(['desafio', 'cronometrado', 'simulado', 'mao-na-massa', 'ensinar'])

const RE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const cache = { lista: [], assinatura: '', erros: [] }

function assinaturaDir(dir) {
  const partes = []
  try {
    for (const nome of fs.readdirSync(dir)) {
      if (!nome.endsWith('.json')) continue
      const st = fs.statSync(path.join(dir, nome))
      partes.push(`${nome}:${st.mtimeMs}:${st.size}`)
    }
  } catch {
    /* pasta pode não existir */
  }
  return partes.sort().join('|')
}

function str(v, max = 20000) {
  return typeof v === 'string' ? v.slice(0, max) : ''
}
function listaStr(v, max) {
  return Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).slice(0, max) : []
}
function inteiro(v, min, max, padrao) {
  const n = Number(v)
  if (!Number.isFinite(n)) return padrao
  return Math.max(min, Math.min(max, Math.round(n)))
}

/**
 * Resolve ids de termos ("event-loop" ou "node-internals/event-loop") contra os decks.
 * O primeiro termo válido é o principal (é nele que a nota vira SM-2).
 */
export function resolverTermos(ids, deckPadrao, repo, arquivo, ctx, problemas) {
  const out = []
  for (const bruto of listaStr(ids, 8)) {
    const [deckId, termoId] = bruto.includes('/') ? bruto.split('/') : [deckPadrao, bruto]
    const d = deckId ? repo.obter(deckId) : null
    const termo = d ? d.termos.find((t) => t.id === termoId) : null
    if (!termo) {
      problemas.push(`${arquivo}: ${ctx}: termo "${bruto}" não existe - ignorado`)
      continue
    }
    if (!out.some((t) => t.deckId === d.id && t.termoId === termoId)) out.push({ deckId: d.id, termoId, termo: termo.termo })
  }
  return out
}

function normalizarAquecimento(c, arquivo, ctx, problemas) {
  const modo = MODOS_ESTUDO.includes(c.modo) ? c.modo : null
  if (!modo) problemas.push(`${arquivo}: ${ctx}: aquecimento.modo "${c.modo}" inválido (usando flashcards)`)
  const fonte = str(c.fonte, 120) || 'tudo'
  if (!/^(tudo|revisao|deck:[a-z0-9-]+|termo:[a-z0-9-]+\/[a-z0-9-]+)$/.test(fonte)) {
    problemas.push(`${arquivo}: ${ctx}: aquecimento.fonte "${fonte}" inválida (use tudo | revisao | deck:<id> | termo:<deck>/<id>)`)
  }
  const quantidade = inteiro(c.quantidade, 5, 50, 12)
  const soVencidos = Boolean(c.soVencidos)
  const m = modo || 'flashcards'
  return {
    modo: m,
    fonte,
    quantidade,
    soVencidos,
    meta: str(c.meta, 300),
    link: `/estudar/${m}?fonte=${encodeURIComponent(fonte)}&n=${quantidade}${soVencidos ? '&so=vencidos' : ''}`,
  }
}

function normalizarLeitura(c, arquivo, ctx, problemas) {
  const markdown = str(c.markdown, 8000)
  if (markdown.trim().length < 120) problemas.push(`${arquivo}: ${ctx}: leitura.markdown muito curto (< 120 caracteres)`)
  const link = str(c.link, 500)
  if (link && !/^https?:\/\//i.test(link)) problemas.push(`${arquivo}: ${ctx}: leitura.link precisa começar com http(s)://`)
  return { markdown, fonte: str(c.fonte, 300), link: /^https?:\/\//i.test(link) ? link : '', perguntas: listaStr(c.perguntas, 4) }
}

function normalizarCronometrado(c, etapa, deckPadrao, repo, arquivo, ctx, problemas) {
  const minutos = inteiro(c.minutos, 1, 60, 10)
  const vistos = new Set()
  const perguntas = []
  ;(Array.isArray(c.perguntas) ? c.perguntas : []).forEach((p, i) => {
    const id = String((p && p.id) || `q${i + 1}`)
    if (!RE_ID.test(id)) problemas.push(`${arquivo}: ${ctx}: pergunta id "${id}" não é kebab-case`)
    if (vistos.has(id)) return problemas.push(`${arquivo}: ${ctx}: pergunta id duplicado "${id}"`)
    vistos.add(id)
    if (!p || !p.pergunta) return problemas.push(`${arquivo}: ${ctx}: pergunta "${id}" sem texto`)
    if (!p.resposta) problemas.push(`${arquivo}: ${ctx}: pergunta "${id}" sem resposta (gabarito)`)
    perguntas.push({
      id,
      pergunta: str(p.pergunta, 1000),
      resposta: str(p.resposta, 1000),
      termos: resolverTermos(p.termos, deckPadrao, repo, arquivo, `${ctx}/${id}`, problemas),
    })
  })
  if (perguntas.length < 3) problemas.push(`${arquivo}: ${ctx}: cronometrado precisa de >= 3 perguntas`)
  const padraoMin = Math.ceil(perguntas.length * 0.7)
  return {
    minutos,
    perguntas,
    total: perguntas.length,
    acertosMin: inteiro(c.acertosMin, 0, perguntas.length || 1, padraoMin),
    criterio: str(c.criterio, 300),
  }
}

function normalizarSimulado(c, etapa, deckPadrao, repo, arquivo, ctx, problemas) {
  const idioma = IDIOMAS.includes(c.idioma) ? c.idioma : 'pt'
  const criterios = listaStr(c.criterios, 6)
  if (criterios.length < 2) problemas.push(`${arquivo}: ${ctx}: simulado precisa de >= 2 criterios de avaliação`)
  const vistos = new Set()
  const perguntas = []
  ;(Array.isArray(c.perguntas) ? c.perguntas : []).forEach((p, i) => {
    const id = String((p && p.id) || `q${i + 1}`)
    if (!RE_ID.test(id)) problemas.push(`${arquivo}: ${ctx}: pergunta id "${id}" não é kebab-case`)
    if (vistos.has(id)) return problemas.push(`${arquivo}: ${ctx}: pergunta id duplicado "${id}"`)
    vistos.add(id)
    if (!p || !p.pergunta) return problemas.push(`${arquivo}: ${ctx}: pergunta "${id}" sem texto`)
    const pontos = listaStr(p.pontosEsperados, 8)
    if (pontos.length < 2) problemas.push(`${arquivo}: ${ctx}: pergunta "${id}" precisa de >= 2 pontosEsperados`)
    if (!p.respostaModelo) problemas.push(`${arquivo}: ${ctx}: pergunta "${id}" sem respostaModelo`)
    perguntas.push({
      id,
      idioma: p.idioma === 'en' || p.idioma === 'pt' ? p.idioma : idioma === 'misto' ? 'pt' : idioma,
      pergunta: str(p.pergunta, 2000),
      contexto: str(p.contexto, 600),
      pontosEsperados: pontos,
      respostaModelo: str(p.respostaModelo, 6000),
      seguimento: str(p.seguimento, 600),
      termos: resolverTermos(p.termos, deckPadrao, repo, arquivo, `${ctx}/${id}`, problemas),
    })
  })
  if (perguntas.length < 2) problemas.push(`${arquivo}: ${ctx}: simulado precisa de >= 2 perguntas`)
  return { idioma, minutosPorPergunta: inteiro(c.minutosPorPergunta, 1, 15, 5), criterios, perguntas, total: perguntas.length }
}

function normalizarMaoNaMassa(c, arquivo, ctx, problemas) {
  const passos = listaStr(c.passos, 10)
  const criterioPronto = listaStr(c.criterioPronto, 8)
  if (passos.length < 2) problemas.push(`${arquivo}: ${ctx}: mao-na-massa precisa de >= 2 passos`)
  if (criterioPronto.length < 2) problemas.push(`${arquivo}: ${ctx}: mao-na-massa precisa de >= 2 itens em criterioPronto`)
  return {
    contexto: str(c.contexto, 2000),
    stack: listaStr(c.stack, 6),
    tempoCaixa: inteiro(c.tempoCaixa, 5, 480, 60),
    entregavel: str(c.entregavel, 600),
    passos,
    criterioPronto,
  }
}

function normalizarEnsinar(c, arquivo, ctx, problemas) {
  const formato = FORMATOS_ENSINAR.includes(c.formato) ? c.formato : 'texto'
  if (!FORMATOS_ENSINAR.includes(c.formato)) problemas.push(`${arquivo}: ${ctx}: ensinar.formato "${c.formato}" desconhecido (usando texto)`)
  const criterios = listaStr(c.criterios, 6)
  if (!c.publico) problemas.push(`${arquivo}: ${ctx}: ensinar sem "publico" (para quem você explica)`)
  if (criterios.length < 2) problemas.push(`${arquivo}: ${ctx}: ensinar precisa de >= 2 criterios`)
  return {
    publico: str(c.publico, 300),
    formato,
    duracaoMin: inteiro(c.duracaoMin, 1, 60, 5),
    roteiro: listaStr(c.roteiro, 8),
    criterios,
    minimoChars: inteiro(c.minimoChars, 0, 5000, 300),
  }
}

function normalizarRetrospectiva(c, arquivo, ctx, problemas) {
  const perguntas = listaStr(c.perguntas, 6)
  if (perguntas.length < 2) problemas.push(`${arquivo}: ${ctx}: retrospectiva precisa de >= 2 perguntas`)
  return { perguntas, proximoPasso: str(c.proximoPasso, 600), notaFinal: c.notaFinal !== false }
}

/** normaliza uma etapa (cabeçalho comum + corpo do tipo) */
export function normalizarEtapa(bruta, treino, deckPadrao, repo, arquivo, problemas) {
  const id = String(bruta.id || '')
  const ctx = `etapa ${id || '?'}`
  if (!RE_ID.test(id)) problemas.push(`${arquivo}: ${ctx}: id precisa ser kebab-case`)
  const tipo = TIPOS_ETAPA.includes(bruta.tipo) ? bruta.tipo : null
  if (!tipo) {
    problemas.push(`${arquivo}: ${ctx}: tipo "${bruta.tipo}" inválido (use ${TIPOS_ETAPA.join(' | ')})`)
    return null
  }
  const termosEtapa = resolverTermos(bruta.termos, deckPadrao, repo, arquivo, ctx, problemas)
  const termos = termosEtapa.length ? termosEtapa : treino.termos
  const corpoBruto = bruta[tipo] && typeof bruta[tipo] === 'object' ? bruta[tipo] : null
  if (!corpoBruto) problemas.push(`${arquivo}: ${ctx}: falta o objeto "${tipo}" com o corpo da etapa`)
  const c = corpoBruto || {}

  let corpo = null
  if (tipo === 'aquecimento') corpo = normalizarAquecimento(c, arquivo, ctx, problemas)
  else if (tipo === 'leitura') corpo = normalizarLeitura(c, arquivo, ctx, problemas)
  else if (tipo === 'cronometrado') corpo = normalizarCronometrado(c, bruta, deckPadrao, repo, arquivo, ctx, problemas)
  else if (tipo === 'simulado') corpo = normalizarSimulado(c, bruta, deckPadrao, repo, arquivo, ctx, problemas)
  else if (tipo === 'mao-na-massa') corpo = normalizarMaoNaMassa(c, arquivo, ctx, problemas)
  else if (tipo === 'ensinar') corpo = normalizarEnsinar(c, arquivo, ctx, problemas)
  else if (tipo === 'retrospectiva') corpo = normalizarRetrospectiva(c, arquivo, ctx, problemas)
  else if (tipo === 'desafio') {
    // mesmo esquema (e mesma normalização) de content/praticas: nada é reimplementado
    const herdados = (c.termos && c.termos.length ? null : termos.map((t) => `${t.deckId}/${t.termoId}`)) || c.termos
    const ex = normalizarExercicio(
      { ...c, id, titulo: bruta.titulo || id, termos: herdados, nivel: c.nivel ?? bruta.nivel ?? treino.nivel, tempoMin: c.tempoMin ?? bruta.tempoMin },
      arquivo,
      deckPadrao ? repo.obter(deckPadrao) : null,
      repo,
      problemas,
    )
    corpo = { exercicio: ex }
  }

  const tempoMin = inteiro(bruta.tempoMin, 1, 480, tipo === 'desafio' && corpo && corpo.exercicio ? corpo.exercicio.tempoMin : 20)
  return {
    id,
    tipo,
    titulo: str(bruta.titulo, 200) || id,
    dia: Number.isFinite(Number(bruta.dia)) ? Math.max(1, Math.round(Number(bruta.dia))) : null,
    tempoMin,
    resumo: str(bruta.resumo, 500),
    opcional: Boolean(bruta.opcional),
    termos,
    avaliacao: AVALIACAO_POR_TIPO[tipo],
    geraSM2: GERA_SM2.has(tipo),
    corpo,
  }
}

function normalizarTreino(bruto, arquivo, repo, problemas) {
  const id = String(bruto.id || '')
  if (!RE_ID.test(id)) problemas.push(`${arquivo}: id do treino precisa ser kebab-case (recebi "${bruto.id}")`)
  if (!bruto.titulo) problemas.push(`${arquivo}: sem titulo`)
  if (!bruto.objetivo) problemas.push(`${arquivo}: sem objetivo (o que o Rafael sai sabendo)`)
  if (!bruto.recompensa) problemas.push(`${arquivo}: sem recompensa (o que ele destrava ao terminar)`)

  const decks = []
  for (const d of listaStr(bruto.decks, 8)) {
    if (repo.obter(d)) decks.push(d)
    else problemas.push(`${arquivo}: deck "${d}" não existe - ignorado`)
  }
  const deckPadrao = decks[0] || null
  const termos = resolverTermos(bruto.termos, deckPadrao, repo, arquivo, 'treino', problemas)
  const nivel = inteiro(bruto.nivel, 1, 5, 3)
  const cabecalho = { id, nivel, termos }

  const etapas = []
  const idsEtapa = new Set()
  const listaEtapas = Array.isArray(bruto.etapas) ? bruto.etapas : []
  if (!listaEtapas.length) problemas.push(`${arquivo}: sem etapas`)
  listaEtapas.forEach((e, i) => {
    if (!e || !e.id) return problemas.push(`${arquivo}: etapa[${i}] sem id`)
    if (idsEtapa.has(String(e.id))) return problemas.push(`${arquivo}: etapa id duplicado "${e.id}"`)
    idsEtapa.add(String(e.id))
    const n = normalizarEtapa(e, cabecalho, deckPadrao, repo, arquivo, problemas)
    if (n) etapas.push(n)
  })
  if (etapas.length && etapas[etapas.length - 1].tipo !== 'retrospectiva') {
    problemas.push(`${arquivo}: a última etapa deveria ser uma "retrospectiva" (fechamento + auto-nota)`)
  }

  const duracaoDias = Number.isFinite(Number(bruto.duracaoDias)) ? inteiro(bruto.duracaoDias, 1, 60, 1) : null
  const somaEtapas = etapas.reduce((a, e) => a + e.tempoMin, 0)
  const tempoTotalMin = Number.isFinite(Number(bruto.tempoTotalMin)) ? inteiro(bruto.tempoTotalMin, 1, 10000, somaEtapas) : somaEtapas
  if (!duracaoDias && !bruto.tempoTotalMin) problemas.push(`${arquivo}: sem duracaoDias nem tempoTotalMin (usando a soma das etapas: ${somaEtapas} min)`)

  return {
    id,
    arquivo,
    titulo: str(bruto.titulo, 200) || id,
    subtitulo: str(bruto.subtitulo, 300),
    objetivo: str(bruto.objetivo, 1000),
    nivel,
    duracaoDias,
    tempoTotalMin,
    decks,
    deckPrincipal: deckPadrao,
    termos,
    tags: listaStr(bruto.tags, 8).map((t) => t.toLowerCase()),
    preRequisitos: listaStr(bruto.preRequisitos, 6),
    recompensa: str(bruto.recompensa, 600),
    obrigatorias: etapas.filter((e) => !e.opcional).length,
    tipos: [...new Set(etapas.map((e) => e.tipo))],
    etapas,
  }
}

/** versão pública de uma etapa: sem gabarito (solução, respostas, respostaModelo, pontosEsperados) */
export function etapaPublica(etapa, { revelar = false } = {}) {
  if (!etapa) return null
  const base = { ...etapa }
  const c = etapa.corpo || {}
  if (etapa.tipo === 'desafio') {
    base.corpo = { exercicio: revelar ? { ...c.exercicio } : exercicioPublico(c.exercicio) }
  } else if (etapa.tipo === 'cronometrado') {
    base.corpo = { ...c, perguntas: c.perguntas.map((p) => (revelar ? p : { ...p, resposta: undefined })) }
  } else if (etapa.tipo === 'simulado') {
    base.corpo = {
      ...c,
      perguntas: c.perguntas.map((p) => (revelar ? p : { ...p, respostaModelo: undefined, pontosEsperados: undefined, seguimento: undefined })),
    }
  }
  return base
}

/** gabarito de uma etapa (o que `etapaPublica` esconde), para quando ela já foi concluída/revelada */
export function gabaritoEtapa(etapa) {
  if (!etapa) return null
  const c = etapa.corpo || {}
  if (etapa.tipo === 'desafio') return { solucao: c.exercicio.solucao, criterios: c.exercicio.criterios }
  if (etapa.tipo === 'cronometrado') return { respostas: c.perguntas.map((p) => ({ id: p.id, resposta: p.resposta })) }
  if (etapa.tipo === 'simulado')
    return { perguntas: c.perguntas.map((p) => ({ id: p.id, pontosEsperados: p.pontosEsperados, respostaModelo: p.respostaModelo, seguimento: p.seguimento })) }
  return null
}

/** versão pública de um treino inteiro (lista/detalhe): etapas sem gabarito */
export function treinoPublico(treino, { revelar = [] } = {}) {
  if (!treino) return null
  return { ...treino, etapas: treino.etapas.map((e) => etapaPublica(e, { revelar: revelar.includes(e.id) })) }
}

export function criarTreinos(raizConteudo, repo) {
  const dir = path.join(raizConteudo, 'treinos')

  function recarregarSePreciso() {
    const ass = assinaturaDir(dir) + '#' + repo.listar().map((d) => `${d.id}:${d.termos.length}`).join(',')
    if (ass === cache.assinatura) return false
    const lista = []
    const erros = []
    const idsVistos = new Set()
    let nomes = []
    try {
      nomes = fs.readdirSync(dir).filter((n) => n.endsWith('.json')).sort()
    } catch {
      nomes = []
    }
    for (const nome of nomes) {
      const arquivo = `treinos/${nome}`
      let bruto
      try {
        bruto = JSON.parse(fs.readFileSync(path.join(dir, nome), 'utf8'))
      } catch (e) {
        erros.push(`${arquivo}: JSON inválido - ${e.message}`)
        continue
      }
      if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) {
        erros.push(`${arquivo}: esperado um objeto { id, titulo, ..., etapas: [...] }`)
        continue
      }
      const t = normalizarTreino(bruto, arquivo, repo, erros)
      if (!t.id) continue
      if (idsVistos.has(t.id)) {
        erros.push(`${arquivo}: id de treino duplicado (${t.id}) - arquivo ignorado`)
        continue
      }
      idsVistos.add(t.id)
      lista.push(t)
    }
    lista.sort((a, b) => a.nivel - b.nivel || a.arquivo.localeCompare(b.arquivo))
    cache.lista = lista
    cache.erros = erros
    cache.assinatura = ass
    return true
  }

  function obter(id) {
    recarregarSePreciso()
    return cache.lista.find((t) => t.id === id) || null
  }

  return {
    recarregarSePreciso,
    listar() {
      recarregarSePreciso()
      return cache.lista
    },
    obter,
    etapa(idTreino, idEtapa) {
      const t = obter(idTreino)
      return t ? t.etapas.find((e) => e.id === idEtapa) || null : null
    },
    /** publico(treino) | publico(treino, { revelar: [idEtapa] }) | publico(etapa, { etapa: true }) */
    publico(alvo, opcoes = {}) {
      if (!alvo) return null
      if (opcoes.etapa || (alvo.tipo && !alvo.etapas)) return etapaPublica(alvo, opcoes)
      return treinoPublico(alvo, opcoes)
    },
    gabarito: gabaritoEtapa,
    erros() {
      recarregarSePreciso()
      return cache.erros
    },
  }
}
