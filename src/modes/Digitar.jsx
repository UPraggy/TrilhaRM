import { useEffect, useRef, useState } from 'react'
import { Bloco, Contexto } from '../components/Comuns.jsx'
import { compararResposta, dicaPrimeiraLetra } from '../lib/texto.js'

export const NOTA_DIGITAR = { certo: 4, quase: 3, revelado: 1 }

/**
 * Mostra a definição; o usuário digita o termo. Comparação: case-insensitive, sem acento, Levenshtein ≤ 2 = "quase".
 * Após 2 erros aparece a dica de primeira letra; a resposta pode ser revelada (nota 1).
 * Notas: exato 4 · quase 3 · revelado/desistiu 1.
 */
export default function Digitar({ item, onConcluir }) {
  const [texto, setTexto] = useState('')
  const [erros, setErros] = useState(0)
  const [resultado, setResultado] = useState(null) // null | 'certo' | 'quase' | 'revelado'
  const [tremor, setTremor] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    setTexto('')
    setErros(0)
    setResultado(null)
    setTimeout(() => inputRef.current && inputRef.current.focus(), 30)
  }, [item])

  const verificar = (e) => {
    e && e.preventDefault()
    if (resultado) return
    const r = compararResposta(texto, item.termo, item.termoEN)
    if (r === 'errado') {
      setErros((n) => n + 1)
      setTremor(true)
      setTimeout(() => setTremor(false), 350)
      return
    }
    setResultado(r)
  }

  const revelar = () => setResultado('revelado')
  const continuar = () => onConcluir([{ item, nota: NOTA_DIGITAR[resultado] || 1 }])

  useEffect(() => {
    const onKey = (e) => {
      if (resultado && (e.key === 'Enter' || e.key === 'ArrowRight')) {
        e.preventDefault()
        continuar()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const mostrarDica = erros >= 2 && !resultado

  return (
    <div>
      <Contexto termo={item} extra={<span className="chip">digitar</span>} />
      <div className="card">
        <div className="eyebrow">Que termo é este?</div>
        <p className="pergunta mt-1">
          {item.definicao}
        </p>
        <form onSubmit={verificar} className="mt-5">
          <input
            ref={inputRef}
            className={`input input--lg mono ${resultado === 'certo' || resultado === 'quase' ? 'ok' : ''} ${resultado === 'revelado' ? 'bad' : ''}`}
            style={tremor ? { animation: 'shake 0.3s', borderColor: 'var(--rose)' } : undefined}
            value={resultado ? item.termo : texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="digite o termo…"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            disabled={Boolean(resultado)}
            aria-label="Sua resposta"
          />
          {mostrarDica && (
            <div className="feedback quase mono">
              dica: <b>{dicaPrimeiraLetra(item.termo)}</b>
              {item.termoEN && item.termoEN !== item.termo && <span className="dim"> (ou em inglês: {dicaPrimeiraLetra(item.termoEN)})</span>}
            </div>
          )}
          {erros > 0 && !resultado && (
            <p className="dim small mt-2">
              {erros} {erros === 1 ? 'tentativa errada' : 'tentativas erradas'}
            </p>
          )}
          {!resultado && (
            <div className="acoes">
              <button type="submit" className="btn btn--primary" disabled={!texto.trim()}>
                Verificar
              </button>
              {erros >= 1 && (
                <button type="button" className="btn btn--ghost" onClick={revelar}>
                  Revelar resposta
                </button>
              )}
            </div>
          )}
        </form>
        {resultado && (
          <>
            <div className={`feedback ${resultado === 'revelado' ? 'bad' : resultado === 'quase' ? 'quase' : 'ok'}`}>
              {resultado === 'certo' && (
                <>
                  <b className="green">Exato.</b> Nota {NOTA_DIGITAR.certo}.
                </>
              )}
              {resultado === 'quase' && (
                <>
                  <b className="amber">Quase</b> — você escreveu <span className="mono">{texto}</span>; o certo é <b>{item.termo}</b>. Nota {NOTA_DIGITAR.quase}.
                </>
              )}
              {resultado === 'revelado' && (
                <>
                  <b className="rose">Resposta:</b> <b>{item.termo}</b>
                  {item.termoEN && item.termoEN !== item.termo ? ` (${item.termoEN})` : ''}. Nota {NOTA_DIGITAR.revelado}.
                </>
              )}
            </div>
            <Bloco label="Profundidade">{item.profundidade}</Bloco>
            <div className="acoes">
              <button className="btn btn--primary btn--block" onClick={continuar} autoFocus>
                Continuar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
