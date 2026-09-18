import { useEffect, useRef, useState } from 'react'
import { Bloco, Contexto } from '../components/Comuns.jsx'
import { compararResposta } from '../lib/texto.js'

export const NOTA_LACUNA = { certo: 4, quase: 3, revelado: 1 }

/**
 * Lacuna: a definição com o conceito-chave apagado. Quem monta a lacuna é o SERVIDOR
 * (`lacunaDe` em server/licao.js), para que a escolha da palavra seja a mesma no bot e no site.
 * Comparação tolerante (sem acento, Levenshtein ≤ 2), igual ao modo Digitar.
 */
export default function Lacuna({ item, lacuna, onConcluir }) {
  const [texto, setTexto] = useState('')
  const [erros, setErros] = useState(0)
  const [resultado, setResultado] = useState(null)
  const inputRef = useRef(null)

  useEffect(() => {
    setTexto('')
    setErros(0)
    setResultado(null)
    if (inputRef.current) inputRef.current.focus()
  }, [item, lacuna])

  // sem lacuna montada o item não deveria ter chegado aqui; cair para flashcards seria pior que avisar
  if (!lacuna) {
    return (
      <div className="card">
        <p className="dim">Este termo não tem lacuna disponível.</p>
        <button className="btn btn--primary btn--block" onClick={() => onConcluir([{ item, nota: 2 }])}>
          Continuar
        </button>
      </div>
    )
  }

  const verificar = (e) => {
    e.preventDefault()
    if (resultado) return
    const r = compararResposta(texto, lacuna.resposta, '')
    if (r === 'certo' || r === 'quase') setResultado(r)
    else {
      const n = erros + 1
      setErros(n)
      if (n >= 3) setResultado('revelado')
    }
  }

  const continuar = () => onConcluir([{ item, nota: NOTA_LACUNA[resultado] ?? 1, resposta: texto }])
  const [antes, depois] = lacuna.texto.split('______')

  return (
    <div>
      <Contexto termo={item} extra={<span className="chip">lacuna</span>} />
      <div className="card">
        <div className="eyebrow">Complete a definição de <b>{item.termo}</b></div>
        <p className="pergunta lacuna__frase">
          {antes}
          <span className={`lacuna__vao ${resultado ? (resultado === 'revelado' ? 'errada' : 'certa') : ''}`}>
            {resultado ? lacuna.resposta : '______'}
          </span>
          {depois}
        </p>

        {!resultado && (
          <form onSubmit={verificar} className="lacuna__form">
            <input
              ref={inputRef}
              className="input"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="a palavra que falta"
              aria-label="A palavra que falta"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck="false"
            />
            <button className="btn btn--primary" type="submit" disabled={!texto.trim()}>
              Verificar
            </button>
          </form>
        )}
        {!resultado && erros > 0 && (
          <p className="dim small">
            {erros === 1 ? 'Não é essa.' : 'Ainda não.'} {erros >= 2 && <>Começa com <b className="mono">{lacuna.resposta.slice(0, 2)}</b> e tem {lacuna.resposta.length} letras.</>}
            {' '}
            <button className="btn btn--sm btn--ghost" type="button" onClick={() => setResultado('revelado')}>
              revelar
            </button>
          </p>
        )}

        {resultado && (
          <>
            <div className={`feedback ${resultado === 'revelado' ? 'bad' : 'ok'}`}>
              {resultado === 'certo' && <><b className="green">Exato.</b> Nota {NOTA_LACUNA.certo}.</>}
              {resultado === 'quase' && <><b className="amber">Quase.</b> Era <b>{lacuna.resposta}</b>. Nota {NOTA_LACUNA.quase}.</>}
              {resultado === 'revelado' && <><b className="rose">Era <b>{lacuna.resposta}</b>.</b> Nota {NOTA_LACUNA.revelado}.</>}
            </div>
            {resultado !== 'certo' && <Bloco label="Profundidade">{item.profundidade}</Bloco>}
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
