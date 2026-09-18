import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { Barra, Carregando, EstadoTermo } from '../components/Comuns.jsx'
import { IcoGiro } from '../components/Icones.jsx'
import { classeNivel, fmtDataCurta, fmtNivel, MODOS_LIVRES, diasAte, nomeAmbiente, statusPratica } from '../lib/util.js'

export default function DeckPage() {
  const { id } = useParams()
  const { decks, termos, resumo, estadoDe, carregando, praticas, resumoPraticas, progresso } = useStore()
  const [mostrarTermos, setMostrarTermos] = useState(false)
  const deck = decks.find((d) => d.id === id)
  const lista = termos.filter((t) => t.deckId === id)
  const praticaDeck = praticas.find((p) => p.deckId === id) || null
  const rp = resumoPraticas.porDeck[id] || { total: 0, feitas: 0 }
  if (carregando && !decks.length) return <Carregando />
  if (!deck)
    return (
      <div className="vazio">
        Deck <code>{id}</code> não encontrado. <Link to="/">Voltar</Link>
      </div>
    )
  const r = resumo.porDeck[id] || { total: 0, vistos: 0, somaNivel: 0, n3: 0, n4: 0, nuncaVistos: 0, vencidos: 0 }
  const media = r.vistos ? r.somaNivel / r.vistos : null
  const fonte = `deck:${id}`

  return (
    <div>
      <div className="eyebrow">
        <Link to="/" className="muted">
          Início
        </Link>{' '}
        / Fase {deck.fase} {deck.trilha ? `· ${deck.trilha}` : ''}
      </div>
      <h1 style={{ marginTop: 6 }}>{deck.titulo}</h1>
      {deck.descricao && <p className="muted" style={{ marginTop: 6 }}>{deck.descricao}</p>}

      <div className="card card--2" style={{ marginTop: 14 }}>
        <div className="stats">
          <div className="stat">
            <div className={`stat__v ${classeNivel(media)}`}>{fmtNivel(media)}</div>
            <div className="stat__l">nível médio</div>
          </div>
          <div className="stat">
            <div className="stat__v">{r.total ? Math.round((r.n3 / r.total) * 100) : 0}%</div>
            <div className="stat__l">termos ≥ 3 (aplico)</div>
          </div>
          <div className="stat">
            <div className="stat__v amber">{r.vencidos}</div>
            <div className="stat__l">para revisar hoje</div>
          </div>
          <div className="stat">
            <div className="stat__v">{r.nuncaVistos}</div>
            <div className="stat__l">nunca vistos</div>
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <Barra valor={r.total - r.nuncaVistos} max={r.total} grande cor={media != null && media >= 3 ? 'green' : ''} />
        </div>
        <div className="acoes">
          <Link to={`/estudar/misto?fonte=${fonte}&so=vencidos`} className={`btn btn--lg ${r.vencidos ? 'btn--primary' : ''}`}>
            <IcoGiro /> Revisar vencidos {r.vencidos ? `(${r.vencidos})` : ''}
          </Link>
          <Link to={`/estudar/flashcards?fonte=${fonte}`} className="btn btn--lg">
            Estudar o deck todo
          </Link>
        </div>
      </div>

      <section className="section">
        <div className="section__head">
          <span className="section__num">§</span>
          <h2>Modos</h2>
        </div>
        <div className="modos">
          {MODOS_LIVRES.map((m, i) => (
            <Link key={m.id} to={`/estudar/${m.id}?fonte=${fonte}`} className="modo">
              <span className="modo__num">{String(i + 1).padStart(2, '0')}</span>
              <span className="modo__nome">{m.nome}</span>
              <span className="modo__desc">{m.desc}</span>
            </Link>
          ))}
          {praticaDeck && (
            <Link to={`/praticas?deck=${id}`} className="modo">
              <span className="modo__num">{String(MODOS_LIVRES.length + 1).padStart(2, '0')}</span>
              <span className="modo__nome">Praticar</span>
              <span className="modo__desc">
                {praticaDeck.exercicios.length} exercícios reais fora do app · {rp.feitas} feitos.
              </span>
            </Link>
          )}
        </div>
      </section>

      {praticaDeck && (
        <section className="section">
          <div className="section__head">
            <span className="section__num">§</span>
            <h2>Práticas ({praticaDeck.exercicios.length})</h2>
            <span className="dim small mono" style={{ marginLeft: 'auto' }}>
              {rp.feitas}/{rp.total} feitas
            </span>
          </div>
          <p className="muted small" style={{ marginTop: -4 }}>
            Exercícios reais para resolver fora do app e registrar aqui. A nota vira revisão no termo principal.
          </p>
          <div className="card" style={{ padding: 0 }}>
            {praticaDeck.exercicios.map((ex) => {
              const st = statusPratica((progresso.praticas || {})[`${id}/${ex.id}`])
              return (
                <Link key={ex.id} to={`/pratica/${id}/${ex.id}`} className="ex">
                  <span className={`ex__nivel ${classeNivel(ex.nivel)}`}>{ex.nivel}</span>
                  <span className="ex__corpo">
                    <span className="ex__titulo">
                      {ex.titulo}
                      {ex.postmortem && <span className="chip chip--rose">failure lab</span>}
                    </span>
                    <span className="ex__meta dim small">
                      {nomeAmbiente(ex.ambiente)} · ~{ex.tempoMin} min · {ex.termos.map((t) => t.termo).join(', ')}
                    </span>
                  </span>
                  <span className={`chip ${st.classe} ${st.id === 'concluida' ? 'mono' : ''}`}>{st.rotulo}</span>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      <section className="section">
        <div className="section__head">
          <span className="section__num">§</span>
          <h2>Termos ({lista.length})</h2>
          <button className="btn btn--sm btn--ghost" style={{ marginLeft: 'auto' }} onClick={() => setMostrarTermos((v) => !v)}>
            {mostrarTermos ? 'Ocultar' : 'Mostrar'}
          </button>
        </div>
        {mostrarTermos && (
          <div className="card" style={{ padding: 0 }}>
            {lista.map((t, i) => {
              const e = estadoDe(t)
              const d = e ? diasAte(e.proximaRevisao) : null
              return (
                <div
                  key={t.id}
                  className="row row--between"
                  style={{ padding: '10px 14px', borderTop: i ? '1px solid var(--line)' : 0, flexWrap: 'nowrap' }}
                >
                  <div style={{ minWidth: 0 }}>
                    <Link to={`/glossario?q=${encodeURIComponent(t.termo)}`} style={{ color: 'var(--bone)', fontWeight: 500 }}>
                      {t.termo}
                    </Link>
                    {t.termoEN && t.termoEN !== t.termo && <span className="peri small"> · {t.termoEN}</span>}
                    <div className="dim small">
                      {e
                        ? `${e.vistos} vistos · ${e.acertos} acertos · próx. ${fmtDataCurta(e.proximaRevisao)}${d != null && d <= 0 ? ' (vencido)' : ''}`
                        : 'nunca visto'}
                    </div>
                  </div>
                  <EstadoTermo termo={t} />
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
