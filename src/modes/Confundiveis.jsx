import { useEffect, useMemo, useState } from 'react'
import { Bloco, Contexto } from '../components/Comuns.jsx'
import { distratores } from '../lib/sessao.js'
import { embaralhar } from '../lib/util.js'
import { useT } from '../i18n/index.jsx'

export const NOTA_CONFUNDIVEIS = { certo: 4, errado: 1 }

/** quantas tags dois termos têm em comum (proxy barato de "são parecidos") */
function parentesco(a, b) {
  const ta = new Set(a.tags || [])
  return (b.tags || []).filter((tag) => ta.has(tag)).length
}

/**
 * Pares confundíveis: o termo alvo contra o VIZINHO mais parecido dele (mais tags em comum), com as
 * duas definições embaralhadas. É a diferença entre "sei o que é" e "sei distinguir de".
 *
 * Preferir o vizinho mais parecido não é enfeite: distrator distante é fácil demais e não mede nada.
 */
export default function Confundiveis({ item, pool, onConcluir }) {
  const { t } = useT()
  const parceiro = useMemo(() => {
    const candidatos = pool.filter((x) => x.deckId === item.deckId && x.id !== item.id)
    if (!candidatos.length) return distratores(item, pool, 1)[0] || null
    return candidatos.reduce((melhor, x) => (parentesco(item, x) > parentesco(item, melhor) ? x : melhor))
  }, [item, pool])

  const cartoes = useMemo(() => (parceiro ? embaralhar([item, parceiro]) : [item]), [item, parceiro])
  const [escolha, setEscolha] = useState(null)

  useEffect(() => setEscolha(null), [item])

  if (!parceiro) {
    return (
      <div className="card">
        <p className="dim">{t('Este módulo não tem outro termo para comparar.')}</p>
        <button className="btn btn--primary btn--block" onClick={() => onConcluir([{ item, nota: 2 }])}>
          {t('Continuar')}
        </button>
      </div>
    )
  }

  const respondeu = escolha !== null
  const acertou = respondeu && escolha.id === item.id
  const nota = acertou ? NOTA_CONFUNDIVEIS.certo : NOTA_CONFUNDIVEIS.errado

  return (
    <div>
      <Contexto termo={item} extra={<span className="chip chip--amber">{t('confundíveis')}</span>} />
      <div className="card">
        <div className="eyebrow">{t('Qual destas duas definições é de')}</div>
        <div className="termo-grande" style={{ marginTop: 6 }}>
          {item.termo}
        </div>
        <p className="dim small">{t('O outro é')} <b>{parceiro.termo}</b> {t('— parecido de propósito.')}</p>

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
              {acertou ? <><b className="green">{t('Certo.')}</b> {t('Nota')} {nota}.</> : <><b className="rose">{t('Trocou.')}</b> {t('Essa era a de')} <b>{parceiro.termo}</b>. {t('Nota')} {nota}.</>}
            </div>
            <Bloco label={`${item.termo} ${t('— em profundidade')}`}>{item.profundidade}</Bloco>
            <Bloco label={`${parceiro.termo} ${t('— para não confundir')}`}>{parceiro.definicao}</Bloco>
            <div className="acoes">
              <button className="btn btn--primary btn--block" onClick={() => onConcluir([{ item, nota }])} autoFocus>
                {t('Continuar')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
