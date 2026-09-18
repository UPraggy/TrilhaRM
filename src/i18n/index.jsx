// A parte React do i18n. A lógica pura (dicionário, traduzir, plural) vive em `nucleo.js`, para o
// teste em `node --test` poder importar sem um transpilador de JSX.
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { CHAVE_LOCAL, IDIOMAS, idiomaInicial, localeDe, plural, traduzir } from './nucleo.js'

export { traduzir, plural, idiomaInicial } from './nucleo.js'

const Ctx = createContext(null)

export function I18nProvider({ children }) {
  const [idioma, setIdioma] = useState(idiomaInicial)

  useEffect(() => {
    try {
      localStorage.setItem(CHAVE_LOCAL, idioma)
    } catch {
      /* sem localStorage a escolha vale só nesta aba - melhor que quebrar */
    }
    document.documentElement.lang = idioma === 'en' ? 'en' : 'pt-BR'
    // o servidor precisa saber: é ele que manda as mensagens do BOT e desenha os CARDS
    fetch('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idioma }),
    }).catch(() => {})
  }, [idioma])

  const valor = useMemo(
    () => ({
      idioma,
      trocar: setIdioma,
      idiomas: Object.entries(IDIOMAS).map(([id, v]) => ({ id, nome: v.nome })),
      t: (texto, vars) => traduzir(idioma, texto, vars),
      tp: (um, muitos, n) => plural(idioma, um, muitos, n),
      num: (n, opts) => new Intl.NumberFormat(localeDe(idioma), opts).format(n),
      data: (iso, opts = { day: '2-digit', month: '2-digit', year: '2-digit' }) =>
        iso ? new Intl.DateTimeFormat(localeDe(idioma), opts).format(new Date(`${String(iso).slice(0, 10)}T12:00:00`)) : '–',
    }),
    [idioma],
  )

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

export function useT() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useT fora do I18nProvider')
  return v
}
