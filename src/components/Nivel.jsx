import { NIVEIS } from '../lib/util.js'

/** Botões 0–5 de auto-avaliação (escala do Rafael). */
export default function Nivel({ onEscolher, selecionado, disabled }) {
  return (
    <div className="niveis" role="group" aria-label="Nota de 0 a 5">
      {NIVEIS.map((n) => (
        <button
          key={n.n}
          type="button"
          className={`nivel ${selecionado === n.n ? 'sel' : ''}`}
          data-n={n.n}
          disabled={disabled}
          onClick={() => onEscolher(n.n)}
          title={`${n.n} · ${n.rotulo}`}
        >
          <b>{n.n}</b>
          <span>{n.curto}</span>
        </button>
      ))}
    </div>
  )
}

export function LegendaNiveis() {
  return (
    <p className="dim small" style={{ marginTop: 8 }}>
      {NIVEIS.map((n, i) => (
        <span key={n.n}>
          <span className="mono">{n.n}</span> {n.rotulo}
          {i < NIVEIS.length - 1 ? ' · ' : ''}
        </span>
      ))}
    </p>
  )
}
