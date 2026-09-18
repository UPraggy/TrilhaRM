import { useEffect, useMemo, useState } from 'react'
import { Bloco, Contexto } from '../components/Comuns.jsx'
import { distratores } from '../lib/sessao.js'
import { embaralhar } from '../lib/util.js'

export const NOTA_QUIZ_CERTO = 3
export const NOTA_QUIZ_ERRADO = 1

/**
 * Múltipla escolha. `invertido=false`: mostra definição, escolhe termo. `invertido=true`: mostra termo, escolhe definição.
 * Acerto = nota 3 (aplico) · erro = nota 1 (reconheço). Teclado: 1–4 escolhe, Enter continua.
 */
export default function Quiz({ item, pool, invertido = false, onConcluir }) {
  const [escolha, setEscolha] = useState(null)

  const opcoes = useMemo(() => {
    const ds = distratores(item, pool, 3)
    return embaralhar([item, ...ds])
  }, [item, pool])

  useEffect(() => setEscolha(null), [item])

  const certa = (o) => o.deckId === item.deckId && o.id === item.id
  const respondeu = escolha !== null
  const acertou = respondeu && certa(escolha)

  const continuar = () => onConcluir([{ item, nota: acertou ? NOTA_QUIZ_CERTO : NOTA_QUIZ_ERRADO }])

  useEffect(() => {
    const onKey = (e) => {
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return
      if (!respondeu && /^[1-4]$/.test(e.key) && opcoes[Number(e.key) - 1]) setEscolha(opcoes[Number(e.key) - 1])
      else if (respondeu && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight')) {
        e.preventDefault()
        continuar()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div>
      <Contexto termo={item} extra={<span className="chip">{invertido ? 'quiz invertido' : 'quiz'}</span>} />
      <div className="card">
        {invertido ? (
          <>
            <div className="eyebrow">Qual é a definição de</div>
            <div className="termo-grande mt-1">
              {item.termo}
            </div>
            {item.termoEN && item.termoEN !== item.termo && <div className="termo-en">{item.termoEN}</div>}
          </>
        ) : (
          <>
            <div className="eyebrow">Qual termo é este?</div>
            <p className="pergunta mt-1">
              {item.definicao}
            </p>
          </>
        )}
        <div className="opcoes">
          {opcoes.map((o, i) => {
            let cls = 'opcao'
            if (respondeu) {
              if (certa(o)) cls += ' certa'
              else if (o === escolha) cls += ' errada'
            }
            return (
              <button key={`${o.deckId}/${o.id}`} className={cls} disabled={respondeu} onClick={() => setEscolha(o)}>
                <span className="opcao__k">{i + 1}</span>
                <span>{invertido ? o.definicao : o.termo}</span>
              </button>
            )
          })}
        </div>
        {respondeu && (
          <>
            <div className={`feedback ${acertou ? 'ok' : 'bad'}`}>
              {acertou ? (
                <>
                  <b className="green">Certo.</b> Nota {NOTA_QUIZ_CERTO} registrada.
                </>
              ) : (
                <>
                  <b className="rose">Errado.</b> A resposta era <b>{invertido ? item.definicao : item.termo}</b>. Nota {NOTA_QUIZ_ERRADO} registrada.
                </>
              )}
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
        <span className="kbd">1</span>–<span className="kbd">4</span> escolhe · <span className="kbd">enter</span> continua
      </div>
    </div>
  )
}
