// SM-2 simplificado (SuperMemo 2) adaptado à escala 0-5 do Rafael:
// 0 desconheço · 1 reconheço · 2 explico · 3 aplico · 4 diagnostico · 5 ensino/defendo
// nota >= 3 conta como "acerto"; abaixo disso o intervalo volta ao início.

const DIA_MS = 24 * 60 * 60 * 1000

export function hojeISO(d = new Date()) {
  // data local, sem hora (YYYY-MM-DD)
  const off = d.getTimezoneOffset() * 60 * 1000
  return new Date(d.getTime() - off).toISOString().slice(0, 10)
}

export function estadoInicial() {
  return {
    nivel: 0,
    vistos: 0,
    acertos: 0,
    erros: 0,
    facilidade: 2.5,
    intervaloDias: 0,
    proximaRevisao: null,
    ultimaResposta: null,
    ultimoModo: null,
    respostasExplique: [],
  }
}

/**
 * Aplica uma avaliação ao estado de um termo.
 * @param {object|undefined} atual estado atual (ou undefined)
 * @param {number} nota 0..5
 * @param {string} modo flashcards|quiz|digitar|associar|vf|explique|...
 * @param {string} [resposta] texto livre (modo explique)
 * @param {Date} [agora]
 */
export function avaliar(atual, nota, modo, resposta, agora = new Date()) {
  const s = { ...estadoInicial(), ...(atual || {}) }
  nota = Math.max(0, Math.min(5, Math.round(Number(nota) || 0)))

  s.vistos += 1
  s.ultimaResposta = agora.toISOString()
  s.ultimoModo = modo || null

  // nível = média móvel curta entre o que já tinha e a nota nova (puxa rápido, mas não zera com um tropeço)
  s.nivel = s.vistos === 1 ? nota : Math.round(((s.nivel * 2 + nota) / 3) * 10) / 10

  if (nota >= 3) {
    s.acertos += 1
    if (s.intervaloDias === 0) s.intervaloDias = 1
    else if (s.intervaloDias === 1) s.intervaloDias = 6
    else s.intervaloDias = Math.round(s.intervaloDias * s.facilidade)
  } else {
    s.erros += 1
    s.intervaloDias = nota === 0 ? 0 : 1 // 0 = revisar de novo hoje
  }

  // fórmula do SM-2 para o fator de facilidade
  s.facilidade = s.facilidade + (0.1 - (5 - nota) * (0.08 + (5 - nota) * 0.02))
  if (s.facilidade < 1.3) s.facilidade = 1.3
  if (s.facilidade > 3.0) s.facilidade = 3.0
  s.facilidade = Math.round(s.facilidade * 100) / 100

  if (s.intervaloDias > 365) s.intervaloDias = 365
  s.proximaRevisao = hojeISO(new Date(agora.getTime() + s.intervaloDias * DIA_MS))

  if (modo === 'explique' && typeof resposta === 'string' && resposta.trim()) {
    s.respostasExplique = [
      ...(s.respostasExplique || []).slice(-9),
      { dia: hojeISO(agora), nota, texto: resposta.trim().slice(0, 4000) },
    ]
  }
  return s
}

/** termo está vencido (ou nunca visto) na data dada */
export function vencido(estado, dia = hojeISO()) {
  if (!estado || !estado.proximaRevisao) return true
  return estado.proximaRevisao <= dia
}
