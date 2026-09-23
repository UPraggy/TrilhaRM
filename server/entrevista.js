// Entrevista simulada: conversa de 3 a 5 rodadas em que o mentor faz a pergunta de aprofundamento
// EM CIMA da sua resposta anterior, e no fim avalia a conversa inteira.
//
// A diferença para o modo "explique" é o multi-turno: lá o mentor dá uma nota e para; aqui ele puxa
// o fio — que é exatamente o que uma entrevista de verdade faz com quem responde por cima.
import { extrairJSON } from './mentor.js'

export const MIN_RODADAS = 3
export const MAX_RODADAS = 5
const MAX_RESPOSTA = 6000

const SYSTEM_PT = `Você é um entrevistador técnico sênior. Conduza uma entrevista curta sobre UM tema.
Regras:
- Faça UMA pergunta por vez, curta e específica.
- A pergunta seguinte deve nascer da RESPOSTA anterior do candidato: puxe o ponto mais frágil ou o mais interessante.
- Não ensine, não corrija no meio, não dê a resposta. Só pergunte.
- Se o candidato disser algo genérico, peça um exemplo concreto ou um número.
Responda SEMPRE em JSON: {"pergunta": "..."}`

const SYSTEM_EN = `You are a senior technical interviewer. Run a short interview about ONE topic.
Rules:
- Ask ONE question at a time, short and specific.
- Each question must follow from the candidate's PREVIOUS answer: probe the weakest or most interesting point.
- Do not teach, do not correct mid-interview, do not give the answer. Only ask.
- If the candidate is vague, ask for a concrete example or a number.
Always answer in JSON: {"pergunta": "..."}`

const AVALIAR_PT = `Você é um entrevistador técnico sênior avaliando a conversa INTEIRA acima.
Responda SOMENTE em JSON, sem texto fora dele:
{
  "classificacao": "uma frase curta sobre o desempenho geral",
  "nivelSugerido": 0-5,
  "certo": ["o que ele acertou", "..."],
  "faltou": ["o que ficou faltando", "..."],
  "feedback": "2 a 4 frases, diretas, sobre como ele se sairia numa entrevista real",
  "proximoPasso": "uma ação concreta para melhorar neste tema",
  "correcaoIngles": []
}
Escala: 0 desconheço · 1 reconheço · 2 explico · 3 aplico · 4 diagnostico · 5 ensino/defendo.`

const AVALIAR_EN = `You are a senior technical interviewer evaluating the WHOLE conversation above.
Answer ONLY in JSON, no text outside it:
{
  "classificacao": "one short sentence about overall performance",
  "nivelSugerido": 0-5,
  "certo": ["what they got right", "..."],
  "faltou": ["what was missing", "..."],
  "feedback": "2 to 4 direct sentences about how they would do in a real interview",
  "proximoPasso": "one concrete action to improve on this topic",
  "correcaoIngles": ["grammar or naturalness corrections, quoting the original", "..."]
}
Scale: 0 unaware · 1 recognise · 2 explain · 3 apply · 4 diagnose · 5 teach/defend.`

/** a primeira pergunta sai do conteúdo, não do modelo: começa bom mesmo sem rede */
export function primeiraPergunta(termos, idioma) {
  const comPergunta = termos.filter((t) => (idioma === 'en' ? t.perguntaEntrevistaEN : t.perguntaEntrevista))
  const alvo = comPergunta[Math.floor(Math.random() * comPergunta.length)] || termos[0]
  if (!alvo) return null
  const p = idioma === 'en' ? alvo.perguntaEntrevistaEN || alvo.perguntaEntrevista : alvo.perguntaEntrevista
  return { pergunta: p, termoId: alvo.id, termo: alvo.termo }
}

/** o contexto que o modelo recebe: os termos do módulo, resumidos (sem despejar o deck inteiro) */
export function contextoDoModulo(modulo, termos, idioma) {
  const linhas = termos.slice(0, 24).map((t) => `- ${t.termo}: ${String(t.definicao || '').slice(0, 160)}`)
  return (idioma === 'en' ? `Topic: ${modulo.titulo}. Concepts in scope:\n` : `Tema: ${modulo.titulo}. Conceitos no escopo:\n`) + linhas.join('\n')
}

export function criarEntrevista({ estrutura, repo, mentor, progresso }) {
  /** começa (ou recomeça) uma entrevista do módulo */
  function iniciar(moduloId) {
    const modulo = estrutura.modulo(moduloId)
    if (!modulo) return { status: 404, corpo: { erro: 'módulo não encontrado' } }
    const deck = repo.obter(modulo.deckId)
    if (!deck) return { status: 409, corpo: { erro: 'este módulo ainda não tem deck' } }
    const idioma = modulo.idioma === 'en' ? 'en' : 'pt'
    const p = primeiraPergunta(deck.termos, idioma)
    if (!p) return { status: 409, corpo: { erro: 'nenhum termo com pergunta de entrevista' } }
    const sessao = {
      moduloId,
      moduloTitulo: modulo.titulo,
      idioma,
      iniciadaEm: new Date().toISOString(),
      turnos: [{ papel: 'entrevistador', texto: p.pergunta, termoId: p.termoId }],
      avaliacao: null,
    }
    progresso.salvarEntrevista(moduloId, sessao)
    return { status: 200, corpo: { sessao, rodada: 1, maxRodadas: MAX_RODADAS } }
  }

  /** responde a rodada atual e recebe a próxima pergunta (ou nada, se já deu para encerrar) */
  async function responder(moduloId, resposta) {
    const guardada = progresso.entrevista(moduloId)
    const sessao = guardada && guardada.atual
    if (!sessao) return { status: 409, corpo: { erro: 'nenhuma entrevista em andamento — comece uma' } }
    const texto = typeof resposta === 'string' ? resposta.trim().slice(0, MAX_RESPOSTA) : ''
    if (!texto) return { status: 400, corpo: { erro: 'resposta vazia' } }

    sessao.turnos.push({ papel: 'candidato', texto })
    const rodadas = sessao.turnos.filter((t) => t.papel === 'candidato').length

    if (rodadas >= MAX_RODADAS) {
      progresso.salvarEntrevista(moduloId, sessao)
      return { status: 200, corpo: { sessao, rodada: rodadas, maxRodadas: MAX_RODADAS, podeEncerrar: true, fim: true } }
    }

    const modulo = estrutura.modulo(moduloId)
    const deck = repo.obter(modulo.deckId)
    const messages = [
      { role: 'system', content: sessao.idioma === 'en' ? SYSTEM_EN : SYSTEM_PT },
      { role: 'user', content: contextoDoModulo(modulo, deck.termos, sessao.idioma) },
      ...sessao.turnos.map((t) => ({ role: t.papel === 'entrevistador' ? 'assistant' : 'user', content: t.texto })),
    ]
    const rr = await mentor.completar(messages, 300)
    if (!rr.ok) {
      // sem rede ou sem key: a entrevista continua com uma pergunta tirada do conteúdo
      const p = primeiraPergunta(
        deck.termos.filter((t) => !sessao.turnos.some((x) => x.termoId === t.id)),
        sessao.idioma,
      )
      if (!p) {
        progresso.salvarEntrevista(moduloId, sessao)
        return { status: 200, corpo: { sessao, rodada: rodadas, maxRodadas: MAX_RODADAS, podeEncerrar: true, fim: true, aviso: rr.resposta.corpo.mensagem } }
      }
      sessao.turnos.push({ papel: 'entrevistador', texto: p.pergunta, termoId: p.termoId, offline: true })
      progresso.salvarEntrevista(moduloId, sessao)
      return { status: 200, corpo: { sessao, rodada: rodadas, maxRodadas: MAX_RODADAS, podeEncerrar: rodadas >= MIN_RODADAS, aviso: rr.resposta.corpo.mensagem } }
    }

    const obj = extrairJSON(rr.conteudo || '')
    const pergunta = (obj && typeof obj.pergunta === 'string' && obj.pergunta.trim()) || String(rr.conteudo || '').trim().slice(0, 500)
    sessao.turnos.push({ papel: 'entrevistador', texto: pergunta, modelo: rr.modelo })
    progresso.salvarEntrevista(moduloId, sessao)
    return { status: 200, corpo: { sessao, rodada: rodadas, maxRodadas: MAX_RODADAS, podeEncerrar: rodadas >= MIN_RODADAS } }
  }

  /** encerra e avalia a conversa INTEIRA (é o que diferencia do modo "explique") */
  async function encerrar(moduloId) {
    const guardada = progresso.entrevista(moduloId)
    const sessao = guardada && guardada.atual
    if (!sessao) return { status: 409, corpo: { erro: 'nenhuma entrevista em andamento' } }
    const rodadas = sessao.turnos.filter((t) => t.papel === 'candidato').length
    if (!rodadas) return { status: 400, corpo: { erro: 'responda ao menos uma pergunta antes de encerrar' } }

    const transcricao = sessao.turnos
      .map((t) => `${t.papel === 'entrevistador' ? 'ENTREVISTADOR' : 'CANDIDATO'}: ${t.texto}`)
      .join('\n\n')
    const rr = await mentor.completar(
      [
        { role: 'system', content: sessao.idioma === 'en' ? AVALIAR_EN : AVALIAR_PT },
        { role: 'user', content: transcricao },
      ],
      2000,
    )
    if (!rr.ok) {
      // sem avaliação da IA a entrevista ainda vale: fica no histórico para reler
      progresso.arquivarEntrevista(moduloId, { ...sessao, rodadas })
      return { status: 200, corpo: { sessao, rodadas, avaliacao: null, aviso: rr.resposta.corpo.mensagem } }
    }
    const obj = extrairJSON(rr.conteudo || '') || {}
    const avaliacao = {
      classificacao: typeof obj.classificacao === 'string' ? obj.classificacao.slice(0, 200) : null,
      nivelSugerido: Number.isFinite(Number(obj.nivelSugerido)) ? Math.max(0, Math.min(5, Math.round(Number(obj.nivelSugerido)))) : null,
      certo: Array.isArray(obj.certo) ? obj.certo.filter((x) => typeof x === 'string').slice(0, 4) : [],
      faltou: Array.isArray(obj.faltou) ? obj.faltou.filter((x) => typeof x === 'string').slice(0, 4) : [],
      feedback: typeof obj.feedback === 'string' ? obj.feedback.slice(0, 1200) : '',
      proximoPasso: typeof obj.proximoPasso === 'string' ? obj.proximoPasso.slice(0, 400) : '',
      correcaoIngles: Array.isArray(obj.correcaoIngles) ? obj.correcaoIngles.filter((x) => typeof x === 'string').slice(0, 4) : [],
      modelo: rr.modelo,
    }
    progresso.arquivarEntrevista(moduloId, { ...sessao, rodadas, avaliacao })
    // XP da entrevista: peso de chefão por rodada respondida
    const xp = progresso.somarXp(rodadas * 12)
    return { status: 200, corpo: { sessao, rodadas, avaliacao, xp } }
  }

  function obter(moduloId) {
    const g = progresso.entrevista(moduloId) || { historico: [] }
    return { status: 200, corpo: { atual: g.atual || null, historico: g.historico || [], maxRodadas: MAX_RODADAS, minRodadas: MIN_RODADAS } }
  }

  function descartar(moduloId) {
    const g = progresso.entrevista(moduloId)
    if (g && g.atual) progresso.salvarEntrevista(moduloId, null)
    return { status: 200, corpo: { ok: true } }
  }

  return { iniciar, responder, encerrar, obter, descartar }
}
