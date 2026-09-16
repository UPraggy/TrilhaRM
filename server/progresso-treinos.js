// Progresso dos Treinos Especiais.
// Mora num arquivo próprio (data/progresso-treinos.json) para NÃO precisar editar server/progresso.js,
// mas o formato é o do objeto `treinos` de data/progresso.json: o dia em que progresso.js ganhar
// `treinos: {}` em progressoVazio(), basta copiar a chave "treinos" daqui para lá (ver INTEGRACAO-TREINOS.md).
//
// O SM-2, a ofensiva e o histórico do dia continuam saindo do progresso injetado (progresso.avaliar),
// e a correção das entregas objetivas sai de server/praticas.js. Nada disso é reimplementado aqui.
import fs from 'node:fs'
import path from 'node:path'
import { corrigir, notaAutomatica, notaChecklist } from './praticas.js'

export const VERSAO = 1

export function treinoInicial() {
  return {
    estado: 'novo', // novo | andamento | concluido
    iniciadoEm: null,
    concluidoEm: null,
    etapaAtual: null,
    etapas: {}, // etapaId -> etapaInicial()
    notaFinal: null,
    atualizadoEm: null,
  }
}

export function etapaInicial() {
  return {
    estado: 'nova', // nova | andamento | concluida
    iniciadaEm: null,
    concluidaEm: null,
    tentativasErradas: 0,
    dicasUsadas: 0,
    revelou: false,
    rascunho: '',
    nota: null,
    melhorNota: null,
    dados: null, // { acertos: [...] } | { notas: {...} } | { marcados: [...] } | { segundos }
    historico: [], // { dia, nota, auto, resposta }
  }
}

function hojeISO(d = new Date()) {
  const off = d.getTimezoneOffset() * 60 * 1000
  return new Date(d.getTime() - off).toISOString().slice(0, 10)
}

const texto = (v, max = 8000) => (Array.isArray(v) || (v && typeof v === 'object') ? JSON.stringify(v) : v == null ? '' : String(v)).slice(0, max)
const nota05 = (n) => Math.max(0, Math.min(5, Math.round(Number(n) || 0)))

/**
 * @param progresso o objeto devolvido por criarProgresso() (injeção: SM-2 + ofensiva + histórico)
 * @param opcoes.arquivo caminho do JSON de progresso dos treinos
 */
export function criarProgressoTreinos(progresso, opcoes = {}) {
  const arquivo = opcoes.arquivo || path.join(process.cwd(), 'data', 'progresso-treinos.json')
  const dir = path.dirname(arquivo)
  let estado = null
  let filaEscrita = Promise.resolve()

  function carregar() {
    if (estado) return estado
    try {
      const bruto = JSON.parse(fs.readFileSync(arquivo, 'utf8'))
      estado = { versao: VERSAO, treinos: bruto && typeof bruto.treinos === 'object' && bruto.treinos ? bruto.treinos : {} }
    } catch (e) {
      if (e.code !== 'ENOENT') console.warn('[progresso-treinos] arquivo ilegível, começando do zero:', e.message)
      estado = { versao: VERSAO, treinos: {} }
    }
    // um progresso.json que já tenha a chave "treinos" (formato unificado) semeia o arquivo novo
    if (!Object.keys(estado.treinos).length) {
      const antigo = progresso && typeof progresso.obter === 'function' ? progresso.obter().treinos : null
      if (antigo && typeof antigo === 'object') estado.treinos = JSON.parse(JSON.stringify(antigo))
    }
    return estado
  }

  function salvar() {
    const snapshot = JSON.stringify(carregar(), null, 2)
    filaEscrita = filaEscrita.then(
      () =>
        new Promise((resolve) => {
          fs.mkdir(dir, { recursive: true }, () => {
            const tmp = `${arquivo}.${process.pid}.${Date.now()}.tmp`
            fs.writeFile(tmp, snapshot, 'utf8', (err) => {
              if (err) {
                console.error('[progresso-treinos] falha ao escrever temp:', err.message)
                return resolve()
              }
              fs.rename(tmp, arquivo, (err2) => {
                if (err2) {
                  console.error('[progresso-treinos] falha no rename:', err2.message)
                  fs.unlink(tmp, () => {})
                }
                resolve()
              })
            })
          })
        }),
    )
    return filaEscrita
  }

  function doTreino(treinoId) {
    const p = carregar()
    return p.treinos[treinoId] || (p.treinos[treinoId] = treinoInicial())
  }
  function daEtapa(treinoId, etapaId) {
    const t = doTreino(treinoId)
    return t.etapas[etapaId] || (t.etapas[etapaId] = etapaInicial())
  }
  function tocar(t, etapaId) {
    const agora = new Date().toISOString()
    if (!t.iniciadoEm) t.iniciadoEm = agora
    if (t.estado === 'novo') t.estado = 'andamento'
    if (etapaId) t.etapaAtual = etapaId
    t.atualizadoEm = agora
  }
  function abrirEtapa(treinoId, etapaId) {
    const t = doTreino(treinoId)
    const e = daEtapa(treinoId, etapaId)
    tocar(t, etapaId)
    if (e.estado === 'nova') {
      e.estado = 'andamento'
      e.iniciadaEm = new Date().toISOString()
    }
    return { t, e }
  }

  /** nota final + estado do treino a partir da definição (quais etapas são obrigatórias) */
  function recalcular(treino) {
    const t = doTreino(treino.id)
    const obrigatorias = treino.etapas.filter((e) => !e.opcional)
    const concluidas = obrigatorias.filter((e) => (t.etapas[e.id] || {}).estado === 'concluida')
    const notas = obrigatorias.map((e) => (t.etapas[e.id] || {}).nota).filter((n) => typeof n === 'number')
    t.notaFinal = notas.length ? Math.round((notas.reduce((a, n) => a + n, 0) / notas.length) * 10) / 10 : null
    if (obrigatorias.length && concluidas.length === obrigatorias.length) {
      if (t.estado !== 'concluido') t.concluidoEm = new Date().toISOString()
      t.estado = 'concluido'
    } else if (t.estado === 'concluido') {
      t.estado = 'andamento'
      t.concluidoEm = null
    }
    return t
  }

  /** resumo pronto para a lista (/api/treinos) */
  function resumo(treino) {
    const t = carregar().treinos[treino.id] || treinoInicial()
    const obrigatorias = treino.etapas.filter((e) => !e.opcional)
    const concluidas = treino.etapas.filter((e) => (t.etapas[e.id] || {}).estado === 'concluida')
    const proxima = treino.etapas.find((e) => (t.etapas[e.id] || {}).estado !== 'concluida') || null
    return {
      estado: t.estado,
      etapaAtual: t.etapaAtual,
      proximaEtapa: proxima ? proxima.id : null,
      concluidas: concluidas.length,
      total: treino.etapas.length,
      obrigatorias: obrigatorias.length,
      percentual: treino.etapas.length ? Math.round((concluidas.length / treino.etapas.length) * 100) : 0,
      notaFinal: t.notaFinal,
      iniciadoEm: t.iniciadoEm,
      concluidoEm: t.concluidoEm,
      atualizadoEm: t.atualizadoEm,
    }
  }

  /** aplica as avaliações SM-2 no progresso injetado (modo "treino") */
  function avaliarTermos(avaliacoes, resposta) {
    const saida = []
    for (const a of avaliacoes) {
      if (!a || !a.deckId || !a.termoId) continue
      const r = progresso.avaliar({ deckId: a.deckId, termoId: a.termoId, nota: nota05(a.nota), modo: a.modo || 'treino', resposta })
      saida.push({ chave: r.chave, estado: r.termo, streak: r.streak, hoje: r.hoje })
    }
    return saida
  }

  function concluirEtapa({ treino, etapa, nota, auto, resposta, dados, avaliacoes }) {
    const { t, e } = abrirEtapa(treino.id, etapa.id)
    const agora = new Date()
    const n = nota == null ? null : nota05(nota)
    e.estado = 'concluida'
    e.concluidaEm = agora.toISOString()
    e.nota = n
    if (n != null) e.melhorNota = e.melhorNota == null ? n : Math.max(e.melhorNota, n)
    if (dados !== undefined) e.dados = dados
    e.rascunho = ''
    e.historico = [...(e.historico || []).slice(-9), { dia: hojeISO(agora), nota: n, auto: Boolean(auto), resposta: texto(resposta, 6000) }]
    const termos = avaliacoes && avaliacoes.length ? avaliarTermos(avaliacoes, typeof resposta === 'string' ? resposta : undefined) : []
    const prox = treino.etapas.find((x) => x.id !== etapa.id && (t.etapas[x.id] || {}).estado !== 'concluida')
    tocar(t, prox ? prox.id : etapa.id)
    recalcular(treino)
    salvar()
    const ultimo = termos[termos.length - 1] || null
    return {
      treinoId: treino.id,
      etapaId: etapa.id,
      nota: n,
      etapa: e,
      treino: t,
      resumo: resumo(treino),
      termos,
      proximaEtapa: prox ? prox.id : null,
      streak: ultimo ? ultimo.streak : null,
      hoje: ultimo ? ultimo.hoje : null,
      recompensa: t.estado === 'concluido' ? treino.recompensa : null,
    }
  }

  /**
   * Entrega de uma etapa. Devolve { status, corpo } (o index.js só repassa).
   * body: { resposta?, nota?, marcados?, acertos?, notas?, segundos? }
   * - desafio: mesma correção das práticas (corrigir/notaAutomatica/notaChecklist)
   * - cronometrado: `acertos` = ids das perguntas que acertou → nota proporcional; SM-2 4 (acertou) / 1 (errou)
   * - simulado: `notas` = { perguntaId: 0..5 } → média; SM-2 com a nota de cada pergunta
   * - mao-na-massa: `marcados` = índices do criterioPronto → nota proporcional
   * - ensinar/retrospectiva: `nota` 0..5 obrigatória
   * - aquecimento/leitura: só concluir (nota opcional)
   */
  function responderEtapa(treino, etapa, corpo = {}) {
    const ok = (c) => ({ status: 200, corpo: c })
    const erro = (msg, status = 400) => ({ status, corpo: { erro: msg } })
    const { resposta, nota, marcados, acertos, notas, segundos } = corpo || {}
    const notaManual = nota === undefined || nota === null || nota === '' ? null : Number(nota)
    if (notaManual != null && (!Number.isFinite(notaManual) || notaManual < 0 || notaManual > 5)) return erro('nota deve ser 0..5')
    const principal = etapa.termos[0] || null
    const estadoEtapa = daEtapa(treino.id, etapa.id)

    if (etapa.avaliacao === 'marcar') {
      return ok(concluirEtapa({ treino, etapa, nota: notaManual, auto: false, resposta, dados: null, avaliacoes: [] }))
    }

    if (etapa.avaliacao === 'exercicio') {
      const ex = etapa.corpo.exercicio
      const termoEx = ex.termos[0] || principal
      if (ex.auto && notaManual == null) {
        const r = corrigir(ex, resposta)
        if (!r.correto) {
          const { e } = abrirEtapa(treino.id, etapa.id)
          e.tentativasErradas += 1
          salvar()
          return ok({ correto: false, detalhe: r.detalhe || null, etapa: e, treinoId: treino.id, etapaId: etapa.id })
        }
        const n = notaAutomatica({ tentativasErradas: estadoEtapa.tentativasErradas || 0, dicasUsadas: estadoEtapa.dicasUsadas || 0, revelou: Boolean(estadoEtapa.revelou) })
        const out = concluirEtapa({ treino, etapa, nota: n, auto: true, resposta, dados: null, avaliacoes: termoEx ? [{ ...termoEx, nota: n }] : [] })
        return ok({ correto: true, ...out, solucao: ex.solucao, criterios: ex.criterios })
      }
      if (ex.entrega.tipo === 'checklist' && notaManual == null) {
        const idx = indices(marcados, ex.entrega.itens.length)
        const n = notaChecklist(idx.length, ex.entrega.itens.length)
        const out = concluirEtapa({ treino, etapa, nota: n, auto: true, resposta: JSON.stringify(idx), dados: { marcados: idx }, avaliacoes: termoEx ? [{ ...termoEx, nota: n }] : [] })
        return ok({ correto: true, marcados: idx, ...out, solucao: ex.solucao, criterios: ex.criterios })
      }
      if (notaManual == null) return erro('nota é obrigatória para este tipo de entrega')
      const n = nota05(notaManual)
      const out = concluirEtapa({ treino, etapa, nota: n, auto: false, resposta, dados: null, avaliacoes: termoEx ? [{ ...termoEx, nota: n }] : [] })
      return ok({ correto: true, ...out, solucao: ex.solucao, criterios: ex.criterios })
    }

    if (etapa.avaliacao === 'perguntas-acerto') {
      const perguntas = etapa.corpo.perguntas
      const certos = new Set((Array.isArray(acertos) ? acertos : []).map(String).filter((id) => perguntas.some((p) => p.id === id)))
      const n = notaChecklist(certos.size, perguntas.length)
      const avaliacoes = perguntas
        .filter((p) => p.termos.length)
        .map((p) => ({ ...p.termos[0], nota: certos.has(p.id) ? 4 : 1 }))
      const out = concluirEtapa({
        treino,
        etapa,
        nota: n,
        auto: true,
        resposta: texto(resposta),
        dados: { acertos: [...certos], total: perguntas.length, segundos: Number(segundos) || null },
        avaliacoes,
      })
      return ok({ correto: true, acertos: [...certos], total: perguntas.length, passou: certos.size >= etapa.corpo.acertosMin, ...out })
    }

    if (etapa.avaliacao === 'perguntas-nota') {
      const perguntas = etapa.corpo.perguntas
      const mapa = notas && typeof notas === 'object' ? notas : {}
      const dadas = perguntas.map((p) => ({ id: p.id, nota: mapa[p.id] == null ? null : nota05(mapa[p.id]), termos: p.termos }))
      const validas = dadas.filter((d) => d.nota != null)
      if (validas.length < perguntas.length) return erro(`falta a nota de ${perguntas.length - validas.length} pergunta(s)`)
      const n = Math.round(validas.reduce((a, d) => a + d.nota, 0) / validas.length)
      const avaliacoes = validas.filter((d) => d.termos.length).map((d) => ({ ...d.termos[0], nota: d.nota }))
      const out = concluirEtapa({
        treino,
        etapa,
        nota: n,
        auto: false,
        resposta: texto(resposta),
        dados: { notas: Object.fromEntries(validas.map((d) => [d.id, d.nota])) },
        avaliacoes,
      })
      return ok({ correto: true, ...out })
    }

    if (etapa.avaliacao === 'checklist') {
      const itens = etapa.corpo.criterioPronto
      const idx = indices(marcados, itens.length)
      const n = notaManual != null ? nota05(notaManual) : notaChecklist(idx.length, itens.length)
      const out = concluirEtapa({
        treino,
        etapa,
        nota: n,
        auto: notaManual == null,
        resposta: texto(resposta),
        dados: { marcados: idx, total: itens.length },
        avaliacoes: principal ? [{ ...principal, nota: n }] : [],
      })
      return ok({ correto: true, marcados: idx, ...out })
    }

    // auto-nota (ensinar, retrospectiva)
    if (notaManual == null) return erro('nota é obrigatória nesta etapa (0..5)')
    const n = nota05(notaManual)
    const avaliacoes = etapa.geraSM2 && principal ? [{ ...principal, nota: n }] : []
    const out = concluirEtapa({ treino, etapa, nota: n, auto: false, resposta, dados: null, avaliacoes })
    return ok({ correto: true, ...out })
  }

  function indices(lista, total) {
    return [...new Set((Array.isArray(lista) ? lista : []).map(Number).filter((i) => Number.isInteger(i) && i >= 0 && i < total))].sort((a, b) => a - b)
  }

  return {
    /** todos os treinos do progresso (objeto cru, para debug/migração) */
    todos() {
      return carregar().treinos
    },
    obter(treinoId) {
      return carregar().treinos[treinoId] || null
    },
    etapa(treinoId, etapaId) {
      const t = carregar().treinos[treinoId]
      return (t && t.etapas[etapaId]) || null
    },
    resumo,
    /** marca o treino como iniciado e aponta para a primeira etapa não concluída */
    iniciar(treino) {
      const t = doTreino(treino.id)
      const prox = treino.etapas.find((e) => (t.etapas[e.id] || {}).estado !== 'concluida') || treino.etapas[0]
      tocar(t, prox ? prox.id : null)
      salvar()
      return { treino: t, resumo: resumo(treino) }
    },
    /** abre uma etapa (idempotente): vira "em andamento" e passa a ser a etapa atual */
    abrirEtapa(treinoId, etapaId) {
      const { e } = abrirEtapa(treinoId, etapaId)
      salvar()
      return e
    },
    rascunho(treinoId, etapaId, txt) {
      const { e } = abrirEtapa(treinoId, etapaId)
      e.rascunho = String(txt || '').slice(0, 20000)
      salvar()
      return e
    },
    dica(treinoId, etapaId, n) {
      const { e } = abrirEtapa(treinoId, etapaId)
      if (n > e.dicasUsadas) e.dicasUsadas = n
      salvar()
      return e
    },
    revelar(treinoId, etapaId) {
      const { e } = abrirEtapa(treinoId, etapaId)
      if (e.estado !== 'concluida') e.revelou = true
      salvar()
      return e
    },
    tentativaErrada(treinoId, etapaId) {
      const { e } = abrirEtapa(treinoId, etapaId)
      e.tentativasErradas += 1
      salvar()
      return e
    },
    /** reabre uma etapa concluída (mantém histórico e melhorNota) */
    reabrirEtapa(treino, etapaId) {
      const { e } = abrirEtapa(treino.id, etapaId)
      e.estado = 'andamento'
      e.concluidaEm = null
      e.nota = null
      e.tentativasErradas = 0
      e.dicasUsadas = 0
      e.revelou = false
      recalcular(treino)
      salvar()
      return { etapa: e, resumo: resumo(treino) }
    },
    /** zera o treino inteiro (recomeçar a temporada) */
    reabrirTreino(treino) {
      const p = carregar()
      delete p.treinos[treino.id]
      salvar()
      return resumo(treino)
    },
    responderEtapa,
    recalcular,
    aguardarEscrita() {
      return filaEscrita
    },
  }
}
