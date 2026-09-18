// Coroas de um módulo = a escala 0..5 que ele já usa (nível médio dos termos), arredondada para baixo.
// Decisão da V2: a régua não muda, só ganha uma forma visual. "Nível 3 = aplico" continua valendo.
import { NIVEIS } from '../lib/util.js'

const Coroa = ({ cheia }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill={cheia ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 18 3 7l5 4 4-6 4 6 5-4-1 11z" />
  </svg>
)

export default function Coroas({ n = 0, max = 5, rotulo = true }) {
  const cheias = Math.max(0, Math.min(max, Math.round(Number(n) || 0)))
  const nivel = NIVEIS[cheias] || NIVEIS[0]
  return (
    <span className={`coroas nv-${cheias}`} title={`Nível ${cheias} — ${nivel.rotulo}`} aria-label={`Nível ${cheias} de ${max}: ${nivel.rotulo}`}>
      {Array.from({ length: max }, (_, i) => (
        <Coroa key={i} cheia={i < cheias} />
      ))}
      {rotulo && <span className="dim small coroas__txt">{nivel.curto}</span>}
    </span>
  )
}
