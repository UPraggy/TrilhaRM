import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { Barra, Carregando } from '../components/Comuns.jsx'
import { AMBIENTES, TIPOS_ENTREGA, classeNivel, fmtNivel, nomeAmbiente, statusPratica } from '../lib/util.js'

const FILTROS_STATUS = [
  { id: 'todas', nome: 'Todas' },
  { id: 'nova', nome: 'Novas' },
  { id: 'andamento', nome: 'Em andamento' },
  { id: 'concluida', nome: 'Feitas' },
]

/**
 * /praticas?deck=ID  — lista de exercícios práticos por fase/deck, com status e filtros.
 * O exercício em si é resolvido fora do app (terminal, psql, papel…) e registrado em /pratica/:deckId/:exId.
 */
export default function Praticas() {
  const { praticas, trilhas, decks, progresso, resumoPraticas, carregando } = useStore()
  const [params, setParams] = useSearchParams()
  const [status, setStatus] = useState('todas')
  const [ambiente, setAmbiente] = useState('')
  const deckFiltro = params.get('deck') || ''

  const est = progresso.praticas || {}
  const g = resumoPraticas.geral

  const ambientesUsados = useMemo(() => {
    const s = new Set()
    for (const p of praticas) for (const ex of p.exercicios) s.add(ex.ambiente)
    return [...s].sort()
  }, [praticas])

  // próxima sugerida: em andamento primeiro, depois a primeira nova da fase mais baixa
  const proxima = useMemo(() => {
    let andamento = null
    let nova = null
    for (const p of praticas) {
      for (const ex of p.exercicios) {
        const s = est[`${p.deckId}/${ex.id}`]
        if (s && s.estado === 'andamento' && !andamento) andamento = { p, ex }
        if ((!s || s.estado === 'nova') && !nova) nova = { p, ex }
      }
    }
    return andamento || nova
  }, [praticas, est])

  if (carregando && !praticas.length) return <Carregando />

  const grupos = trilhas.fases
    .map((fase) => ({
      fase,
      itens: fase.decks
        .map((id) => praticas.find((p) => p.deckId === id))
        .filter(Boolean)
        .filter((p) => !deckFiltro || p.deckId === deckFiltro),
    }))
    .filter((gp) => gp.itens.length)
  // arquivos de prática cujo deck não está em nenhuma fase declarada
  const emFases = new Set(trilhas.fases.flatMap((f) => f.decks))
  const soltos = praticas.filter((p) => !emFases.has(p.deckId) && (!deckFiltro || p.deckId === deckFiltro))
  if (soltos.length) grupos.push({ fase: { numero: '·', titulo: 'Outros' }, itens: soltos })

  const passaFiltro = (p, ex) => {
    const st = statusPratica(est[`${p.deckId}/${ex.id}`]).id
    if (status !== 'todas' && st !== status) return false
    if (ambiente && ex.ambiente !== ambiente) return false
    return true
  }

  return (
    <div>
      <div className="eyebrow">§26 · Laboratório</div>
      <h1 style={{ marginTop: 6 }}>Praticar</h1>
      <p className="muted small" style={{ marginTop: 6 }}>
        Exercício real, resolvido <b>fora do app</b> (terminal, psql, Docker, papel). Volte aqui e registre a resposta: saída, número ou escolha o servidor corrige;
        texto e código você se avalia e pode pedir a opinião do mentor. A nota vira revisão SM-2 no termo principal.
      </p>

      <div className="card card--2" style={{ marginTop: 12 }}>
        <div className="stats">
          <div className="stat">
            <div className="stat__v green">{g.feitas}</div>
            <div className="stat__l">feitas de {g.total}</div>
          </div>
          <div className="stat">
            <div className="stat__v amber">{g.andamento}</div>
            <div className="stat__l">em andamento</div>
          </div>
          <div className="stat">
            <div className={`stat__v ${classeNivel(g.feitas ? g.somaNota / g.feitas : null)}`}>{fmtNivel(g.feitas ? g.somaNota / g.feitas : null)}</div>
            <div className="stat__l">nota média</div>
          </div>
          <div className="stat">
            <div className="stat__v">{g.total ? Math.round((g.feitas / g.total) * 100) : 0}%</div>
            <div className="stat__l">do laboratório</div>
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <Barra valor={g.feitas} max={g.total} grande cor="green" />
        </div>
        {proxima && (
          <div className="acoes">
            <Link to={`/pratica/${proxima.p.deckId}/${proxima.ex.id}`} className="btn btn--lg btn--primary">
              {est[`${proxima.p.deckId}/${proxima.ex.id}`]?.estado === 'andamento' ? 'Continuar' : 'Próxima'} · {proxima.ex.titulo}
            </Link>
          </div>
        )}
      </div>

      <div className="filtros" style={{ marginTop: 14 }}>
        <span className="toggle" role="group" aria-label="Status">
          {FILTROS_STATUS.map((f) => (
            <button key={f.id} className={status === f.id ? 'active' : ''} onClick={() => setStatus(f.id)}>
              {f.nome}
            </button>
          ))}
        </span>
        <select className="input input--sm" value={ambiente} onChange={(e) => setAmbiente(e.target.value)} aria-label="Ambiente">
          <option value="">Todo ambiente</option>
          {ambientesUsados.map((a) => (
            <option key={a} value={a}>
              {nomeAmbiente(a)}
            </option>
          ))}
        </select>
        <select
          className="input input--sm"
          value={deckFiltro}
          onChange={(e) => setParams(e.target.value ? { deck: e.target.value } : {})}
          aria-label="Deck"
        >
          <option value="">Todos os decks</option>
          {decks
            .filter((d) => praticas.some((p) => p.deckId === d.id))
            .map((d) => (
              <option key={d.id} value={d.id}>
                F{d.fase} · {d.titulo}
              </option>
            ))}
        </select>
      </div>

      {grupos.map(({ fase, itens }) => (
        <section key={fase.numero} className="fase">
          <div className="fase__head">
            <span className="fase__num">F{fase.numero}</span>
            <h2 style={{ flex: '1 1 auto' }}>{fase.titulo}</h2>
          </div>
          {itens.map((p) => {
            const r = resumoPraticas.porDeck[p.deckId] || { total: 0, feitas: 0 }
            const exs = p.exercicios.filter((ex) => passaFiltro(p, ex))
            if (!exs.length) return null
            return (
              <div key={p.deckId} className="card" style={{ padding: 0 }}>
                <div className="row row--between" style={{ padding: '12px 14px' }}>
                  <Link to={`/deck/${p.deckId}`} style={{ fontWeight: 700, color: 'var(--bone)' }}>
                    {p.deckTitulo}
                  </Link>
                  <span className="dim small mono">
                    {r.feitas}/{r.total}
                  </span>
                </div>
                {exs.map((ex) => {
                  const s = est[`${p.deckId}/${ex.id}`]
                  const st = statusPratica(s)
                  return (
                    <Link key={ex.id} to={`/pratica/${p.deckId}/${ex.id}`} className="ex">
                      <span className={`ex__nivel ${classeNivel(ex.nivel)}`} title={`nível ${ex.nivel}`}>
                        {ex.nivel}
                      </span>
                      <span className="ex__corpo">
                        <span className="ex__titulo">
                          {ex.titulo}
                          {ex.postmortem && <span className="chip chip--rose">failure lab</span>}
                        </span>
                        <span className="ex__meta dim small">
                          {nomeAmbiente(ex.ambiente)} · {(TIPOS_ENTREGA[ex.entrega.tipo] || {}).curto || ex.entrega.tipo} · ~{ex.tempoMin} min
                          {ex.termos.length ? ` · ${ex.termos.map((t) => t.termo).join(', ')}` : ''}
                        </span>
                      </span>
                      <span className={`chip ${st.classe} ${st.id === 'concluida' ? 'mono' : ''}`}>{st.rotulo}</span>
                    </Link>
                  )
                })}
              </div>
            )
          })}
        </section>
      ))}

      {praticas.length === 0 && (
        <div className="vazio">
          Nenhum exercício em <code>content/praticas/</code>. Veja o README da pasta para o formato.
        </div>
      )}

      <p className="dim small" style={{ marginTop: 16 }}>
        Ambientes: {Object.entries(AMBIENTES).map(([k, v]) => `${v.nome} (${v.desc})`).join(' · ')}.
      </p>
    </div>
  )
}
