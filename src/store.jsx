// Estado global simples (contexto): decks, termos, trilhas, progresso + ações.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { api } from './api.js'
import { chaveTermo, hojeISO } from './lib/util.js'

const Ctx = createContext(null)

export function StoreProvider({ children }) {
  const [decks, setDecks] = useState([])
  const [termos, setTermos] = useState([])
  const [trilhas, setTrilhas] = useState({ fases: [], origem: 'auto' })
  const [progresso, setProgresso] = useState({ termos: {}, praticas: {}, streak: { atual: 0, melhor: 0 }, historico: [] })
  const [praticas, setPraticas] = useState([])
  // null = ainda carregando (a Home mostra esqueleto); [] = carregou e não tem nada
  const [cursos, setCursos] = useState(null)
  const [treinos, setTreinos] = useState(null)
  const [errosConteudo, setErrosConteudo] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(null)
  const [aviso, setAviso] = useState(null)
  const avisoTimer = useRef(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro(null)
    try {
      const [d, t, tr, p, pr, cs, ts] = await Promise.all([
        api.decks(),
        api.termos(),
        api.trilhas(),
        api.progresso(),
        api.praticas().catch(() => ({ praticas: [], erros: [] })),
        api.cursos().catch(() => ({ cursos: [], erros: [] })),
        api.treinos().catch(() => ({ treinos: [], erros: [] })),
      ])
      setDecks(d.decks || [])
      setErrosConteudo([...(d.erros || []), ...(pr.erros || []), ...(cs.erros || []), ...(ts.erros || [])])
      setTermos(t.termos || [])
      setTrilhas(tr || { fases: [] })
      setProgresso({ praticas: {}, cursos: {}, ...p })
      setPraticas(pr.praticas || [])
      setCursos(cs.cursos || [])
      setTreinos(ts.treinos || [])
    } catch (e) {
      setErro(e.message || 'falha ao carregar')
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  // recarrega conteúdo quando a aba volta ao foco (decks novos soltos na pasta)
  useEffect(() => {
    const onFoco = () => {
      if (document.visibilityState === 'visible') {
        Promise.all([
          api.decks(),
          api.termos(),
          api.trilhas(),
          api.praticas().catch(() => ({ praticas: [], erros: [] })),
          api.progresso(),
          api.cursos().catch(() => ({ cursos: [], erros: [] })),
          api.treinos().catch(() => ({ treinos: [], erros: [] })),
        ])
          .then(([d, t, tr, pr, p, cs, ts]) => {
            setDecks(d.decks || [])
            setErrosConteudo([...(d.erros || []), ...(pr.erros || []), ...(cs.erros || []), ...(ts.erros || [])])
            setTermos(t.termos || [])
            setTrilhas(tr || { fases: [] })
            setPraticas(pr.praticas || [])
            setProgresso({ praticas: {}, cursos: {}, ...p })
            setCursos(cs.cursos || [])
            setTreinos(ts.treinos || [])
          })
          .catch(() => {})
      }
    }
    document.addEventListener('visibilitychange', onFoco)
    return () => document.removeEventListener('visibilitychange', onFoco)
  }, [])

  const mostrarAviso = useCallback((texto, ms = 2200) => {
    setAviso(texto)
    clearTimeout(avisoTimer.current)
    avisoTimer.current = setTimeout(() => setAviso(null), ms)
  }, [])

  const avaliar = useCallback(
    async ({ deckId, termoId, nota, modo, resposta }) => {
      try {
        const r = await api.avaliar({ deckId, termoId, nota, modo, resposta })
        setProgresso((p) => {
          const hoje = hojeISO()
          const historico = p.historico.some((h) => h.dia === hoje)
            ? p.historico.map((h) => (h.dia === hoje ? r.hoje : h))
            : [...p.historico, r.hoje]
          return { ...p, termos: { ...p.termos, [r.chave]: r.termo }, streak: r.streak, historico }
        })
        return r
      } catch (e) {
        mostrarAviso(`Não gravou: ${e.message}`, 4000)
        throw e
      }
    },
    [mostrarAviso],
  )

  /** atualiza o estado local de uma prática (sem ir à API) */
  const atualizarPratica = useCallback((chave, estado) => {
    if (!estado) return
    setProgresso((p) => ({ ...p, praticas: { ...(p.praticas || {}), [chave]: estado } }))
  }, [])

  /** aplica o retorno de POST /responder: prática + termo SM-2 + ofensiva + histórico do dia */
  const aplicarConclusaoPratica = useCallback((r) => {
    if (!r || !r.chave) return
    setProgresso((p) => {
      const hoje = hojeISO()
      const historico = r.hoje
        ? p.historico.some((h) => h.dia === hoje)
          ? p.historico.map((h) => (h.dia === hoje ? r.hoje : h))
          : [...p.historico, r.hoje]
        : p.historico
      const termos = r.termo ? { ...p.termos, [r.termo.chave]: r.termo.estado } : p.termos
      return { ...p, termos, praticas: { ...(p.praticas || {}), [r.chave]: r.pratica }, streak: r.streak || p.streak, historico }
    })
  }, [])

  const resetar = useCallback(async () => {
    const r = await api.reset()
    setProgresso(r.progresso)
    mostrarAviso('Progresso zerado.')
  }, [mostrarAviso])

  const estadoDe = useCallback((t) => progresso.termos[chaveTermo(t)] || null, [progresso])

  const hoje = hojeISO()
  const resumo = useMemo(() => {
    let vencidos = 0
    let nuncaVistos = 0
    const porDeck = {}
    for (const t of termos) {
      const est = progresso.termos[chaveTermo(t)]
      const pd = (porDeck[t.deckId] ||= { vencidos: 0, nuncaVistos: 0, total: 0, somaNivel: 0, vistos: 0, n3: 0, n4: 0 })
      pd.total += 1
      if (!est) {
        nuncaVistos += 1
        pd.nuncaVistos += 1
        continue
      }
      pd.vistos += 1
      pd.somaNivel += est.nivel
      if (est.nivel >= 3) pd.n3 += 1
      if (est.nivel >= 4) pd.n4 += 1
      if (!est.proximaRevisao || est.proximaRevisao <= hoje) {
        vencidos += 1
        pd.vencidos += 1
      }
    }
    return { vencidos, nuncaVistos, total: termos.length, porDeck, hoje }
  }, [termos, progresso, hoje])

  // resumo das práticas: por deck e geral
  const resumoPraticas = useMemo(() => {
    const est = progresso.praticas || {}
    const porDeck = {}
    const geral = { total: 0, feitas: 0, andamento: 0, somaNota: 0 }
    for (const p of praticas) {
      const r = (porDeck[p.deckId] = { total: 0, feitas: 0, andamento: 0, somaNota: 0 })
      for (const ex of p.exercicios) {
        const s = est[`${p.deckId}/${ex.id}`]
        r.total += 1
        if (s && s.estado === 'concluida') {
          r.feitas += 1
          r.somaNota += s.ultimaNota || 0
        } else if (s && s.estado === 'andamento') r.andamento += 1
      }
      for (const k of Object.keys(geral)) geral[k] += r[k]
    }
    return { porDeck, geral }
  }, [praticas, progresso])

  // resumo dos cursos (aulas em Markdown) — null enquanto carrega
  const resumoCursos = useMemo(() => {
    if (!cursos) return null
    const g = { total: cursos.length, licoes: 0, feitas: 0, atividades: 0, emAndamento: 0 }
    for (const c of cursos) {
      g.licoes += c.totalLicoes || 0
      g.feitas += (c.progresso && c.progresso.concluidas) || 0
      g.atividades += c.totalAtividades || 0
      if (c.progresso && c.progresso.concluidas > 0 && c.progresso.pct < 100) g.emAndamento += 1
    }
    return g
  }, [cursos])

  // resumo dos treinos especiais (temporadas) — null enquanto carrega
  const resumoTreinos = useMemo(() => {
    if (!treinos) return null
    const g = { total: treinos.length, concluidos: 0, andamento: 0, etapas: 0, etapasFeitas: 0 }
    for (const t of treinos) {
      const p = t.progresso || {}
      if (p.estado === 'concluido') g.concluidos += 1
      else if (p.estado === 'andamento') g.andamento += 1
      g.etapas += p.total || t.etapas || 0
      g.etapasFeitas += p.concluidas || 0
    }
    return g
  }, [treinos])

  /**
   * Fase atual = a primeira que ainda não passou de 70% dos termos em nível ≥ 3
   * (o checkpoint do plano 19 §7). Se todas passaram, é a última.
   */
  const faseAtual = useMemo(() => {
    const fases = trilhas.fases || []
    if (!fases.length) return null
    for (const f of fases) {
      let total = 0
      let n3 = 0
      for (const id of f.decks) {
        const r = resumo.porDeck[id]
        if (!r) continue
        total += r.total
        n3 += r.n3
      }
      if (!total || n3 / total < 0.7) return f.numero
    }
    return fases[fases.length - 1].numero
  }, [trilhas, resumo])

  const valor = {
    decks,
    termos,
    trilhas,
    praticas,
    cursos,
    treinos,
    resumoPraticas,
    resumoCursos,
    resumoTreinos,
    faseAtual,
    atualizarPratica,
    aplicarConclusaoPratica,
    progresso,
    errosConteudo,
    carregando,
    erro,
    aviso,
    hoje,
    resumo,
    carregar,
    avaliar,
    resetar,
    estadoDe,
    mostrarAviso,
  }
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

export function useStore() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useStore fora do StoreProvider')
  return v
}
