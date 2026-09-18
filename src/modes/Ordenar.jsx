import { useEffect, useMemo, useState } from 'react'
import { Bloco, Contexto } from '../components/Comuns.jsx'
import { embaralhar } from '../lib/util.js'

export const NOTA_ORDENAR = { tudo: 4, maioria: 3, pouco: 1 }

/**
 * Ordenar: as fases/passos de um conceito fora de ordem, para recolocar na sequência certa.
 * A sequência é extraída do próprio conteúdo pelo servidor (`sequenciaDe` em server/licao.js), do
 * padrão "(1) … (2) … (3) …" — nenhum campo novo precisou ser criado nos decks.
 *
 * Toque em vez de arrastar: arrastar a 360 px é impreciso e o alvo de toque fica menor que 44 px.
 */
export default function Ordenar({ item, sequencia, onConcluir }) {
  const embaralhada = useMemo(() => embaralhar(sequencia.map((texto, i) => ({ texto, i }))), [sequencia])
  const [montada, setMontada] = useState([])
  const [conferido, setConferido] = useState(false)

  useEffect(() => {
    setMontada([])
    setConferido(false)
  }, [item, sequencia])

  const restantes = embaralhada.filter((p) => !montada.some((m) => m.i === p.i))
  const acertos = montada.filter((p, pos) => p.i === pos).length
  const nota = acertos === sequencia.length ? NOTA_ORDENAR.tudo : acertos >= Math.ceil(sequencia.length / 2) ? NOTA_ORDENAR.maioria : NOTA_ORDENAR.pouco

  return (
    <div>
      <Contexto termo={item} extra={<span className="chip">ordenar</span>} />
      <div className="card">
        <div className="eyebrow">Coloque na ordem certa — {item.termo}</div>

        <ol className="ordenar__montada">
          {montada.map((p, pos) => (
            <li key={p.i} className={conferido ? (p.i === pos ? 'certa' : 'errada') : ''}>
              <span className="ordenar__n">{pos + 1}</span>
              <span>{p.texto}</span>
              {!conferido && (
                <button className="btn btn--sm btn--ghost" onClick={() => setMontada(montada.filter((x) => x.i !== p.i))} aria-label={`Tirar "${p.texto}" da ordem`}>
                  ×
                </button>
              )}
            </li>
          ))}
          {!montada.length && <li className="dim ordenar__vazia">Toque nos passos abaixo, na ordem.</li>}
        </ol>

        {!conferido && (
          <div className="ordenar__pecas">
            {restantes.map((p) => (
              <button key={p.i} className="ordenar__peca" onClick={() => setMontada([...montada, p])}>
                {p.texto}
              </button>
            ))}
          </div>
        )}

        {!conferido && montada.length === sequencia.length && (
          <div className="acoes">
            <button className="btn btn--primary btn--block" onClick={() => setConferido(true)} autoFocus>
              Conferir
            </button>
          </div>
        )}

        {conferido && (
          <>
            <div className={`feedback ${acertos === sequencia.length ? 'ok' : 'bad'}`}>
              {acertos === sequencia.length ? (
                <><b className="green">Ordem certa.</b> Nota {NOTA_ORDENAR.tudo}.</>
              ) : (
                <><b className="rose">{acertos} de {sequencia.length} na posição certa.</b> Nota {nota}.</>
              )}
            </div>
            {acertos < sequencia.length && (
              <Bloco label="A ordem certa">
                {sequencia.map((s, i) => `${i + 1}. ${s}`).join('\n')}
              </Bloco>
            )}
            <div className="acoes">
              <button className="btn btn--primary btn--block" onClick={() => onConcluir([{ item, nota }])} autoFocus>
                Continuar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
