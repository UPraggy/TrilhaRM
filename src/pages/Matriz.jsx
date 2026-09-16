import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { Barra, Confirmar } from '../components/Comuns.jsx'
import { LegendaNiveis } from '../components/Nivel.jsx'
import { classeNivel, fmtNivel, hojeISO } from '../lib/util.js'

function ultimosDias(historico, n = 28) {
  const mapa = new Map(historico.map((h) => [h.dia, h.avaliacoes]))
  const dias = []
  const hoje = new Date(`${hojeISO()}T12:00:00`)
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(hoje)
    d.setDate(d.getDate() - i)
    const iso = hojeISO(d)
    dias.push({ dia: iso, n: mapa.get(iso) || 0 })
  }
  return dias
}

export default function Matriz() {
  const { decks, trilhas, resumo, progresso, resetar } = useStore()
  const [confirmando, setConfirmando] = useState(false)
  const s = progresso.streak || {}
  const dias = ultimosDias(progresso.historico)
  const maxDia = Math.max(10, ...dias.map((d) => d.n))

  const linhas = []
  for (const fase of trilhas.fases) {
    const ds = fase.decks.map((id) => decks.find((d) => d.id === id)).filter(Boolean)
    if (!ds.length) continue
    const agg = { total: 0, vistos: 0, somaNivel: 0, n3: 0, n4: 0, nuncaVistos: 0, vencidos: 0 }
    const filhos = ds.map((d) => {
      const r = resumo.porDeck[d.id] || { total: 0, vistos: 0, somaNivel: 0, n3: 0, n4: 0, nuncaVistos: 0, vencidos: 0 }
      for (const k of Object.keys(agg)) agg[k] += r[k]
      return { deck: d, r }
    })
    linhas.push({ fase, agg, filhos })
  }

  const geral = { total: 0, vistos: 0, somaNivel: 0, n3: 0, n4: 0, nuncaVistos: 0, vencidos: 0 }
  for (const l of linhas) for (const k of Object.keys(geral)) geral[k] += l.agg[k]

  const Celulas = ({ r }) => {
    const media = r.vistos ? r.somaNivel / r.vistos : null
    return (
      <>
        <td className={`mono ${classeNivel(media)}`}>{fmtNivel(media)}</td>
        <td className="mono">
          {r.total ? Math.round((r.n3 / r.total) * 100) : 0}%
          <span className="mini">
            <i style={{ width: `${r.total ? (r.n3 / r.total) * 100 : 0}%` }} />
          </span>
        </td>
        <td className="mono">
          {r.total ? Math.round((r.n4 / r.total) * 100) : 0}%
          <span className="mini">
            <i style={{ width: `${r.total ? (r.n4 / r.total) * 100 : 0}%`, background: 'var(--green)' }} />
          </span>
        </td>
        <td className="mono">{r.nuncaVistos}</td>
        <td className={`mono ${r.vencidos ? 'amber' : ''}`}>{r.vencidos}</td>
        <td className="mono dim">{r.total}</td>
      </>
    )
  }

  return (
    <div>
      <div className="eyebrow">§29 · Avaliação contínua</div>
      <h1 style={{ marginTop: 6 }}>Matriz de nível</h1>
      <p className="muted small" style={{ marginTop: 6 }}>
        Deck × nível médio, % de termos em nível ≥3 (aplico) e ≥4 (diagnostico), nunca vistos e vencidos hoje.
      </p>

      <div className="card card--2" style={{ marginTop: 12 }}>
        <div className="stats">
          <div className="stat">
            <div className="stat__v amber">{s.atual || 0}</div>
            <div className="stat__l">ofensiva atual (dias)</div>
          </div>
          <div className="stat">
            <div className="stat__v">{s.melhor || 0}</div>
            <div className="stat__l">melhor ofensiva</div>
          </div>
          <div className="stat">
            <div className="stat__v">{s.avaliacoesHoje || 0}</div>
            <div className="stat__l">avaliações hoje (mín. {s.minimoDia || 10})</div>
          </div>
          <div className="stat">
            <div className="stat__v">{progresso.historico.reduce((a, h) => a + h.avaliacoes, 0)}</div>
            <div className="stat__l">avaliações no total</div>
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <div className="row row--between small dim" style={{ marginBottom: 4 }}>
            <span>últimos 28 dias</span>
            <span>barra cheia = dia contou (≥ {s.minimoDia || 10})</span>
          </div>
          <div className="hist" aria-label="avaliações por dia nos últimos 28 dias">
            {dias.map((d) => (
              <i
                key={d.dia}
                className={`${d.n >= (s.minimoDia || 10) ? 'ok' : ''} ${d.dia === resumo.hoje ? 'hoje' : ''}`}
                style={{ height: `${Math.max(6, (d.n / maxDia) * 100)}%` }}
                title={`${d.dia}: ${d.n}`}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="section">
        {linhas.map(({ fase, agg }) => (
          <div key={fase.numero} className="row" style={{ marginBottom: 8 }}>
            <span className="fase__num" style={{ minWidth: 28 }}>
              F{fase.numero}
            </span>
            <span style={{ flex: '0 1 220px', fontWeight: 500 }}>{fase.titulo}</span>
            <div style={{ flex: '1 1 120px' }}>
              <Barra valor={agg.n3} max={agg.total} cor="peri" />
            </div>
            <span className="mono small dim" style={{ minWidth: 44, textAlign: 'right' }}>
              {agg.total ? Math.round((agg.n3 / agg.total) * 100) : 0}%
            </span>
          </div>
        ))}
      </div>

      <div className="tabela-wrap section">
        <table className="matriz">
          <thead>
            <tr>
              <th>Deck</th>
              <th title="nível médio dos termos já vistos">Nível médio</th>
              <th title="% dos termos com nível ≥ 3">≥ 3</th>
              <th title="% dos termos com nível ≥ 4">≥ 4</th>
              <th>Nunca vistos</th>
              <th>Vencidos</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map(({ fase, agg, filhos }) => (
              <FaseLinhas key={fase.numero} fase={fase} agg={agg} filhos={filhos} Celulas={Celulas} />
            ))}
            {linhas.length > 0 && (
              <tr style={{ fontWeight: 700 }}>
                <td>Total</td>
                <Celulas r={geral} />
              </tr>
            )}
            {linhas.length === 0 && (
              <tr>
                <td colSpan={7} className="dim" style={{ textAlign: 'center' }}>
                  Sem decks.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <LegendaNiveis />

      <div className="section card">
        <h3>Zerar progresso</h3>
        <p className="muted small" style={{ marginTop: 4 }}>
          Apaga níveis, revisões, respostas do modo Explique e a ofensiva. Os decks continuam.
        </p>
        <button className="btn btn--danger" onClick={() => setConfirmando(true)}>
          Zerar tudo
        </button>
      </div>
      {confirmando && (
        <Confirmar
          titulo="Zerar todo o progresso?"
          texto="Não tem volta. O arquivo data/progresso.json será reescrito vazio."
          confirmar="Sim, zerar"
          perigo
          onNao={() => setConfirmando(false)}
          onSim={async () => {
            setConfirmando(false)
            await resetar()
          }}
        />
      )}
    </div>
  )
}

function FaseLinhas({ fase, agg, filhos, Celulas }) {
  return (
    <>
      <tr className="fase-row">
        <td>
          F{fase.numero} · {fase.titulo}
        </td>
        <Celulas r={agg} />
      </tr>
      {filhos.map(({ deck, r }) => (
        <tr key={deck.id}>
          <td>
            <Link to={`/deck/${deck.id}`}>{deck.titulo}</Link>
          </td>
          <Celulas r={r} />
        </tr>
      ))}
    </>
  )
}
