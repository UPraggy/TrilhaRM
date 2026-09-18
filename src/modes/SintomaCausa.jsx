import { useEffect, useMemo, useState } from 'react'
import { Bloco, Contexto } from '../components/Comuns.jsx'
import { distratores } from '../lib/sessao.js'
import { embaralhar } from '../lib/util.js'

export const NOTA_CERTO = 4
export const NOTA_ERRADO = 1

/**
 * Sintoma → causa. Mostra uma situação de produção (o campo `exemplo` do termo) e pede o CONCEITO que
 * a explica, com distratores do mesmo módulo.
 *
 * É o modo mais valioso para o degrau 4 do plano ("diagnostico"): reconhecer a definição é fácil;
 * reconhecer o conceito por trás de um sintoma é o que a entrevista de verdade cobra.
 * Acerto = 4 (diagnostico) · erro = 1.
 */
export default function SintomaCausa({ item, pool, onConcluir }) {
  const [escolha, setEscolha] = useState(null)

  const opcoes = useMemo(() => embaralhar([item, ...distratores(item, pool, 3)]), [item, pool])
  useEffect(() => setEscolha(null), [item])

  const certa = (o) => o.deckId === item.deckId && o.id === item.id
  const respondeu = escolha !== null
  const acertou = respondeu && certa(escolha)
  const continuar = () => onConcluir([{ item, nota: acertou ? NOTA_CERTO : NOTA_ERRADO }])

  useEffect(() => {
    const onKey = (e) => {
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return
      if (!respondeu && /^[1-4]$/.test(e.key) && opcoes[Number(e.key) - 1]) setEscolha(opcoes[Number(e.key) - 1])
      else if (respondeu && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault()
        continuar()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div>
      <Contexto termo={item} extra={<span className="chip chip--amber">sintoma → causa</span>} />
      <div className="card">
        <div className="eyebrow">Aconteceu isto em produção</div>
        <p className="pergunta sintoma">{item.exemplo}</p>
        <div className="eyebrow" style={{ marginTop: 14 }}>
          Qual conceito explica o que você está vendo?
        </div>
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
                <span>{o.termo}</span>
              </button>
            )
          })}
        </div>
        {respondeu && (
          <>
            <div className={`feedback ${acertou ? 'ok' : 'bad'}`}>
              {acertou ? (
                <>
                  <b className="green">Isso.</b> Diagnóstico certo — nota {NOTA_CERTO}.
                </>
              ) : (
                <>
                  <b className="rose">Não era.</b> O conceito é <b>{item.termo}</b>. Nota {NOTA_ERRADO}.
                </>
              )}
            </div>
            <Bloco label="Por quê">{item.definicao}</Bloco>
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
