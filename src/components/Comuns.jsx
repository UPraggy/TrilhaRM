import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { classeNivel, fmtNivel } from '../lib/util.js'

export function Barra({ valor, max = 100, cor = '', grande = false }) {
  const p = max ? Math.min(100, Math.round((valor / max) * 100)) : 0
  return (
    <div className={`bar ${grande ? 'bar--lg' : ''}`} role="progressbar" aria-valuenow={p} aria-valuemin={0} aria-valuemax={100}>
      <i className={cor} style={{ width: `${p}%` }} />
    </div>
  )
}

export function Contexto({ termo, extra }) {
  return (
    <div className="ctx">
      <Link to={`/deck/${termo.deckId}`} className="chip chip--peri">
        {termo.deckTitulo || termo.deckId}
      </Link>
      {termo.tags &&
        termo.tags.slice(0, 3).map((t) => (
          <span key={t} className="chip">
            {t}
          </span>
        ))}
      {extra}
    </div>
  )
}

export function EstadoTermo({ termo }) {
  const { estadoDe } = useStore()
  const e = estadoDe(termo)
  if (!e) return <span className="chip">novo</span>
  return (
    <span className={`chip mono ${classeNivel(e.nivel)}`} title={`nível ${fmtNivel(e.nivel)} · ${e.vistos} vistos`}>
      nv {fmtNivel(e.nivel)}
    </span>
  )
}

export function Bloco({ label, children, pre }) {
  if (!children) return null
  return (
    <div className="bloco">
      <div className="bloco__label">{label}</div>
      {pre ? <pre>{children}</pre> : typeof children === 'string' ? <p>{children}</p> : <div className="bloco__corpo">{children}</div>}
    </div>
  )
}

/**
 * Renderiza texto simples com blocos ``` como <pre> e parágrafos separados por linha em branco.
 * Sem markdown completo de propósito: `code` inline vira <code>.
 */
export function Texto({ children, className = '' }) {
  const src = String(children || '')
  if (!src.trim()) return null
  const partes = src.split(/```[a-z]*\n?/i)
  return (
    <div className={`texto ${className}`}>
      {partes.map((parte, i) =>
        i % 2 === 1 ? (
          <pre key={i}>{parte.replace(/\n$/, '')}</pre>
        ) : (
          parte
            .split(/\n{2,}/)
            .filter((p) => p.trim())
            .map((p, j) => (
              <p key={`${i}-${j}`}>
                {p.split('\n').map((linha, k, arr) => (
                  <span key={k}>
                    <Inline texto={linha} />
                    {k < arr.length - 1 && <br />}
                  </span>
                ))}
              </p>
            ))
        ),
      )}
    </div>
  )
}

function Inline({ texto }) {
  const pedacos = String(texto).split(/(`[^`]+`|\*\*[^*]+\*\*)/)
  return pedacos.map((p, i) => {
    if (p.startsWith('`') && p.endsWith('`') && p.length > 2) return <code key={i}>{p.slice(1, -1)}</code>
    if (p.startsWith('**') && p.endsWith('**') && p.length > 4) return <b key={i}>{p.slice(2, -2)}</b>
    return <span key={i}>{p}</span>
  })
}

/**
 * Resultado do mentor IA (OpenRouter): classificação, nível sugerido, certo/faltou, feedback, pergunta.
 * `dados.bruto` = o modelo não devolveu JSON. `onUsarNota(n)` mostra o botão "usar nível sugerido".
 */
export function MentorFeedback({ dados, onUsarNota, compacto = false }) {
  if (!dados) return null
  if (dados.bruto)
    return (
      <div className="mentor">
        <p className="small" style={{ whiteSpace: 'pre-wrap' }}>
          {dados.bruto}
        </p>
        <p className="dim small">{dados.modelo}</p>
      </div>
    )
  return (
    <div className={`mentor ${compacto ? 'mentor--compacto' : ''}`}>
      <div className="row" style={{ gap: 8 }}>
        {dados.classificacao && <span className="chip chip--peri">{dados.classificacao}</span>}
        {dados.nivelSugerido != null && (
          <span className={`chip mono ${classeNivel(dados.nivelSugerido)}`}>nível sugerido {dados.nivelSugerido}</span>
        )}
        {dados.modelo && !compacto && <span className="dim small mono">{dados.modelo.replace(':free', '')}</span>}
      </div>
      {dados.feedback && <p className="small" style={{ marginTop: 8 }}>{dados.feedback}</p>}
      {dados.certo && dados.certo.length > 0 && (
        <div>
          <div className="bloco__label" style={{ color: 'var(--green)' }}>Certo</div>
          <ul className="mentor__lista ok">
            {dados.certo.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      )}
      {dados.faltou && dados.faltou.length > 0 && (
        <div>
          <div className="bloco__label" style={{ color: 'var(--amber)' }}>Faltou</div>
          <ul className="mentor__lista falta">
            {dados.faltou.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      )}
      {dados.correcaoIngles && dados.correcaoIngles.length > 0 && (
        <div>
          <div className="bloco__label">English</div>
          <ul className="mentor__lista">
            {dados.correcaoIngles.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      )}
      {dados.perguntaAprofundamento && !compacto && (
        <div className="mentor__pergunta">
          <div className="bloco__label">Para aprofundar</div>
          <p className="pergunta small">{dados.perguntaAprofundamento}</p>
        </div>
      )}
      {onUsarNota && dados.nivelSugerido != null && (
        <div className="acoes" style={{ marginTop: 10 }}>
          <button className="btn btn--sm btn--primary" onClick={() => onUsarNota(dados.nivelSugerido)}>
            Usar nível {dados.nivelSugerido} como minha nota
          </button>
        </div>
      )}
    </div>
  )
}

export function Confirmar({ titulo, texto, confirmar = 'Confirmar', perigo, onSim, onNao }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onNao()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onNao])
  return (
    <div className="modal-bg" onClick={onNao} role="dialog" aria-modal="true" aria-label={titulo}>
      <div className="modal card" onClick={(e) => e.stopPropagation()}>
        <h2>{titulo}</h2>
        <p className="muted" style={{ marginTop: 8 }}>
          {texto}
        </p>
        <div className="acoes">
          <button className="btn btn--ghost" onClick={onNao}>
            Cancelar
          </button>
          <button className={`btn ${perigo ? 'btn--danger' : 'btn--primary'}`} onClick={onSim}>
            {confirmar}
          </button>
        </div>
      </div>
    </div>
  )
}

export function Carregando({ texto = 'Carregando…' }) {
  return <div className="vazio">{texto}</div>
}

export function Erro({ texto, onRetry }) {
  return (
    <div className="vazio">
      <p className="rose">{texto}</p>
      {onRetry && (
        <button className="btn" onClick={onRetry}>
          Tentar de novo
        </button>
      )}
    </div>
  )
}
