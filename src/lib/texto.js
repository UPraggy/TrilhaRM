// Comparação tolerante de texto (modo Digitar) e utilidades de string.

const ACENTOS = new RegExp('[\\u0300-\\u036f]', 'g')

export function normalizar(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(ACENTOS, '') // remove acentos
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function levenshtein(a, b) {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = new Array(b.length + 1)
  let cur = new Array(b.length + 1)
  for (let j = 0; j <= b.length; j++) prev[j] = j
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i
    for (let j = 1; j <= b.length; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + custo)
    }
    ;[prev, cur] = [cur, prev]
  }
  return prev[b.length]
}

/**
 * Compara a resposta digitada com o termo (e o termoEN).
 * @returns {'certo'|'quase'|'errado'}
 */
export function compararResposta(digitado, termo, termoEN) {
  const d = normalizar(digitado)
  if (!d) return 'errado'
  const alvos = [termo, termoEN].filter(Boolean).map(normalizar)
  for (const alvo of alvos) {
    if (d === alvo) return 'certo'
  }
  for (const alvo of alvos) {
    const dist = levenshtein(d, alvo)
    if (dist <= 2 && alvo.length >= 4) return 'quase'
    if (dist <= 1) return 'quase'
  }
  return 'errado'
}

/** dica: primeira letra de cada palavra + pontos */
export function dicaPrimeiraLetra(termo) {
  return String(termo || '')
    .split(/\s+/)
    .map((p) => (p.length ? p[0] + '·'.repeat(Math.max(0, p.length - 1)) : p))
    .join(' ')
}

export function truncar(s, n = 90) {
  const t = String(s || '')
  if (t.length <= n) return t
  const corte = t.slice(0, n)
  const ult = corte.lastIndexOf(' ')
  return (ult > n * 0.6 ? corte.slice(0, ult) : corte) + '…'
}
