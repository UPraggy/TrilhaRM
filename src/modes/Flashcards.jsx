import { useEffect, useRef, useState } from 'react'
import Nivel from '../components/Nivel.jsx'
import { Bloco, Contexto, EstadoTermo } from '../components/Comuns.jsx'

/**
 * Flashcard de um termo. Frente: termo (+EN). Toque/espaço vira. Verso: definição, profundidade, exemplo + nota 0–5.
 * Teclado (PC): espaço/enter vira · 0–5 avalia · → pula (nota não gravada) · ← volta ao anterior (se `onVoltar`).
 * Swipe: → pula, ← volta.
 */
export default function Flashcards({ item, onConcluir, onPular, onVoltar }) {
  const [virado, setVirado] = useState(false)
  const toque = useRef(null)

  useEffect(() => {
    setVirado(false)
  }, [item])

  useEffect(() => {
    const onKey = (e) => {
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        setVirado((v) => !v)
      } else if (e.key === 'ArrowRight') {
        onPular && onPular()
      } else if (e.key === 'ArrowLeft') {
        onVoltar && onVoltar()
      } else if (virado && /^[0-5]$/.test(e.key)) {
        onConcluir([{ item, nota: Number(e.key) }])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [item, virado, onConcluir, onPular, onVoltar])

  const onTouchStart = (e) => {
    toque.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() }
  }
  const onTouchEnd = (e) => {
    if (!toque.current) return
    const dx = e.changedTouches[0].clientX - toque.current.x
    const dy = e.changedTouches[0].clientY - toque.current.y
    const dt = Date.now() - toque.current.t
    toque.current = null
    if (Math.abs(dx) > 70 && Math.abs(dy) < 60 && dt < 600) {
      if (dx < 0) onPular && onPular()
      else onVoltar && onVoltar()
    }
  }

  return (
    <div>
      <Contexto termo={item} extra={<EstadoTermo termo={item} />} />
      {!virado ? (
        <div className="card flash flash--frente" onClick={() => setVirado(true)} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} role="button" tabIndex={0} aria-label="Virar cartão">
          <div className="termo-grande">{item.termo}</div>
          {item.termoEN && item.termoEN !== item.termo && <div className="termo-en">{item.termoEN}</div>}
          <div className="flash__dica">toque para virar</div>
        </div>
      ) : (
        <div className="card flash flash--verso" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          <div className="row row--between">
            <div>
              <div className="termo-grande" style={{ fontSize: '1.4rem' }}>
                {item.termo}
              </div>
              {item.termoEN && item.termoEN !== item.termo && <div className="termo-en" style={{ marginTop: 2 }}>{item.termoEN}</div>}
            </div>
            <button className="btn btn--sm btn--ghost" onClick={() => setVirado(false)}>
              Frente
            </button>
          </div>
          <Bloco label="Definição">{item.definicao}</Bloco>
          <Bloco label="Profundidade">{item.profundidade}</Bloco>
          <Bloco label="Exemplo" pre>
            {item.exemplo}
          </Bloco>
          <div className="bloco">
            <div className="bloco__label">Como você está neste termo?</div>
            <Nivel onEscolher={(n) => onConcluir([{ item, nota: n }])} />
          </div>
        </div>
      )}
      <div className="acoes">
        {onVoltar && (
          <button className="btn btn--ghost" onClick={onVoltar}>
            ← Anterior
          </button>
        )}
        {onPular && (
          <button className="btn btn--ghost" onClick={onPular}>
            Pular →
          </button>
        )}
      </div>
      <div className="hint-kbd">
        <span className="kbd">espaço</span> vira · <span className="kbd">0</span>–<span className="kbd">5</span> avalia · <span className="kbd">←</span> <span className="kbd">→</span> navega
      </div>
    </div>
  )
}
