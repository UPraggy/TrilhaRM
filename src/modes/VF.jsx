import { useEffect, useMemo, useState } from 'react'
import { Bloco, Contexto } from '../components/Comuns.jsx'
import { definicaoFalsa } from '../lib/sessao.js'

export const NOTA_VF = { certo: 3, errado: 1 }

/**
 * Verdadeiro ou falso: "X é: <definição>". Metade das vezes a definição é de outro termo.
 * Teclado: V / F (ou ← / →), Enter continua.
 */
export default function VF({ item, pool, onConcluir }) {
  const afirmacao = useMemo(() => {
    const falsa = definicaoFalsa(item, pool)
    const usarFalsa = falsa && Math.random() < 0.5
    return { verdadeira: !usarFalsa, definicao: usarFalsa ? falsa.definicao : item.definicao, outro: usarFalsa ? falsa : null }
  }, [item, pool])
  const [resposta, setResposta] = useState(null)

  useEffect(() => setResposta(null), [item])

  const acertou = resposta !== null && resposta === afirmacao.verdadeira
  const continuar = () => onConcluir([{ item, nota: acertou ? NOTA_VF.certo : NOTA_VF.errado }])

  useEffect(() => {
    const onKey = (e) => {
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return
      const k = e.key.toLowerCase()
      if (resposta === null) {
        if (k === 'v' || k === 'arrowleft') setResposta(true)
        if (k === 'f' || k === 'arrowright') setResposta(false)
      } else if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') {
        e.preventDefault()
        continuar()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div>
      <Contexto termo={item} extra={<span className="chip">verdadeiro ou falso</span>} />
      <div className="card">
        <div className="eyebrow">A afirmação está certa?</div>
        <p className="pergunta" style={{ marginTop: 8 }}>
          <b className="amber">{item.termo}</b>
          {item.termoEN && item.termoEN !== item.termo && <span className="peri small"> ({item.termoEN})</span>} é: <em>{afirmacao.definicao}</em>
        </p>
        <div className="vf">
          <button className={`btn ${resposta === true ? (afirmacao.verdadeira ? 'btn--ok' : 'btn--bad') : ''}`} disabled={resposta !== null} onClick={() => setResposta(true)}>
            Verdadeiro
          </button>
          <button className={`btn ${resposta === false ? (!afirmacao.verdadeira ? 'btn--ok' : 'btn--bad') : ''}`} disabled={resposta !== null} onClick={() => setResposta(false)}>
            Falso
          </button>
        </div>
        {resposta !== null && (
          <>
            <div className={`feedback ${acertou ? 'ok' : 'bad'}`}>
              {acertou ? <b className="green">Certo.</b> : <b className="rose">Errado.</b>}{' '}
              {afirmacao.verdadeira ? (
                <>Essa é a definição real de {item.termo}.</>
              ) : (
                <>
                  Essa definição é de <b>{afirmacao.outro.termo}</b>. {item.termo} é: {item.definicao}
                </>
              )}{' '}
              Nota {acertou ? NOTA_VF.certo : NOTA_VF.errado}.
            </div>
            {!acertou && <Bloco label="Profundidade">{item.profundidade}</Bloco>}
            <div className="acoes">
              <button className="btn btn--primary btn--block" onClick={continuar} autoFocus>
                Continuar
              </button>
            </div>
          </>
        )}
      </div>
      <div className="hint-kbd">
        <span className="kbd">V</span> / <span className="kbd">F</span> responde · <span className="kbd">enter</span> continua
      </div>
    </div>
  )
}
