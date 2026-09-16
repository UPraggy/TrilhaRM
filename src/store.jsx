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
  const [errosConteudo, setErrosConteudo] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(null)
  const [aviso, setAviso] = useState(null)
  const avisoTimer = useRef(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro(null)
    try {
      const [d, t, tr, p, pr] = await Promise.all([api.decks(), api.termos(), api.trilhas(), api.progresso(), api.praticas().catch(() => ({ praticas: [], erros: [] }))])
      setDecks(d.decks || [])
      setErrosConteudo([...(d.erros || []), ...(pr.erros || [])])
      setTermos(t.termos || [])
      setTrilhas(tr || { fases: [] })
      setProgresso({ praticas: {}, ...p })
      setPraticas(pr.praticas || [])
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
        Promise.all([api.decks(), api.termos(), api.trilhas(), api.praticas().catch(() => ({ praticas: [], erros: [] })), api.progresso()])
          .then(([d, t, tr, pr, p]) => {
            setDecks(d.decks || [])
            setErrosConteudo([...(d.erros || []), ...(pr.erros || [])])
            setTermos(t.termos || [])
            setTrilhas(tr || { fases: [] })
            setPraticas(pr.praticas || [])
            setProgresso({ praticas: {}, ...p })
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

  const valor = {
    decks,
    termos,
    trilhas,
    praticas,
    resumoPraticas,
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
