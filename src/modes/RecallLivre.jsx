import { useEffect, useRef, useState } from 'react'
import { useT } from '../i18n/index.jsx'

const SEGUNDOS = 180

/**
 * Recall livre: 3 minutos escrevendo tudo que lembra do módulo, sem consultar nada — e SÓ DEPOIS a
 * lista dos termos, para marcar o que faltou.
 *
 * A ordem importa: ver a lista antes vira reconhecimento (fácil e enganoso); escrever antes é
 * recuperação ativa, que é o que consolida. Por isso a lista só aparece quando o tempo acaba ou
 * quando você diz que terminou.
 *
 * Não avalia termo por termo no SM-2: quem faz isso são os outros modos. Aqui o resultado é o
 * percentual lembrado, que vira XP e aparece no resultado da lição.
 */
export default function RecallLivre({ termos, onConcluir }) {
  const { t } = useT()
  const [fase, setFase] = useState('escrevendo') // escrevendo | conferindo
  const [texto, setTexto] = useState('')
  const [restante, setRestante] = useState(SEGUNDOS)
  const [lembrados, setLembrados] = useState(() => new Set())
  const areaRef = useRef(null)

  useEffect(() => {
    if (fase !== 'escrevendo') return
    if (areaRef.current) areaRef.current.focus()
    const tick = setInterval(() => {
      setRestante((s) => {
        if (s <= 1) {
          clearInterval(tick)
          setFase('conferindo')
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(tick)
  }, [fase])

  const mm = String(Math.floor(restante / 60)).padStart(2, '0')
  const ss = String(restante % 60).padStart(2, '0')

  const alternar = (id) => {
    const n = new Set(lembrados)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    setLembrados(n)
  }

  if (fase === 'escrevendo') {
    return (
      <div>
        <div className="recall__topo">
          <span className="chip chip--amber">{t('recall livre')}</span>
          <span className={`recall__timer mono ${restante <= 30 ? 'quase' : ''}`}>{mm}:{ss}</span>
        </div>
        <div className="card">
          <div className="eyebrow">{t('Sem consultar nada')}</div>
          <p className="pergunta">
            {t('Escreva tudo o que você lembra deste módulo: conceitos, o que cada um resolve, o trade-off, um exemplo. Frases soltas servem — o que importa é puxar da memória.')}
          </p>
          <textarea
            ref={areaRef}
            className="textarea recall__area"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="cache-aside: leio o cache, no miss vou ao banco e preencho…"
            rows={10}
          />
          <div className="acoes">
            <button className="btn btn--primary btn--block" onClick={() => setFase('conferindo')}>
              {t('Terminei — ver a lista')}
            </button>
          </div>
          <p className="dim small">{t('A lista dos termos só aparece depois. Ver antes vira reconhecimento, não recall.')}</p>
        </div>
      </div>
    )
  }

  const pct = termos.length ? Math.round((lembrados.size / termos.length) * 100) : 0
  const nota = pct >= 85 ? 5 : pct >= 65 ? 4 : pct >= 40 ? 3 : pct >= 20 ? 2 : 1

  return (
    <div>
      <div className="recall__topo">
        <span className="chip chip--amber">{t('recall livre')}</span>
        <span className="dim small">{t('marque o que você escreveu')}</span>
      </div>
      <div className="card">
        <div className="eyebrow">{t('Quais destes você lembrou?')}</div>
        <div className="conexoes__grade">
          {termos.map((termo) => (
            <button key={termo.id} className={`conexoes__op ${lembrados.has(termo.id) ? 'on' : ''}`} onClick={() => alternar(termo.id)} aria-pressed={lembrados.has(termo.id)}>
              {termo.termo}
            </button>
          ))}
        </div>
        <div className="feedback">
          <b>{lembrados.size}/{termos.length}</b> — {pct}% {t('do módulo veio da memória.')}
        </div>
        {texto.trim() && (
          <details className="recall__meu">
            <summary className="dim small">{t('o que eu escrevi')}</summary>
            <pre className="pre">{texto}</pre>
          </details>
        )}
        <div className="acoes">
          <button className="btn btn--primary btn--block" onClick={() => onConcluir([{ tipo: 'recall', nota, pct, lembrados: [...lembrados] }])} autoFocus>
            {t('Continuar')}
          </button>
        </div>
      </div>
    </div>
  )
}
