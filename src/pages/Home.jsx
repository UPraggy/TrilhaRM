import { Link } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { Barra, Carregando, Erro } from '../components/Comuns.jsx'
import { IcoGiro, IcoSeta } from '../components/Icones.jsx'
import { classeNivel, fmtNivel, MODOS } from '../lib/util.js'

function DeckCard({ deck, res }) {
  const media = res && res.vistos ? res.somaNivel / res.vistos : null
  const cobertura = res ? res.total - res.nuncaVistos : 0
  return (
    <Link to={`/deck/${deck.id}`} className="card card--link deck">
      <div className="deck__top">
        <div style={{ flex: 1 }}>
          <div className="deck__title">{deck.titulo}</div>
          {deck.descricao && <div className="deck__desc">{deck.descricao}</div>}
        </div>
        <div className={`deck__nivel ${classeNivel(media)}`} title="nível médio (0–5)">
          {fmtNivel(media)}
        </div>
      </div>
      <Barra valor={cobertura} max={deck.totalTermos} cor={media != null && media >= 3 ? 'green' : ''} />
      <div className="deck__meta" style={{ marginTop: 8 }}>
        <span className="chip">{deck.totalTermos} termos</span>
        {res && res.vencidos > 0 && <span className="chip chip--amber">{res.vencidos} p/ revisar</span>}
        {res && res.nuncaVistos > 0 && <span className="chip">{res.nuncaVistos} novos</span>}
        {res && res.total > 0 && (
          <span className="chip chip--peri">
            {Math.round((res.n3 / res.total) * 100)}% ≥3
          </span>
        )}
        {deck.exemplo && <span className="chip chip--rose">exemplo</span>}
      </div>
    </Link>
  )
}

export default function Home() {
  const { decks, trilhas, resumo, progresso, carregando, erro, carregar, errosConteudo, resumoPraticas } = useStore()
  if (carregando && !decks.length) return <Carregando />
  if (erro) return <Erro texto={erro} onRetry={carregar} />

  const s = progresso.streak || {}
  const hoje = progresso.historico.find((h) => h.dia === resumo.hoje) || null
  const vistosTotal = resumo.total - resumo.nuncaVistos

  return (
    <div>
      <div className="card card--2">
        <div className="row row--between">
          <div>
            <div className="eyebrow">Hoje</div>
            <h1 style={{ marginTop: 4 }}>
              {resumo.vencidos > 0 ? (
                <>
                  <span className="amber">{resumo.vencidos}</span> {resumo.vencidos === 1 ? 'termo' : 'termos'} para revisar
                </>
              ) : resumo.total === 0 ? (
                'Sem decks ainda'
              ) : (
                'Nada vencido hoje'
              )}
            </h1>
            <p className="muted small" style={{ marginTop: 6 }}>
              {resumo.total} termos em {decks.length} {decks.length === 1 ? 'deck' : 'decks'} · {vistosTotal} já vistos · {resumo.nuncaVistos} novos
            </p>
          </div>
        </div>
        <div className="stats" style={{ marginTop: 14 }}>
          <div className="stat">
            <div className="stat__v amber">{s.atual || 0}</div>
            <div className="stat__l">dias de ofensiva {s.melhor ? `(melhor ${s.melhor})` : ''}</div>
          </div>
          <div className="stat">
            <div className="stat__v">
              {hoje ? hoje.avaliacoes : 0}
              <span className="dim" style={{ fontSize: '0.9rem' }}>/{s.minimoDia || 10}</span>
            </div>
            <div className="stat__l">avaliações hoje</div>
          </div>
          <div className="stat">
            <div className="stat__v">{vistosTotal}</div>
            <div className="stat__l">termos já vistos</div>
          </div>
          <div className="stat">
            <div className="stat__v">{resumo.total ? Math.round((vistosTotal / resumo.total) * 100) : 0}%</div>
            <div className="stat__l">da trilha coberta</div>
          </div>
        </div>
        <div className="acoes">
          <Link to="/estudar/misto?fonte=revisao" className={`btn btn--lg ${resumo.vencidos ? 'btn--primary' : ''}`} aria-disabled={!resumo.vencidos}>
            <IcoGiro /> Revisar agora {resumo.vencidos ? `(${resumo.vencidos})` : ''}
          </Link>
          <Link to="/estudar/misto?fonte=tudo" className="btn btn--lg">
            Misturar tudo <IcoSeta />
          </Link>
        </div>
        {resumo.vencidos === 0 && resumo.nuncaVistos > 0 && (
          <p className="muted small" style={{ marginTop: 10 }}>
            Sem revisão pendente. "Misturar tudo" puxa primeiro os {resumo.nuncaVistos} termos novos.
          </p>
        )}
      </div>

      {resumoPraticas.geral.total > 0 && (
        <Link to="/praticas" className="card card--link" style={{ marginTop: 12, display: 'block' }}>
          <div className="row row--between">
            <div style={{ flex: 1 }}>
              <div className="eyebrow">§26 · Laboratório</div>
              <div className="deck__title" style={{ marginTop: 4 }}>
                Praticar fora do app
                {resumoPraticas.geral.andamento > 0 && <span className="chip chip--amber" style={{ marginLeft: 8 }}>{resumoPraticas.geral.andamento} em andamento</span>}
              </div>
              <div className="deck__desc">
                {resumoPraticas.geral.feitas}/{resumoPraticas.geral.total} exercícios feitos · terminal, psql, Docker, papel — e volte para registrar a resposta.
              </div>
              <Barra valor={resumoPraticas.geral.feitas} max={resumoPraticas.geral.total} cor="green" />
            </div>
            <IcoSeta />
          </div>
        </Link>
      )}

      {errosConteudo.length > 0 && (
        <div className="card aviso" style={{ marginTop: 12 }}>
          <b>Avisos de conteúdo</b> ({errosConteudo.length}):
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {errosConteudo.slice(0, 8).map((e, i) => (
              <li key={i}>
                <code>{e}</code>
              </li>
            ))}
          </ul>
        </div>
      )}

      {trilhas.fases.map((fase) => {
        const ds = fase.decks.map((id) => decks.find((d) => d.id === id)).filter(Boolean)
        if (!ds.length) return null
        let total = 0
        let n3 = 0
        for (const d of ds) {
          const r = resumo.porDeck[d.id]
          if (r) {
            total += r.total
            n3 += r.n3
          }
        }
        return (
          <section key={fase.numero} className="fase">
            <div className="fase__head">
              <span className="fase__num">F{fase.numero}</span>
              <h2 style={{ flex: '1 1 auto' }}>{fase.titulo}</h2>
              <div className="fase__bar">
                <Barra valor={n3} max={total} cor="peri" />
              </div>
              <span className="dim small mono">{total ? Math.round((n3 / total) * 100) : 0}%</span>
            </div>
            {fase.descricao && <p className="muted small">{fase.descricao}</p>}
            <div className="grid grid--2">
              {ds.map((d) => (
                <DeckCard key={d.id} deck={d} res={resumo.porDeck[d.id]} />
              ))}
            </div>
          </section>
        )
      })}

      {decks.length === 0 && (
        <div className="vazio">
          Nenhum deck em <code>content/decks/</code>. Solte um JSON lá e recarregue.
        </div>
      )}

      <section className="section">
        <div className="section__head">
          <span className="section__num">§</span>
          <h2>Modos de estudo</h2>
          <span className="dim small">(todos os decks)</span>
        </div>
        <div className="modos">
          {MODOS.map((m, i) => (
            <Link key={m.id} to={`/estudar/${m.id}?fonte=tudo`} className="modo">
              <span className="modo__num">{String(i + 1).padStart(2, '0')}</span>
              <span className="modo__nome">{m.nome}</span>
              <span className="modo__desc">{m.desc}</span>
            </Link>
          ))}
          <Link to="/praticas" className="modo">
            <span className="modo__num">{String(MODOS.length + 1).padStart(2, '0')}</span>
            <span className="modo__nome">Praticar</span>
            <span className="modo__desc">Exercício real fora do app. Volte e registre: o app corrige ou você se avalia.</span>
          </Link>
        </div>
      </section>
    </div>
  )
}
