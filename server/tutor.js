// Tutor: o botão flutuante que existe em toda tela. Explica o que está na tela e abre um chat.
//
// A diferença para o mentor (server/mentor.js) e para a entrevista (server/entrevista.js): aqueles
// AVALIAM uma resposta; o tutor ENSINA e tira dúvida. Ele reaproveita a mesma fila de modelos
// gratuitos do OpenRouter (mentor.completar) — a key e o modelo são os de Ajustes.
//
// Ele "entende o sistema" por três camadas de contexto, montadas a cada pergunta:
//   1. o app: vocabulário (Trilha → Módulo → Lição), telas e modos — fixo, escrito aqui;
//   2. o aluno: trilha atual, próxima lição, ofensiva e XP — lido do progresso;
//   3. a tela: rota + título + o TEXTO visível que o front capturou (e o trecho selecionado, se houver).
//
// O servidor não guarda a conversa: o front manda o histórico a cada chamada (sessionStorage).
// Sem estado aqui, reiniciar o PM2 no celular não perde nada e não há sessão para vazar.

export const MAX_MENSAGENS = 16
export const MAX_TEXTO_MENSAGEM = 4000
export const MAX_TEXTO_TELA = 7000
const MAX_TOKENS_RESPOSTA = 1100

/** o que é cada tela, para o tutor saber onde o aluno está mesmo quando o texto capturado é pouco */
export const MAPA_TELAS = [
  { re: /^\/$/, nome: 'Início', oQueE: 'o painel do dia: próxima lição sugerida, meta de XP do dia, ofensiva e atalhos para retomar' },
  { re: /^\/trilha(\/[^/]+)?$/, nome: 'Trilha', oQueE: 'o mapa vertical (estilo Duolingo) de uma trilha: os módulos em ordem, cada um com seus nós de lição, coroas e cadeados macios de pré-requisito' },
  { re: /^\/modulo\/[^/]+$/, nome: 'Módulo', oQueE: 'um tema (ex.: Cache, HTTP). Mostra os nós (lições de vocabulário, leituras de curso, exercícios e o chefão), as coroas, termos vencidos na revisão e a entrevista simulada' },
  { re: /^\/licao\/[^/]+\/[^/]+$/, nome: 'Lição', oQueE: 'uma sessão de 8 a 12 itens, um por tela, misturando modos (flashcard, quiz, lacuna, ordenar, sintoma→causa, pares confundíveis, mapa de conexões, recall livre, explique). Pode haver uma pergunta ainda NÃO respondida na tela' },
  { re: /^\/resultado\//, nome: 'Resultado da lição', oQueE: 'o fechamento da lição: acertos, XP ganho, coroas, meta do dia e o próximo nó' },
  { re: /^\/duelo\//, nome: 'Duelo', oQueE: 'o aluno refaz uma lição e compara com o próprio desempenho anterior' },
  { re: /^\/entrevista\//, nome: 'Entrevista simulada', oQueE: 'uma conversa de 3 a 5 rodadas em que o entrevistador IA puxa o fio da resposta anterior, e no fim avalia a conversa inteira' },
  { re: /^\/biblioteca$/, nome: 'Biblioteca', oQueE: 'a porta para escolher em vez de seguir o caminho: glossário, cursos, laboratório de exercícios e treinos especiais' },
  { re: /^\/glossario$/, nome: 'Glossário', oQueE: 'busca de qualquer termo dos 19 módulos, com definição, profundidade e termos relacionados' },
  { re: /^\/cursos$/, nome: 'Cursos', oQueE: 'a lista dos cursos em Markdown (aulas longas, do começo ao fim)' },
  { re: /^\/curso\/[^/]+$/, nome: 'Curso', oQueE: 'o índice de um curso: as lições em ordem e o que já foi lido' },
  { re: /^\/curso\/[^/]+\/licao\//, nome: 'Aula do curso', oQueE: 'uma aula em Markdown, com blocos de código, diagramas e às vezes uma atividade embutida para entregar' },
  { re: /^\/praticas$/, nome: 'Laboratório', oQueE: 'todos os exercícios práticos, para fazer FORA do app (terminal, Node, Postgres, Docker…) e trazer a evidência' },
  { re: /^\/pratica\//, nome: 'Exercício prático', oQueE: 'um exercício feito fora do app: enunciado, passos, critérios, dicas graduais, a entrega do aluno e a correção do mentor. O gabarito só aparece depois da entrega' },
  { re: /^\/treinos$/, nome: 'Treinos especiais', oQueE: 'as temporadas longas (os chefões), cada uma com várias etapas' },
  { re: /^\/treino\//, nome: 'Treino especial', oQueE: 'uma temporada de etapas encadeadas, com rascunho, dicas, entrega e checklist de acerto' },
  { re: /^\/deck\//, nome: 'Vocabulário do módulo', oQueE: 'a lista dos termos de um módulo com o estado de revisão de cada um' },
  { re: /^\/estudar\//, nome: 'Sessão livre', oQueE: 'estudo livre por modo escolhido (flashcards, quiz, digitar, associar, verdadeiro ou falso, explique)' },
  { re: /^\/perfil$/, nome: 'Perfil', oQueE: 'medir, revisar e ajustar: matriz de nível, diário de erros, como o app funciona e ajustes' },
  { re: /^\/perfil\/erros$/, nome: 'Diário de erros', oQueE: 'o registro do que o aluno achou, o que era de verdade e como detectar da próxima vez' },
  { re: /^\/matriz$/, nome: 'Matriz de nível', oQueE: 'o nível 0–5 por módulo e o histórico de avaliações' },
  { re: /^\/anatomia$/, nome: 'Como o app funciona', oQueE: 'a explicação da hierarquia Trilha → Módulo → Lição e de onde está cada coisa' },
  { re: /^\/config$/, nome: 'Ajustes', oQueE: 'key e modelo do OpenRouter (mentor e tutor), bot do Telegram, idioma e reset do progresso' },
]

export function telaDe(rota) {
  const r = String(rota || '').split(/[?#]/)[0]
  return MAPA_TELAS.find((x) => x.re.test(r)) || { nome: 'Tela', oQueE: 'uma tela do app' }
}

const SOBRE_O_APP = `O APP (Trilha RM): app pessoal de estudo do Rafael, dev Full Stack Pleno, para subir a Sênior em engenharia de software. Roda no PC e no celular.
VOCABULÁRIO (use exatamente estas palavras):
- Trilha = uma fase do plano de carreira (T1…T5). É o caminho.
- Módulo = um tema (Cache, HTTP, Testes…). Junta vocabulário (termos para decorar), aulas de curso, exercícios fora do app e o chefão (treino especial).
- Lição = uma sessão curta de 8 a 12 itens, 5 a 10 minutos, um item por tela.
MECÂNICAS: XP por lição e meta de XP do dia; coroas por módulo; ofensiva (dias seguidos com o mínimo de avaliações); revisão espaçada SM-2 (termo "vencido" = hora de revisar); escala de nível 0 desconheço · 1 reconheço · 2 explico · 3 aplico · 4 diagnostico · 5 ensino/defendo.
NAVEGAÇÃO: barra inferior com Início, Trilha, Biblioteca (glossário, cursos, laboratório, treinos) e Perfil (matriz, diário de erros, como o app funciona, ajustes).`

const REGRAS_PT = `Você é o TUTOR do app Trilha RM: um engenheiro Sênior/Staff paciente, direto e prático, que ensina um dev Pleno.
Como responder:
- Português do Brasil. Frases curtas. Vá ao ponto; nada de "ótima pergunta".
- Explique com um exemplo concreto do dia a dia de um dev Full Stack (Node, React, Postgres, Redis, Docker, Linux), e quando ajudar, um trecho curto de código.
- Formato: parágrafos curtos, listas com "- ", **negrito** só no essencial, código em \`\`\` . Nada de tabelas nem títulos com #.
- Tamanho: explicar a tela = 120 a 250 palavras; dúvida no chat = o necessário, raramente mais que 200 palavras.
- Você enxerga a tela pelo texto que o app capturou. Se faltar algo para responder, diga o que falta em vez de inventar.
- Se a pergunta for sobre o APP (onde fica algo, o que um botão faz), responda com o vocabulário acima e o caminho de menus.
- ⚠️ Se a tela tiver uma pergunta, quiz ou exercício AINDA NÃO RESPONDIDO: explique o conceito e dê uma pista que faça ele pensar, mas NÃO entregue a resposta nem diga qual alternativa é a certa — a menos que ele peça a resposta explicitamente. Depois de respondido, explique à vontade por que a certa é a certa.
- Termine, quando fizer sentido, com UMA pergunta curta de checagem ou um próximo passo concreto.`

const REGRAS_EN = `You are the TUTOR of the Trilha RM app: a patient, direct, practical Senior/Staff engineer teaching a mid-level dev.
How to answer:
- English. Short sentences. Get to the point; no "great question".
- Explain with a concrete example from a Full Stack dev's day (Node, React, Postgres, Redis, Docker, Linux) and, when it helps, a short code snippet.
- Format: short paragraphs, "- " lists, **bold** only for the essential, code in \`\`\` . No tables, no # headings.
- Length: explaining the screen = 120 to 250 words; chat questions = what is needed, rarely more than 200 words.
- You see the screen through the text the app captured. If something is missing, say what is missing instead of making it up.
- If the question is about the APP (where something is, what a button does), answer with the vocabulary above and the menu path.
- ⚠️ If the screen shows a question, quiz or exercise NOT YET ANSWERED: explain the concept and give a hint that makes them think, but do NOT give the answer or say which option is right — unless they explicitly ask for the answer. Once answered, explain freely why the right one is right.
- When it makes sense, end with ONE short check question or a concrete next step.`

/** resumo do aluno em poucas linhas — nunca o progresso inteiro (seria caro e inútil) */
export function contextoAluno(estruturaResolvida, prog) {
  const linhas = []
  const e = estruturaResolvida || {}
  const atual = (e.trilhas || []).find((t) => t.id === e.trilhaAtual)
  if (atual) linhas.push(`Trilha atual: T${atual.numero} ${atual.titulo} (${atual.progresso.pct}% feita, ${atual.progresso.vencidos} termos vencidos para revisar).`)
  if (e.proximo) linhas.push(`Próxima lição sugerida: módulo "${e.proximo.moduloTitulo}", nó ${e.proximo.no.n} (${e.proximo.no.titulo || e.proximo.no.tipo}).`)
  const p = prog || {}
  const s = p.streak || {}
  if (s.atual !== undefined) linhas.push(`Ofensiva: ${s.atual || 0} dia(s) (melhor ${s.melhor || 0}).`)
  if (p.xp && Number.isFinite(p.xp.total)) linhas.push(`XP total: ${p.xp.total}.`)
  return linhas.join('\n')
}

function limpar(texto, max) {
  return String(texto == null ? '' : texto)
    .replace(/\u0000/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max)
}

/** valida e normaliza o corpo que o front manda; devolve { ok, erro? , dados? } */
export function normalizarPedido(corpo) {
  const c = corpo && typeof corpo === 'object' ? corpo : {}
  const tela = c.tela && typeof c.tela === 'object' ? c.tela : {}
  const rota = limpar(tela.rota, 200)
  const dados = {
    idioma: c.idioma === 'en' ? 'en' : 'pt',
    acao: c.acao === 'explicar' ? 'explicar' : 'chat',
    tela: {
      rota: rota.startsWith('/') ? rota : '/',
      titulo: limpar(tela.titulo, 200),
      texto: limpar(tela.texto, MAX_TEXTO_TELA),
      selecao: limpar(tela.selecao, 1500),
    },
    mensagens: [],
  }
  const brutas = Array.isArray(c.mensagens) ? c.mensagens.slice(-MAX_MENSAGENS) : []
  for (const m of brutas) {
    if (!m || typeof m !== 'object') continue
    const papel = m.papel === 'tutor' ? 'tutor' : m.papel === 'eu' ? 'eu' : null
    const texto = limpar(m.texto, MAX_TEXTO_MENSAGEM)
    if (!papel || !texto) continue
    dados.mensagens.push({ papel, texto, rota: limpar(m.rota, 200) })
  }
  if (dados.acao === 'chat') {
    const ultima = dados.mensagens[dados.mensagens.length - 1]
    if (!ultima || ultima.papel !== 'eu') return { ok: false, erro: 'escreva uma pergunta' }
  }
  return { ok: true, dados }
}

/** a lista de messages que vai para o OpenRouter */
export function montarMensagens(dados, aluno) {
  const { idioma, acao, tela, mensagens } = dados
  const info = telaDe(tela.rota)
  const blocoTela = [
    `TELA ATUAL: ${info.nome} (rota ${tela.rota}) — ${info.oQueE}.`,
    tela.titulo ? `Título da página: ${tela.titulo}` : '',
    tela.selecao ? `TRECHO QUE O ALUNO SELECIONOU (priorize isto):\n"""\n${tela.selecao}\n"""` : '',
    `TEXTO VISÍVEL NA TELA (capturado agora, pode estar cortado):\n"""\n${tela.texto || '(a tela não tinha texto legível)'}\n"""`,
  ]
    .filter(Boolean)
    .join('\n\n')

  const system = [idioma === 'en' ? REGRAS_EN : REGRAS_PT, SOBRE_O_APP, aluno ? `O ALUNO AGORA:\n${aluno}` : '', blocoTela].filter(Boolean).join('\n\n')
  const out = [{ role: 'system', content: system }]
  for (const m of mensagens) {
    // a conversa atravessa telas: marcar onde cada pergunta foi feita evita que o tutor responda
    // sobre a tela nova uma dúvida que era da anterior
    const marca = m.papel === 'eu' && m.rota && m.rota !== tela.rota ? `[perguntado na tela ${telaDe(m.rota).nome} (${m.rota})] ` : ''
    out.push({ role: m.papel === 'eu' ? 'user' : 'assistant', content: marca + m.texto })
  }
  if (acao === 'explicar') {
    out.push({
      role: 'user',
      content:
        idioma === 'en'
          ? tela.selecao
            ? 'Explain the passage I selected, in the context of this screen.'
            : 'Explain what is on this screen: what it is for, the concepts that appear on it, and what I should do here.'
          : tela.selecao
            ? 'Explique o trecho que selecionei, no contexto desta tela.'
            : 'Explique o que está nesta tela: para que ela serve, os conceitos que aparecem nela e o que eu devo fazer aqui.',
    })
  }
  return out
}

/** o modelo às vezes pensa em voz alta (<think>) ou embrulha tudo num bloco — limpamos antes de mostrar */
export function limparResposta(texto) {
  return String(texto || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^\s*<think>[\s\S]*$/i, '')
    .trim()
}

export function criarTutor({ mentor, estrutura, progresso }) {
  async function conversar(corpo) {
    const n = normalizarPedido(corpo)
    if (!n.ok) return { status: 400, corpo: { erro: 'parametros', mensagem: n.erro } }
    let aluno = ''
    try {
      aluno = contextoAluno(estrutura.resolver(), progresso.obter())
    } catch (e) {
      console.warn('[tutor] sem contexto do aluno:', e.message) // o tutor responde assim mesmo
    }
    // 25 s por modelo: é conversa, e esperar 60 s num gratuito travado antes de tentar o próximo cansa
    const rr = await mentor.completar(montarMensagens(n.dados, aluno), MAX_TOKENS_RESPOSTA, { timeoutMs: 25_000 })
    if (!rr.ok) return rr.resposta
    const resposta = limparResposta(rr.conteudo)
    if (!resposta) return { status: 502, corpo: { erro: 'vazia', mensagem: 'O modelo respondeu vazio. Tente de novo.' } }
    return { status: 200, corpo: { resposta, modelo: rr.modelo } }
  }
  return { conversar }
}

/** limitador simples por IP: o túnel é público, e cada chamada gasta a cota gratuita do OpenRouter */
export function criarLimitador({ max = 20, janelaMs = 60_000 } = {}) {
  const batidas = new Map()
  return function permitido(chave, agora = Date.now()) {
    const lista = (batidas.get(chave) || []).filter((t) => agora - t < janelaMs)
    if (lista.length >= max) {
      batidas.set(chave, lista)
      return false
    }
    lista.push(agora)
    batidas.set(chave, lista)
    if (batidas.size > 500) for (const [k, v] of batidas) if (!v.some((t) => agora - t < janelaMs)) batidas.delete(k)
    return true
  }
}
