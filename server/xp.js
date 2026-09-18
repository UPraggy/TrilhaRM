// Regras de XP e coroas — funções puras, sem I/O, para poderem ser testadas sozinhas.
//
// Decisão do Rafael (18/09/2026): XP entra, MAS a meta diária que vale para a ofensiva continua sendo
// o número de avaliações (MIN_AVALIACOES_DIA em progresso.js). O XP é a régua secundária, do dia e da
// lição; nunca substitui a ofensiva. Ver docs/PLANO-V2.md §B.10 ("XP pode inflar a ofensiva").

/** peso de cada tipo de item dentro de uma lição */
export const PESOS = {
  termo: 10, // um termo estudado em qualquer modo
  leitura: 6, // um bloco de leitura do curso
  exercicio: 20, // um exercício (no site ou fora dele)
  chefao: 40, // uma etapa do Treino Especial
}

/** meta de XP do dia (a meta que conta para a ofensiva continua sendo a de avaliações) */
export const META_XP_DIA = 60

/** bônus em XP por fechar um nó pela primeira vez */
export const BONUS_NO_NOVO = 15

/**
 * XP de um item.
 * - item com nota 0..5 (termo, exercício, chefão): proporcional à nota, mínimo 1 (tentou, levou algo).
 * - item sem nota (leitura, escolha certa/errada): peso cheio se acertou, 20 % se errou.
 * `nota` só é considerada quando é NÚMERO finito — `Number(null) === 0` já zerou termo nesta casa.
 */
export function xpDoItem({ tipo, nota, acertou } = {}) {
  const peso = PESOS[tipo] ?? PESOS.termo
  if (typeof nota === 'number' && Number.isFinite(nota)) {
    const n = Math.max(0, Math.min(5, nota))
    return Math.max(1, Math.round((peso * n) / 5))
  }
  return acertou ? peso : Math.max(1, Math.round(peso * 0.2))
}

/**
 * Consolida os itens respondidos de uma lição.
 * Um item conta como acerto quando `acertou === true` ou quando a nota é >= 3 ("aplico", a régua da casa).
 * @param {Array<{tipo:string, nota?:number, acertou?:boolean}>} itens
 */
export function resultadoLicao(itens, { primeiraVez = false } = {}) {
  const lista = Array.isArray(itens) ? itens : []
  let xp = 0
  let acertos = 0
  for (const it of lista) {
    xp += xpDoItem(it)
    const temNota = typeof it.nota === 'number' && Number.isFinite(it.nota)
    if (temNota ? it.nota >= 3 : Boolean(it.acertou)) acertos += 1
  }
  if (primeiraVez && lista.length) xp += BONUS_NO_NOVO
  const total = lista.length
  return {
    xp,
    acertos,
    total,
    pct: total ? Math.round((acertos / total) * 100) : 0,
    aproveitamento: total ? acertos / total : 0,
  }
}

/** coroas do módulo: a escala 0..5 que ele já usa, arredondada para baixo */
export function coroas(nivelMedio) {
  if (!Number.isFinite(Number(nivelMedio))) return 0
  return Math.max(0, Math.min(5, Math.floor(Number(nivelMedio))))
}

/** quanto falta para fechar a meta de XP do dia */
export function faltaParaMeta(xpHoje, meta = META_XP_DIA) {
  const feito = Number.isFinite(Number(xpHoje)) ? Number(xpHoje) : 0
  return { meta, feito, falta: Math.max(0, meta - feito), fechou: feito >= meta, pct: Math.min(100, Math.round((feito / meta) * 100)) }
}
