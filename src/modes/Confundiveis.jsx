import { useEffect, useMemo, useState } from 'react'
import { Bloco, Contexto } from '../components/Comuns.jsx'
import { distratores } from '../lib/sessao.js'
import { embaralhar } from '../lib/util.js'

export const NOTA_CONFUNDIVEIS = { certo: 4, errado: 1 }

/** quantas tags dois termos têm em comum (proxy barato de "são parecidos") */
function parentesco(a, b) {
  const ta = new Set(a.tags || [])
  return (b.tags || []).filter((t) => ta.has(t)).length
}

/**
 * Pares confundíveis: o termo alvo contra o VIZINHO mais parecido dele (mais tags em comum), com as
 * duas definições embaralhadas. É a diferença entre "sei o que é" e "sei distinguir de".
 *
 * Preferir o vizinho mais parecido não é enfeite: distrator distante é fácil demais e não mede nada.
 */
export default function Confundiveis({ item, pool, onConcluir }) {
  const parceiro = useMemo(() => {
    const candidatos = pool.filter((t) => t.deckId === item.deckId && t.id !== item.id)
    if (!candidatos.length) return distratores(item, pool, 1)[0] || null
    return candidatos.reduce((melhor, t) => (parentesco(item, t) > parentesco(item, melhor) ? t : melhor))
  }, [item, pool])

  const cartoes = useMemo(() => (parceiro ? embaralhar([item, parceiro]) : [item]), [item, parceiro])
  const [escolha, setEscolha] = useState(null)

  useEffect(() => setEscolha(null), [item])

  if (!parceiro) {
    return (
      <div className="card">
        <p className="dim">Este módulo não tem outro termo para comparar.</p>
        <button className="btn btn--primary btn--block" onClick={() => onConcluir([{ item, nota: 2 }])}>
          Continuar
        </button>
      </div>
    )
  }

  const respondeu = escolha !== null
  const acertou = respondeu && escolha.id === item.id
  const nota = acertou ? NOTA_CONFUNDIVEIS.certo : NOTA_CONFUNDIVEIS.errado

  return (
    <div>
      <Contexto termo={item} extra={<span className="chip chip--amber">confundíveis</span>} />
      <div className="card">
        <div className="eyebrow">Qual destas duas definições é de</div>
        <div className="termo-grande" style={{ marginTop: 6 }}>
          {item.termo}
        </div>
        <p className="dim small">O outro é <b>{parceiro.termo}</b> — parecido de propósito.</p>

        <div className="opcoes opcoes--altas">
          {cartoes.map((c, i) => {
            let cls = 'opcao'
            if (respondeu) {
              if (c.id === item.id) cls += ' certa'
              else if (escolha && c.id === escolha.id) cls += ' errada'
            }
            return (
              <button key={c.id} className={cls} disabled={respondeu} onClick={() => setEscolha(c)}>
                <span className="opcao__k">{i + 1}</span>
                <span>{c.definicao}</span>
              </button>
            )
          })}
        </div>

        {respondeu && (
          <>
            <div className={`feedback ${acertou ? 'ok' : 'bad'}`}>
              {acertou ? <><b className="green">Certo.</b> Nota {nota}.</> : <><b className="rose">Trocou.</b> Essa era a de <b>{parceiro.termo}</b>. Nota {nota}.</>}
            </div>
            <Bloco label={`${item.termo} — em profundidade`}>{item.profundidade}</Bloco>
            <Bloco label={`${parceiro.termo} — para não confundir`}>{parceiro.definicao}</Bloco>
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
