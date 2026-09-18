// Trilha -> Módulo -> Lição: lê content/estrutura.json e resolve contra decks, cursos, práticas e
// treinos. Nenhum arquivo de conteúdo se move — o módulo só APONTA. Recarrega pelo mtime, como decks.js.
//
// Vocabulário (ver docs/AI-GUIA.md):
//   TRILHA  = uma fase do plano de carreira (T1..T5)
//   MÓDULO  = um tema; junta vocabulário (deck), lições (curso), exercícios (práticas) e chefão (treino)
//   NÓ      = uma lição: sessão curta de 8-12 itens montada por server/licao.js
import fs from 'node:fs'
import path from 'node:path'
import { vencido } from './sm2.js'

/** quantos termos um nó cobre, quando o tamanho do deck é quem manda */
export const TERMOS_POR_NO = 6
/** teto de nós por módulo: mais que isso vira lista infinita na tela do celular */
export const MAX_NOS = 12

/** reparte `itens` em `n` baldes, na ordem, o mais uniformemente possível */
export function distribuir(itens, n) {
  const baldes = Array.from({ length: Math.max(1, n) }, () => [])
  if (!itens || !itens.length) return baldes
  const base = Math.floor(itens.length / baldes.length)
  const resto = itens.length % baldes.length
  let i = 0
  for (let b = 0; b < baldes.length; b++) {
    const quantos = base + (b < resto ? 1 : 0)
    baldes[b] = itens.slice(i, i + quantos)
    i += quantos
  }
  return baldes
}

/**
 * Quantos nós um módulo tem. Quem manda é o VOCABULÁRIO (uma lição precisa de ~6 termos para chegar
 * aos 8-12 itens), com as leituras do curso como piso — até duas por nó.
 * ⚠️ Exercício NÃO cria nó: ele é longo (20-50 min) e se distribui entre os nós que já existem.
 * Deixar cada exercício abrir um nó deixava as lições com 3 termos e vazias.
 */
export function contarNos({ totalTermos, totalLeituras }) {
  const porTermos = Math.ceil((totalTermos || 0) / TERMOS_POR_NO)
  const porLeituras = Math.ceil((totalLeituras || 0) / 2)
  return Math.max(1, Math.min(MAX_NOS, Math.max(porTermos, porLeituras)))
}

/** média de nível 0..5 dos termos do módulo; termo nunca visto conta 0 (é o que ele sabe hoje) */
export function coroasDe(termos, estadosTermos, deckId) {
  if (!termos.length) return { nivelMedio: 0, coroas: 0, vistos: 0, total: 0 }
  let soma = 0
  let vistos = 0
  for (const t of termos) {
    const est = estadosTermos[`${deckId}/${t.id}`]
    if (est && Number.isFinite(est.nivel)) {
      soma += est.nivel
      vistos += 1
    }
  }
  const nivelMedio = soma / termos.length
  return { nivelMedio: Math.round(nivelMedio * 100) / 100, coroas: Math.floor(nivelMedio), vistos, total: termos.length }
}

function lerJson(arq) {
  return JSON.parse(fs.readFileSync(arq, 'utf8'))
}

export function criarEstrutura(raizConteudo, { repo, cursos, praticas, treinos, progresso }) {
  const arqEstrutura = path.join(raizConteudo, 'estrutura.json')
  const cache = { assinatura: '', bruto: null, erros: [] }

  function recarregarSePreciso() {
    let ass = 'none'
    try {
      const st = fs.statSync(arqEstrutura)
      ass = `${st.mtimeMs}:${st.size}`
    } catch {
      /* sem arquivo: caímos no fallback por trilhas.json */
    }
    if (ass === cache.assinatura) return false
    cache.assinatura = ass
    cache.erros = []
    cache.bruto = null
    if (ass === 'none') {
      cache.erros.push('estrutura.json: não encontrado - usando trilhas.json como fallback')
      return true
    }
    try {
      const j = lerJson(arqEstrutura)
      if (!j || !Array.isArray(j.trilhas)) cache.erros.push('estrutura.json: esperado { trilhas: [...] }')
      else cache.bruto = j
    } catch (e) {
      cache.erros.push(`estrutura.json: JSON inválido - ${e.message}`)
    }
    return true
  }

  /** se estrutura.json não existir, monta uma equivalente a partir de trilhas.json (retrocompat) */
  function brutoOuFallback() {
    recarregarSePreciso()
    if (cache.bruto) return cache.bruto
    const tr = repo.trilhas()
    return {
      versao: 0,
      trilhas: tr.fases.map((f) => ({
        id: `t${f.numero}`,
        numero: f.numero,
        titulo: f.titulo,
        descricao: f.descricao || '',
        cor: '#9db1ea',
        modulos: (f.decks || []).map((id, i) => ({ id, titulo: (repo.obter(id) || {}).titulo || id, deck: id, ordem: i + 1, cursos: [], praticas: id, treinos: [] })),
      })),
    }
  }

  /** todas as lições dos cursos de um módulo, achatadas na ordem do curso */
  function leiturasDoModulo(m) {
    const out = []
    for (const cursoId of m.cursos || []) {
      const c = cursos.obter(cursoId)
      if (!c) continue
      for (const mod of c.modulos) {
        for (const l of mod.licoes) out.push({ cursoId: c.id, cursoTitulo: c.titulo, moduloId: mod.id, licaoId: l.id, titulo: l.titulo })
      }
    }
    return out
  }

  /** exercícios do arquivo de práticas do módulo, sem gabarito */
  function exerciciosDoModulo(m) {
    const arq = praticas.listar().find((p) => p.deckId === (m.praticas || m.deck))
    if (!arq) return []
    return arq.exercicios.map((ex) => ({
      deckId: arq.deckId,
      exId: ex.id,
      titulo: ex.titulo,
      tipo: ex.entrega.tipo,
      nivel: ex.nivel,
      tempoMin: ex.tempoMin,
      ambiente: ex.ambiente,
    }))
  }

  function chefaoDoModulo(m) {
    for (const id of m.treinos || []) {
      const t = treinos.obter(id)
      if (t) return { treinoId: t.id, titulo: t.titulo, etapas: t.etapas.length, duracaoDias: t.duracaoDias }
    }
    return null
  }

  /**
   * Os nós (lições) de um módulo, já com o material de cada um e o estado
   * (feito / disponível / bloqueado). O nó só fica disponível quando o anterior fecha.
   */
  function nosDoModulo(m, { deck, leituras, exercicios, chefao, estadoNos }) {
    const termos = deck ? deck.termos : []
    const n = contarNos({ totalTermos: termos.length, totalLeituras: leituras.length })
    const blocosTermos = distribuir(termos, n)
    const blocosLeituras = distribuir(leituras, n)
    const blocosExercicios = distribuir(exercicios, n)
    const nos = []
    for (let i = 0; i < n; i++) {
      const id = `${m.id}/${i + 1}`
      const est = estadoNos[id] || null
      nos.push({
        id,
        n: i + 1,
        tipo: 'licao',
        moduloId: m.id,
        titulo: `Lição ${i + 1}`,
        termos: blocosTermos[i].map((t) => t.id),
        leituras: blocosLeituras[i],
        exercicios: blocosExercicios[i],
        totalItens: blocosTermos[i].length + blocosLeituras[i].length + blocosExercicios[i].length,
        estado: est && est.concluidaEm ? 'feito' : 'bloqueado',
        xp: est ? est.melhorXp || 0 : 0,
        vezes: est ? (est.historico || []).length : 0,
        ultimoAcerto: est ? est.ultimoAcerto ?? null : null,
      })
    }
    if (chefao) {
      const id = `${m.id}/chefao`
      const est = estadoNos[id] || null
      nos.push({
        id,
        n: nos.length + 1,
        tipo: 'chefao',
        moduloId: m.id,
        titulo: chefao.titulo,
        treinoId: chefao.treinoId,
        termos: [],
        leituras: [],
        exercicios: [],
        totalItens: chefao.etapas,
        estado: est && est.concluidaEm ? 'feito' : 'bloqueado',
        xp: est ? est.melhorXp || 0 : 0,
        vezes: est ? (est.historico || []).length : 0,
        ultimoAcerto: null,
      })
    }
    // o primeiro nó não-feito é o disponível; refazer um nó feito é sempre permitido pela UI
    const proximo = nos.find((x) => x.estado !== 'feito')
    if (proximo) proximo.estado = 'disponivel'
    return nos
  }

  /** resolve um módulo: o que existe, o que falta, progresso, coroas e nós */
  function resolverModulo(m, prog) {
    const deck = repo.obter(m.deck || m.id)
    const leituras = leiturasDoModulo(m)
    const exercicios = exerciciosDoModulo(m)
    const chefao = chefaoDoModulo(m)
    const estadoNos = prog.nos || {}
    const nos = nosDoModulo(m, { deck, leituras, exercicios, chefao, estadoNos })
    const termos = deck ? deck.termos : []
    const coroas = coroasDe(termos, prog.termos || {}, m.deck || m.id)
    const hoje = new Date().toISOString().slice(0, 10)
    let vencidos = 0
    let novos = 0
    for (const t of termos) {
      const est = (prog.termos || {})[`${(m.deck || m.id)}/${t.id}`]
      if (!est) novos += 1
      else if (vencido(est, hoje)) vencidos += 1
    }
    const feitos = nos.filter((x) => x.estado === 'feito').length
    const exerciciosFeitos = exercicios.filter((ex) => {
      const e = (prog.praticas || {})[`${ex.deckId}/${ex.exId}`]
      return e && e.estado === 'concluida'
    }).length
    return {
      id: m.id,
      titulo: m.titulo || (deck ? deck.titulo : m.id),
      resumo: m.resumo || (deck ? deck.descricao : ''),
      icone: m.icone || 'blocos',
      ordem: m.ordem || 99,
      idioma: m.idioma || 'pt',
      preRequisito: m.preRequisito || null,
      deckId: m.deck || m.id,
      existe: Boolean(deck),
      emProducao: !deck,
      conteudo: {
        termos: termos.length,
        leituras: leituras.length,
        exercicios: exercicios.length,
        cursos: (m.cursos || []).filter((id) => cursos.obter(id)).length,
        cursosIds: (m.cursos || []).filter((id) => cursos.obter(id)),
        chefao,
      },
      progresso: {
        ...coroas,
        vencidos,
        novos,
        exerciciosFeitos,
        nosFeitos: feitos,
        nosTotal: nos.length,
        pct: nos.length ? Math.round((feitos / nos.length) * 100) : 0,
        concluido: nos.length > 0 && feitos === nos.length,
      },
      nos,
    }
  }

  /** estrutura inteira resolvida: trilhas, módulos, nós, progresso e a próxima ação */
  function resolver() {
    const bruto = brutoOuFallback()
    const prog = progresso.obter()
    const trilhas = bruto.trilhas.map((t) => {
      const modulos = (t.modulos || [])
        .map((m) => resolverModulo(m, prog))
        .sort((a, b) => a.ordem - b.ordem)
      // pré-requisito é trava MACIA: a tela avisa, mas nunca proíbe (ele estuda fora de ordem de propósito)
      const porId = new Map(modulos.map((m) => [m.id, m]))
      for (const m of modulos) {
        const pre = m.preRequisito ? porId.get(m.preRequisito) : null
        m.bloqueado = Boolean(pre && pre.progresso.pct < 50)
        m.bloqueadoPor = m.bloqueado ? { id: pre.id, titulo: pre.titulo } : null
      }
      const nosTotal = modulos.reduce((a, m) => a + m.progresso.nosTotal, 0)
      const nosFeitos = modulos.reduce((a, m) => a + m.progresso.nosFeitos, 0)
      return {
        id: t.id,
        numero: t.numero,
        titulo: t.titulo,
        subtitulo: t.subtitulo || '',
        periodo: t.periodo || '',
        descricao: t.descricao || '',
        cor: t.cor || '#9db1ea',
        modulos,
        progresso: {
          modulos: modulos.length,
          modulosConcluidos: modulos.filter((m) => m.progresso.concluido).length,
          nosTotal,
          nosFeitos,
          pct: nosTotal ? Math.round((nosFeitos / nosTotal) * 100) : 0,
          termos: modulos.reduce((a, m) => a + m.conteudo.termos, 0),
          vencidos: modulos.reduce((a, m) => a + m.progresso.vencidos, 0),
          emProducao: modulos.filter((m) => m.emProducao).length,
        },
      }
    })
    // trilha atual = a primeira que ainda não fechou; se todas fecharam, a última
    const atual = trilhas.find((t) => t.progresso.pct < 100) || trilhas[trilhas.length - 1] || null
    const proximo = proximaAcao(trilhas, atual)
    return { versao: bruto.versao, trilhas, trilhaAtual: atual ? atual.id : null, proximo, erros: erros() }
  }

  /** o nó que o app propõe agora: primeiro disponível da trilha atual, em módulo que existe */
  function proximaAcao(trilhas, atual) {
    const ordem = atual ? [atual, ...trilhas.filter((t) => t.id !== atual.id)] : trilhas
    for (const t of ordem) {
      for (const m of t.modulos) {
        if (m.emProducao) continue
        const no = m.nos.find((x) => x.estado === 'disponivel')
        if (no) return { trilhaId: t.id, trilhaNumero: t.numero, trilhaTitulo: t.titulo, moduloId: m.id, moduloTitulo: m.titulo, no: { id: no.id, n: no.n, tipo: no.tipo, titulo: no.titulo, totalItens: no.totalItens } }
      }
    }
    return null
  }

  /** um módulo isolado (tela do módulo), já resolvido */
  function modulo(id) {
    const bruto = brutoOuFallback()
    for (const t of bruto.trilhas) {
      const m = (t.modulos || []).find((x) => x.id === id)
      if (m) {
        const resolvido = resolverModulo(m, progresso.obter())
        return { ...resolvido, trilha: { id: t.id, numero: t.numero, titulo: t.titulo, cor: t.cor || '#9db1ea' } }
      }
    }
    return null
  }

  /** o nó cru (sem montar a sessão) — quem monta a sessão é server/licao.js */
  function no(noId) {
    const [moduloId] = String(noId).split('/')
    const m = modulo(moduloId)
    if (!m) return null
    const alvo = m.nos.find((x) => x.id === noId)
    if (!alvo) return null
    return { modulo: m, no: alvo }
  }

  /** todos os módulos achatados (para validador, glossário e o bot) */
  function modulos() {
    const bruto = brutoOuFallback()
    const prog = progresso.obter()
    return bruto.trilhas.flatMap((t) => (t.modulos || []).map((m) => ({ ...resolverModulo(m, prog), trilhaId: t.id, trilhaNumero: t.numero })))
  }

  /** erros de coerência: deck órfão, deck em dois módulos, arquivo apontado que não existe */
  function erros() {
    recarregarSePreciso()
    const out = [...cache.erros]
    if (!cache.bruto) return out
    const vistos = new Map()
    const idsModulo = new Set()
    for (const t of cache.bruto.trilhas) {
      for (const m of t.modulos || []) {
        if (idsModulo.has(m.id)) out.push(`estrutura.json: módulo duplicado (${m.id})`)
        idsModulo.add(m.id)
        const deckId = m.deck || m.id
        if (vistos.has(deckId)) out.push(`estrutura.json: deck "${deckId}" aparece em dois módulos (${vistos.get(deckId)} e ${m.id})`)
        vistos.set(deckId, m.id)
        for (const cid of m.cursos || []) if (!cursos.obter(cid)) out.push(`estrutura.json: módulo ${m.id} aponta para o curso "${cid}", que não existe`)
        for (const tid of m.treinos || []) if (!treinos.obter(tid)) out.push(`estrutura.json: módulo ${m.id} aponta para o treino "${tid}", que não existe`)
        if (m.preRequisito && !(t.modulos || []).some((x) => x.id === m.preRequisito)) out.push(`estrutura.json: pré-requisito "${m.preRequisito}" do módulo ${m.id} não está na mesma trilha`)
      }
    }
    for (const d of repo.listar()) if (!vistos.has(d.id)) out.push(`estrutura.json: deck "${d.id}" não pertence a nenhum módulo (órfão)`)
    return out
  }

  /** content/trilhas.json continua servido pela API; agora é DERIVADO da estrutura */
  function trilhasCompativel() {
    const bruto = brutoOuFallback()
    return {
      origem: cache.bruto ? 'estrutura.json' : 'trilhas.json',
      fases: bruto.trilhas.map((t) => ({
        numero: t.numero,
        titulo: t.titulo,
        descricao: t.descricao || '',
        decks: (t.modulos || []).map((m) => m.deck || m.id).filter((id) => repo.obter(id)),
      })),
    }
  }

  return { recarregarSePreciso, resolver, modulo, modulos, no, erros, trilhasCompativel }
}
