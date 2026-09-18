// Monta a LIÇÃO: a sessão curta de 8-12 itens de um nó do caminho (estilo Duolingo).
//
// O servidor monta o PLANO (quais termos, em que modo, que leitura, que missão) e o cliente renderiza
// com os componentes de src/modes/. Os distratores continuam sendo escolhidos no cliente, que já tem
// todos os termos em memória — assim a lição não precisa de mais um round-trip por item.
//
// ⚠️ O gabarito nunca sai daqui: item de exercício vem sem `solucao` (é o mesmo contrato das práticas).
import { vencido } from './sm2.js'

/** quantos itens uma lição tem, no alvo */
export const MIN_ITENS = 8
export const MAX_ITENS = 12

/** os modos que a lição sabe montar, por faixa de nível do termo */
export const MODOS_POR_NIVEL = {
  novo: ['flashcards', 'quiz', 'vf'], // nunca visto: apresentar antes de cobrar
  baixo: ['quiz', 'quiz-inv', 'digitar', 'lacuna', 'vf'], // 0-2: reconhecer e nomear
  medio: ['sintoma-causa', 'conexoes', 'confundiveis', 'digitar', 'ordenar'], // 3: aplicar
  alto: ['explique', 'sintoma-causa', 'ordenar'], // 4+: diagnosticar e defender
}

/** stopwords que nunca viram lacuna (não ensinam nada) */
const PARADAS = new Set([
  'para', 'pelo', 'pela', 'pelos', 'pelas', 'com', 'sem', 'que', 'quando', 'porque', 'entre', 'sobre',
  'cada', 'todo', 'toda', 'todos', 'todas', 'mais', 'menos', 'muito', 'muita', 'onde', 'como', 'isso',
  'esse', 'essa', 'este', 'esta', 'aquele', 'aquela', 'depois', 'antes', 'ainda', 'sempre', 'nunca',
  'apenas', 'tambem', 'também', 'entao', 'então', 'mesmo', 'mesma', 'outro', 'outra', 'seja', 'pode',
  'precisa', 'existe', 'fica', 'vale', 'tem', 'sao', 'são', 'uma', 'seu', 'sua', 'dos', 'das', 'nos',
  'nas', 'por', 'ele', 'ela', 'voce', 'você', 'numa', 'num',
])

function semAcento(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/**
 * Monta uma lacuna a partir da definição do termo: apaga a palavra mais informativa.
 * Prefere uma palavra do PRÓPRIO termo que apareça na definição (é o conceito-chave);
 * senão, a palavra mais longa que não seja parada.
 * @returns {{ texto: string, resposta: string } | null} null quando não dá para montar
 */
export function lacunaDe(termo) {
  const def = String(termo.definicao || '').trim()
  if (def.length < 40) return null
  const palavras = def.match(/[\p{L}\p{N}-]{4,}/gu) || []
  if (!palavras.length) return null

  const doTermo = new Set(
    (String(termo.termo || '').match(/[\p{L}\p{N}-]{4,}/gu) || []).map((p) => semAcento(p).toLowerCase()),
  )
  const candidatas = palavras.filter((p) => {
    const n = semAcento(p).toLowerCase()
    return !PARADAS.has(n) && !/^\d+$/.test(p)
  })
  if (!candidatas.length) return null

  const nota = (p) => {
    const n = semAcento(p).toLowerCase()
    return (doTermo.has(n) ? 100 : 0) + p.length
  }
  const alvo = candidatas.reduce((a, b) => (nota(b) > nota(a) ? b : a))
  // apaga só a primeira ocorrência, para a frase continuar legível
  const i = def.indexOf(alvo)
  if (i < 0) return null
  return { texto: `${def.slice(0, i)}______${def.slice(i + alvo.length)}`, resposta: alvo }
}

/**
 * Extrai uma sequência ordenada de dentro da profundidade do termo, no padrão "(1) … (2) … (3) …".
 * É o que permite o modo "ordenar" sem inventar campo novo no conteúdo.
 * @returns {string[]} vazio quando o termo não tem uma sequência utilizável
 */
export function sequenciaDe(termo) {
  const fonte = `${termo.sequencia ? '' : ''}${String(termo.profundidade || '')}`
  if (Array.isArray(termo.sequencia) && termo.sequencia.length >= 3) return termo.sequencia.slice(0, 6)
  const partes = fonte.split(/\((\d)\)\s*/).slice(1)
  const itens = []
  for (let i = 0; i + 1 < partes.length; i += 2) {
    const n = Number(partes[i])
    const texto = String(partes[i + 1] || '')
      .split(/;\s|(?<=\.)\s(?=[A-ZÀ-Ý])/)[0]
      .trim()
      .replace(/[;,.]$/, '')
    if (Number.isInteger(n) && texto.length >= 12 && texto.length <= 220) itens[n - 1] = texto
  }
  const limpos = itens.filter(Boolean)
  return limpos.length >= 3 ? limpos.slice(0, 5) : []
}

/** o modo cabe neste termo? (alguns exigem dado que nem todo termo tem) */
export function modoCabe(modo, termo, moduloTemVarios) {
  if (modo === 'lacuna') return Boolean(lacunaDe(termo))
  if (modo === 'ordenar') return sequenciaDe(termo).length >= 3
  if (modo === 'conexoes') return (termo.relacionados || []).length >= 2
  if (modo === 'sintoma-causa') return String(termo.exemplo || '').length >= 60 && moduloTemVarios
  if (modo === 'confundiveis') return moduloTemVarios
  if (modo === 'explique') return Boolean(termo.perguntaEntrevista)
  if (modo === 'quiz' || modo === 'quiz-inv' || modo === 'vf' || modo === 'associar') return moduloTemVarios
  return true
}

/** faixa de nível de um termo, que decide o leque de modos */
export function faixaDe(estado) {
  if (!estado || !Number.isFinite(estado.nivel)) return 'novo'
  if (estado.nivel < 3) return 'baixo'
  if (estado.nivel < 4) return 'medio'
  return 'alto'
}

/**
 * Escolhe o modo de um termo. Determinístico por `semente` para que recarregar a página não
 * embaralhe a lição inteira (e para que o teste seja reproduzível).
 */
export function escolherModo(termo, estado, { moduloTemVarios = true, semente = 0, evitar = null } = {}) {
  const faixa = faixaDe(estado)
  const leque = MODOS_POR_NIVEL[faixa].filter((m) => modoCabe(m, termo, moduloTemVarios) && m !== evitar)
  const usaveis = leque.length ? leque : MODOS_POR_NIVEL[faixa].filter((m) => modoCabe(m, termo, moduloTemVarios))
  if (!usaveis.length) return 'flashcards'
  return usaveis[Math.abs(semente) % usaveis.length]
}

/** número estável a partir de uma string (para a semente do modo) */
export function hash(s) {
  let h = 0
  for (let i = 0; i < String(s).length; i++) h = (h * 31 + String(s).charCodeAt(i)) | 0
  return h
}

/**
 * Ordena os termos do nó: VENCIDOS primeiro (é a promessa do SM-2), depois nunca vistos,
 * depois os de nível mais baixo. Dentro de cada grupo, a ordem do deck.
 */
export function ordenarTermos(termos, estados, deckId, hoje) {
  const peso = (t) => {
    const e = estados[`${deckId}/${t.id}`]
    if (e && vencido(e, hoje)) return 0
    if (!e) return 1
    return 2 + Math.min(5, e.nivel) / 10
  }
  return termos.map((t, i) => ({ t, i, p: peso(t) })).sort((a, b) => a.p - b.p || a.i - b.i).map((x) => x.t)
}

export function criarLicao({ estrutura, repo, cursos, praticas, progresso }) {
  /**
   * Monta o plano da lição de um nó.
   * @returns {{ erro?: string, status?: number, licao?: object }}
   */
  function montar(moduloId, n) {
    const alvo = estrutura.no(`${moduloId}/${n}`)
    if (!alvo) return { status: 404, erro: 'lição não encontrada' }
    const { modulo, no } = alvo
    if (no.tipo === 'chefao') return { status: 400, erro: 'o chefão é um Treino Especial: abra /treino/' + no.treinoId }

    const deck = repo.obter(modulo.deckId)
    if (!deck) return { status: 409, erro: 'este módulo ainda não tem deck — veja content/estrutura.json' }

    const prog = progresso.obter()
    const estados = prog.termos || {}
    const hoje = new Date().toISOString().slice(0, 10)
    const doNo = no.termos.map((id) => deck.termos.find((t) => t.id === id)).filter(Boolean)
    const ordenados = ordenarTermos(doNo, estados, deck.id, hoje)
    const moduloTemVarios = deck.termos.length >= 4

    const itens = []
    let anterior = null
    for (const t of ordenados) {
      const estado = estados[`${deck.id}/${t.id}`] || null
      const modo = escolherModo(t, estado, { moduloTemVarios, semente: hash(`${t.id}:${no.id}`), evitar: anterior })
      anterior = modo
      const item = { tipo: 'termo', modo, deckId: deck.id, termoId: t.id, nivel: estado ? estado.nivel : null, vencido: Boolean(estado && vencido(estado, hoje)) }
      if (modo === 'lacuna') item.lacuna = lacunaDe(t)
      if (modo === 'ordenar') item.sequencia = sequenciaDe(t)
      itens.push(item)
    }

    // um bloco de leitura do curso, quando o nó tem
    for (const l of no.leituras) {
      const r = cursos.licao(l.cursoId, l.licaoId)
      if (!r) continue
      itens.push({
        tipo: 'leitura',
        cursoId: l.cursoId,
        cursoTitulo: l.cursoTitulo,
        licaoId: l.licaoId,
        titulo: r.licao.titulo,
        blocos: r.licao.blocos,
        concluida: Boolean(((prog.cursos[l.cursoId] || {}).licoes || {})[l.licaoId]?.concluidaEm),
      })
    }

    // a missão: o exercício fora do app. Vai SEM gabarito e sem enunciado longo — quem abre é a tela da prática.
    for (const ex of no.exercicios) {
      const cheio = praticas.exercicio(ex.deckId, ex.exId)
      if (!cheio) continue
      const estado = prog.praticas[`${ex.deckId}/${ex.exId}`] || null
      itens.push({
        tipo: 'missao',
        deckId: ex.deckId,
        exId: ex.exId,
        titulo: cheio.titulo,
        tempoMin: cheio.tempoMin,
        ambiente: cheio.ambiente,
        entrega: cheio.entrega.tipo,
        nivel: cheio.nivel,
        concluida: Boolean(estado && estado.estado === 'concluida'),
        nota: estado ? estado.ultimaNota : null,
      })
    }

    // fecha com recall livre quando a lição ficou curta E o módulo já foi visto
    if (itens.length < MIN_ITENS && ordenados.length >= 3) {
      itens.push({ tipo: 'recall', moduloId: modulo.id, termos: ordenados.map((t) => ({ id: t.id, termo: t.termo })) })
    }

    return {
      licao: {
        modulo: { id: modulo.id, titulo: modulo.titulo, icone: modulo.icone, deckId: modulo.deckId, idioma: modulo.idioma, trilha: modulo.trilha },
        no: { id: no.id, n: no.n, titulo: no.titulo, total: no.n, totalNos: modulo.nos.length, estado: no.estado },
        itens: itens.slice(0, MAX_ITENS),
        ehPrimeiraVez: !prog.nos[no.id],
      },
    }
  }

  return { montar }
}
