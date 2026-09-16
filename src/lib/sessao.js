// Montagem de sessões de estudo: quais termos, em qual ordem, em quais modos, com quais distratores.
import { embaralhar, amostra, escolher, chaveTermo } from './util.js'

export const MODOS_POR_ITEM = ['flashcards', 'quiz', 'quiz-inv', 'digitar', 'vf', 'explique']
export const TAMANHO_ASSOCIAR = 6

/** termos vencidos (ou nunca vistos, se `incluirNovos`) */
export function filtrarVencidos(termos, progresso, hoje, { incluirNovos = false } = {}) {
  return termos.filter((t) => {
    const est = progresso.termos[chaveTermo(t)]
    if (!est) return incluirNovos
    return !est.proximaRevisao || est.proximaRevisao <= hoje
  })
}

/**
 * Ordena para estudo: vencidos primeiro (mais atrasados antes), depois nunca vistos, depois o resto.
 */
export function ordenarParaEstudo(termos, progresso, hoje) {
  const peso = (t) => {
    const est = progresso.termos[chaveTermo(t)]
    if (!est) return 1 // nunca visto
    if (!est.proximaRevisao || est.proximaRevisao <= hoje) return 0 // vencido
    return 2
  }
  const grupos = [[], [], []]
  for (const t of termos) grupos[peso(t)].push(t)
  grupos[0].sort((a, b) => {
    const ea = progresso.termos[chaveTermo(a)].proximaRevisao || ''
    const eb = progresso.termos[chaveTermo(b)].proximaRevisao || ''
    return ea < eb ? -1 : ea > eb ? 1 : 0
  })
  return [...grupos[0], ...embaralhar(grupos[1]), ...embaralhar(grupos[2])]
}

/**
 * Distratores para um termo: outros termos do mesmo deck; se faltar, decks vizinhos (mesma fase),
 * depois qualquer um. Nunca repete termo nem definição igual.
 */
export function distratores(alvo, pool, n = 3) {
  const mesmoDeck = pool.filter((t) => t.deckId === alvo.deckId && t.id !== alvo.id)
  const mesmaFase = pool.filter((t) => t.deckId !== alvo.deckId && t.fase === alvo.fase)
  const outros = pool.filter((t) => t.deckId !== alvo.deckId && t.fase !== alvo.fase)
  const escolhidos = []
  const usados = new Set([alvo.termo.toLowerCase(), alvo.definicao])
  for (const grupo of [mesmoDeck, mesmaFase, outros]) {
    for (const t of embaralhar(grupo)) {
      if (escolhidos.length >= n) break
      const k = t.termo.toLowerCase()
      if (usados.has(k) || usados.has(t.definicao)) continue
      usados.add(k)
      usados.add(t.definicao)
      escolhidos.push(t)
    }
    if (escolhidos.length >= n) break
  }
  return escolhidos
}

/**
 * Plano de sessão: lista de passos { modo, itens: [...] }.
 * - por item: 1 termo por passo
 * - associar: blocos de 6 (se sobrar menos que 3, cai em flashcards)
 * - misto: cada termo cai num modo aleatório; a cada ~8 itens entra um bloco de associar
 */
export function montarPlano(termos, modo, pool) {
  if (!termos.length) return []
  if (modo === 'associar') {
    const passos = []
    for (let i = 0; i < termos.length; i += TAMANHO_ASSOCIAR) {
      const bloco = termos.slice(i, i + TAMANHO_ASSOCIAR)
      if (bloco.length >= 3) {
        // completa até 6 com termos do pool que não estão no bloco (mesmo deck primeiro)
        const itens = bloco.slice()
        if (itens.length < TAMANHO_ASSOCIAR) {
          const idsBloco = new Set(itens.map(chaveTermo))
          const extras = distratores(itens[0], pool.filter((t) => !idsBloco.has(chaveTermo(t))), TAMANHO_ASSOCIAR - itens.length)
          itens.push(...extras.map((t) => ({ ...t, extra: true })))
        }
        passos.push({ modo: 'associar', itens })
      } else {
        bloco.forEach((t) => passos.push({ modo: 'flashcards', itens: [t] }))
      }
    }
    return passos
  }
  if (modo === 'misto') {
    const passos = []
    let fila = termos.slice()
    let contador = 0
    while (fila.length) {
      if (fila.length >= TAMANHO_ASSOCIAR && contador > 0 && contador % 7 === 0 && Math.random() < 0.6) {
        passos.push({ modo: 'associar', itens: fila.splice(0, TAMANHO_ASSOCIAR) })
        contador += 1
        continue
      }
      const t = fila.shift()
      let opcoes = MODOS_POR_ITEM.slice()
      if (!t.perguntaEntrevista) opcoes = opcoes.filter((m) => m !== 'explique')
      if (pool.length < 4) opcoes = opcoes.filter((m) => !m.startsWith('quiz') && m !== 'vf')
      passos.push({ modo: escolher(opcoes), itens: [t] })
      contador += 1
    }
    return passos
  }
  let m = modo
  return termos.map((t) => {
    let mm = m
    if (mm === 'explique' && !t.perguntaEntrevista) mm = 'flashcards'
    if ((mm.startsWith('quiz') || mm === 'vf') && pool.length < 4) mm = 'flashcards'
    return { modo: mm, itens: [t] }
  })
}

/** pega N definições "falsas" para o modo V/F */
export function definicaoFalsa(alvo, pool) {
  const d = distratores(alvo, pool, 1)
  return d.length ? d[0] : null
}

export { amostra }
