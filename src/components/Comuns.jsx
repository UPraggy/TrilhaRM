import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { NIVEIS, classeNivel, fmtNivel } from '../lib/util.js'
import { useT } from '../i18n/index.jsx'

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
        termo.tags.slice(0, 3).map((tag) => (
          <span key={tag} className="chip">
            {tag}
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
/** a nota do mentor desenhada na escala 0–5: os degraus até a nota acendem, a nota pulsa */
export function EscalaMentor({ nivel }) {
  const { t } = useT()
  if (nivel == null) return null
  return (
    <div className="escala" role="img" aria-label={t('Nota do mentor: {n} de 5', { n: nivel })}>
      <div className="escala__topo">
        <span className="bloco__label">{t('Nota do mentor')}</span>
        <span className="escala__valor">
          <span className={`escala__nome ${classeNivel(nivel)}`}>{t((NIVEIS.find((x) => x.n === nivel) || NIVEIS[0]).curto)}</span>
          <b className={`escala__nota ${classeNivel(nivel)}`}>
            {nivel}
            <small>/5</small>
          </b>
        </span>
      </div>
      <ol className="escala__degraus">
        {NIVEIS.map((nv) => (
          <li key={nv.n} data-n={nv.n} className={`${nv.n <= nivel ? 'on' : ''} ${nv.n === nivel ? 'atual' : ''}`} style={{ '--i': nv.n }}>
            <i />
            <span title={t(nv.curto)}>{nv.n}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

export function MentorFeedback({ dados, onUsarNota, compacto = false }) {
  const { t } = useT()
  if (!dados) return null
  if (dados.bruto)
    return (
      <div className="mentor mentor--anima">
        <p className="dim small">{t('O mentor respondeu fora do formato esperado. O texto dele:')}</p>
        <p className="small pre-wrap">{dados.bruto}</p>
        <p className="dim small mono">{dados.modelo}</p>
      </div>
    )
  return (
    <div className={`mentor mentor--anima ${compacto ? 'mentor--compacto' : ''}`}>
      <div className="row" style={{ gap: 8 }}>
        {dados.classificacao && <span className="chip chip--peri">{dados.classificacao}</span>}
        {compacto && dados.nivelSugerido != null && <span className={`chip mono ${classeNivel(dados.nivelSugerido)}`}>{t('nível sugerido')} {dados.nivelSugerido}</span>}
        {dados.modelo && !compacto && <span className="dim small mono">{dados.modelo.replace(':free', '')}</span>}
      </div>
      {!compacto && <EscalaMentor nivel={dados.nivelSugerido} />}
      {dados.feedback && <p className="small mt-2">{dados.feedback}</p>}
      {dados.certo && dados.certo.length > 0 && (
        <div className="mentor__bloco mentor__bloco--ok">
          <div className="bloco__label">{t('Certo')}</div>
          <ul className="mentor__lista ok">
            {dados.certo.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      )}
      {dados.faltou && dados.faltou.length > 0 && (
        <div className="mentor__bloco mentor__bloco--falta">
          <div className="bloco__label">{t('Faltou')}</div>
          <ul className="mentor__lista falta">
            {dados.faltou.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      )}
      {dados.correcaoIngles && dados.correcaoIngles.length > 0 && (
        <div className="mentor__bloco">
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
          <div className="bloco__label">{t('Para aprofundar')}</div>
          <p className="pergunta small">{dados.perguntaAprofundamento}</p>
        </div>
      )}
      {dados.cortada && <p className="dim small mt-2">{t('A resposta do modelo veio cortada; o que chegou inteiro está acima.')}</p>}
      {onUsarNota && dados.nivelSugerido != null && (
        <div className="acoes mt-3">
          <button className="btn btn--sm btn--primary" onClick={() => onUsarNota(dados.nivelSugerido)}>
            {t('Usar nível {n} como minha nota', { n: dados.nivelSugerido })}
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
        <p className="muted mt-2">
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

/** Bloco cinza que pisca no lugar de um pedaço de conteúdo que ainda não chegou. */
export function Esqueleto({ className = '', style }) {
  return <span className={`skel ${className}`} style={style} aria-hidden="true" />
}

/**
 * Esqueleto do conteúdo (não um spinner solto): mostra a forma do que está vindo.
 * O texto vai só para o leitor de tela, com aria-live.
 */
export function Carregando({ texto = 'Carregando…', cartoes = 3 }) {
  return (
    <div className="carregando" role="status" aria-live="polite">
      <span className="sr-only">{texto}</span>
      <Esqueleto className="skel--titulo" />
      {Array.from({ length: cartoes }).map((_, i) => (
        <div className="skel-card" key={i}>
          <Esqueleto className="skel--linha" style={{ width: '55%' }} />
          <Esqueleto className="skel--linha" style={{ width: '90%' }} />
          <Esqueleto className="skel--barra" />
        </div>
      ))}
    </div>
  )
}

/** Lista/seção sem nada dentro: explica o porquê e, quando dá, oferece a saída. */
export function Vazio({ titulo, children, acao }) {
  return (
    <div className="vazio">
      {titulo && <p className="vazio__t">{titulo}</p>}
      {children && <div className="small">{children}</div>}
      {acao && <div className="vazio__acao">{acao}</div>}
    </div>
  )
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
