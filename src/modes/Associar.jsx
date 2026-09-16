import { useEffect, useMemo, useState } from 'react'
import { embaralhar, chaveTermo } from '../lib/util.js'
import { truncar } from '../lib/texto.js'

export const NOTA_ASSOC = { limpo: 3, comErro: 1 }

/**
 * Matching: coluna de termos × coluna de definições curtas. Toque um de cada lado para ligar.
 * Par certo apaga; errado treme. Nota por termo: 3 se acertou de primeira, 1 se errou nele.
 * Itens marcados `extra` (completaram o bloco) também são avaliados — são termos reais do pool.
 */
export default function Associar({ itens, onConcluir }) {
  const termos = useMemo(() => embaralhar(itens), [itens])
  const defs = useMemo(() => embaralhar(itens), [itens])
  const [selT, setSelT] = useState(null)
  const [selD, setSelD] = useState(null)
  const [feitos, setFeitos] = useState(() => new Set())
  const [errados, setErrados] = useState(() => new Set())
  const [erroFlash, setErroFlash] = useState(null)

  useEffect(() => {
    setSelT(null)
    setSelD(null)
    setFeitos(new Set())
    setErrados(new Set())
  }, [itens])

  useEffect(() => {
    if (selT == null || selD == null) return
    if (selT === selD) {
      setFeitos((s) => new Set([...s, selT]))
    } else {
      setErrados((s) => new Set([...s, selT, selD]))
      setErroFlash({ t: selT, d: selD })
      setTimeout(() => setErroFlash(null), 350)
    }
    setSelT(null)
    setSelD(null)
  }, [selT, selD])

  const completo = feitos.size === itens.length

  const concluir = () =>
    onConcluir(
      itens.map((it) => ({
        item: it,
        nota: errados.has(chaveTermo(it)) ? NOTA_ASSOC.comErro : NOTA_ASSOC.limpo,
      })),
    )

  useEffect(() => {
    const onKey = (e) => {
      if (completo && (e.key === 'Enter' || e.key === 'ArrowRight')) concluir()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div>
      <div className="ctx">
        <span className="chip">associar</span>
        <span className="chip dim">
          {feitos.size}/{itens.length} pares
        </span>
        {errados.size > 0 && <span className="chip chip--rose">{errados.size} com erro</span>}
      </div>
      <div className="card">
        <div className="eyebrow">Ligue cada termo à sua definição</div>
        <div className="assoc">
          <div className="assoc__col">
            {termos.map((t) => {
              const k = chaveTermo(t)
              const feito = feitos.has(k)
              return (
                <button
                  key={k}
                  className={`par ${selT === k ? 'sel' : ''} ${feito ? 'feito' : ''} ${erroFlash && erroFlash.t === k ? 'erro' : ''}`}
                  disabled={feito}
                  onClick={() => setSelT((s) => (s === k ? null : k))}
                >
                  {t.termo}
                </button>
              )
            })}
          </div>
          <div className="assoc__col">
            {defs.map((t) => {
              const k = chaveTermo(t)
              const feito = feitos.has(k)
              return (
                <button
                  key={k}
                  className={`par par--def ${selD === k ? 'sel' : ''} ${feito ? 'feito' : ''} ${erroFlash && erroFlash.d === k ? 'erro' : ''}`}
                  disabled={feito}
                  onClick={() => setSelD((s) => (s === k ? null : k))}
                  title={t.definicao}
                >
                  {truncar(t.definicao, 110)}
                </button>
              )
            })}
          </div>
        </div>
        {completo && (
          <>
            <div className={`feedback ${errados.size ? 'quase' : 'ok'}`}>
              {errados.size === 0 ? (
                <>
                  <b className="green">Tudo ligado sem erro.</b> Nota {NOTA_ASSOC.limpo} para os {itens.length} termos.
                </>
              ) : (
                <>
                  <b className="amber">Completo.</b> {itens.length - errados.size} termos com nota {NOTA_ASSOC.limpo}, {errados.size} com nota {NOTA_ASSOC.comErro} (errou neles).
                </>
              )}
            </div>
            <div className="acoes">
              <button className="btn btn--primary btn--block" onClick={concluir} autoFocus>
                Continuar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
