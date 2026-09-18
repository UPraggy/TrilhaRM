import { useEffect, useMemo, useState } from 'react'
import { Bloco, Contexto } from '../components/Comuns.jsx'
import { embaralhar } from '../lib/util.js'
import { useT } from '../i18n/index.jsx'

export const NOTA_CONEXOES = { perfeito: 5, bom: 4, meio: 3, ruim: 1 }

/**
 * Mapa de conexões: dado um termo, marcar quais dos mostrados são realmente relacionados a ele.
 * Usa o campo `relacionados[]` que todo termo já tem — decorar um conceito isolado é fácil; saber a
 * que ele se LIGA é o que aparece numa discussão de arquitetura.
 *
 * Nota pela precisão: acertos e erros contam (marcar tudo não passa).
 */
export default function Conexoes({ item, pool, onConcluir }) {
  const { t } = useT()
  const { certos, opcoes } = useMemo(() => {
    const doDeck = pool.filter((x) => x.deckId === item.deckId && x.id !== item.id)
    const ligados = doDeck.filter((x) => (item.relacionados || []).includes(x.id)).slice(0, 4)
    const naoLigados = embaralhar(doDeck.filter((x) => !(item.relacionados || []).includes(x.id))).slice(0, Math.max(2, 7 - ligados.length))
    return { certos: new Set(ligados.map((x) => x.id)), opcoes: embaralhar([...ligados, ...naoLigados]) }
  }, [item, pool])

  const [marcados, setMarcados] = useState(() => new Set())
  const [conferido, setConferido] = useState(false)

  useEffect(() => {
    setMarcados(new Set())
    setConferido(false)
  }, [item])

  const alternar = (id) => {
    if (conferido) return
    const n = new Set(marcados)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    setMarcados(n)
  }

  const acertos = [...marcados].filter((id) => certos.has(id)).length
  const falsos = [...marcados].filter((id) => !certos.has(id)).length
  const perdidos = certos.size - acertos
  const nota = falsos === 0 && perdidos === 0 ? NOTA_CONEXOES.perfeito : falsos + perdidos === 1 ? NOTA_CONEXOES.bom : acertos >= perdidos ? NOTA_CONEXOES.meio : NOTA_CONEXOES.ruim

  return (
    <div>
      <Contexto termo={item} extra={<span className="chip">{t('conexões')}</span>} />
      <div className="card">
        <div className="eyebrow">{t('O que se liga a')}</div>
        <div className="termo-grande mt-1">
          {item.termo}
        </div>
        <p className="dim small">{t('Marque todos os relacionados. Marcar o que não se liga também conta.')}</p>

        <div className="conexoes__grade">
          {opcoes.map((o) => {
            const on = marcados.has(o.id)
            let cls = `conexoes__op ${on ? 'on' : ''}`
            if (conferido) {
              if (certos.has(o.id)) cls += ' certa'
              else if (on) cls += ' errada'
            }
            return (
              <button key={o.id} className={cls} onClick={() => alternar(o.id)} disabled={conferido} aria-pressed={on}>
                {o.termo}
              </button>
            )
          })}
        </div>

        {!conferido ? (
          <div className="acoes">
            <button className="btn btn--primary btn--block" onClick={() => setConferido(true)} disabled={!marcados.size}>
              {t('Conferir')} ({marcados.size} {marcados.size === 1 ? t('marcado') : t('marcados')})
            </button>
          </div>
        ) : (
          <>
            <div className={`feedback ${nota >= 4 ? 'ok' : 'bad'}`}>
              <b className={nota >= 4 ? 'green' : 'rose'}>
                {acertos}/{certos.size} {t('conexões')}
              </b>
              {falsos > 0 && <> · {falsos} {falsos === 1 ? t('marcado a mais') : t('marcados a mais')}</>}
              {' '}· {t('Nota').toLowerCase()} {nota}.
            </div>
            <Bloco label={t('Por que se ligam')}>{item.profundidade}</Bloco>
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
