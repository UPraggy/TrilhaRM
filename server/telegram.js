// Bot de Telegram do Trilha RM — long polling puro com fetch, sem nenhuma dependência.
//
// O que ele resolve:
//   1. sempre sabe o link atual do app (o quick tunnel do Cloudflare troca de URL a cada restart:
//      tunnel.cjs grava em data/tunnel-url.txt e este módulo observa o arquivo e avisa no chat);
//   2. tem um menu de comandos (setMyCommands) para consultar revisão, práticas, treinos e cursos;
//   3. manda tarefa de estudo sozinho (lembrete no horário, ofensiva em risco, parabéns, deck que
//      passou de 70% em nível >= 3).
//
// Decisões que valem comentário:
// - Token em data/config.json (mesmo arquivo e mesmo padrão da key do OpenRouter: escrita atômica
//   temp + rename, 0600, nunca devolvido inteiro pela API). A escrita é read-modify-write: o
//   mentor.js também escreve nesse arquivo com um snapshot em memória, então relemos o disco na hora
//   de gravar e o tick reconcilia se alguém sobrescrever a chave.
// - chatId e o resto do estado em data/telegram.json (não é segredo, mas é pessoal e é gitignored).
// - 409 Conflict = outro processo fazendo polling do MESMO bot (o do AutoTrade, se o token for
//   reaproveitado). Nesse caso o polling PARA e o estado vira 'conflito' com o texto de socorro.
//   Nunca ficamos em loop de 409 — é o erro que quebra os dois bots ao mesmo tempo.
// - parse_mode 'HTML' com escape de & < > : é o que menos quebra (o MarkdownV2 do Telegram exige
//   escapar 18 caracteres e qualquer título de deck com '-' derruba a mensagem).
// - Desde os cards: as mensagens principais vão como sendPhoto (PNG gerado por server/cards.js) com
//   o texto na legenda (limite 1024). Se a imagem falhar por QUALQUER motivo — geração, rede, 400 do
//   Telegram — cai para o sendMessage de antes. O bot nunca fica mudo por causa de uma imagem.
import fs from 'node:fs'
import path from 'node:path'
import { cardHoje, cardLink, cardMatriz, cardOfensiva, cardSugestao, cardTreino } from './cards.js'
import { hojeISO, vencido } from './sm2.js'
import { criarI18n } from './i18n.js'

export const API_TELEGRAM = 'https://api.telegram.org'
const POLL_TIMEOUT_S = 50 // long polling: o Telegram segura a resposta até 50s
const MARGEM_TIMEOUT_MS = 15_000 // abort local = timeout do long poll + margem
const TIMEOUT_CURTO_MS = 20_000 // chamadas normais (sendMessage, getMe, setMyCommands)
const BACKOFF_MS = [1000, 2000, 5000, 10_000, 30_000, 60_000]
const LEMBRETE_PADRAO = '08:30'
const HORA_RISCO = 20 // a partir das 20h, se faltar avaliação, avisa que a ofensiva está em risco
const PCT_DECK_FORTE = 70 // % de termos em nível >= 3 que dispara o "deck dominado"
const MAX_TEXTO = 3800 // limite do Telegram é 4096; sobra para o rodapé
const MAX_LEGENDA = 1024 // limite duro da legenda do sendPhoto
const TIMEOUT_FOTO_MS = 45_000 // upload de PNG é mais lento que sendMessage
export const NOMES_CARDS = ['link', 'hoje', 'ofensiva', 'matriz', 'sugestao', 'treino']

export const MSG_409 =
  'Este token já está em uso por outro bot (provavelmente o do AutoTrade): o Telegram respondeu ' +
  '409 Conflict porque duas instâncias não podem fazer polling do mesmo bot. Crie um bot novo no ' +
  '@BotFather só para o Trilha RM e cole o token dele aqui.'

export const COMANDOS = [
  { command: 'link', description: 'URL pública atual do app' },
  { command: 'hoje', description: 'o que estudar hoje' },
  { command: 'revisar', description: 'termos vencidos, por deck' },
  { command: 'pratica', description: 'sugere um exercício prático' },
  { command: 'treino', description: 'sugere ou continua um Treino Especial' },
  { command: 'curso', description: 'continua a lição onde parei' },
  { command: 'matriz', description: 'nível médio, % >= 3 e vencidos' },
  { command: 'ofensiva', description: 'dias e quantas avaliações faltam hoje' },
  { command: 'lembrete', description: 'define o horário do lembrete (HH:MM)' },
  { command: 'parar', description: 'pausa os avisos automáticos' },
  { command: 'ajuda', description: 'lista os comandos' },
]

const TIPOS_SUGESTAO = ['pratica', 'treino', 'curso']

/** escape do parse_mode HTML do Telegram (só estes três importam) */
export function esc(v) {
  return String(v === null || v === undefined ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** 8123456789:AAH…Xy4Q — nunca devolve o token inteiro */
export function mascararToken(token) {
  if (!token) return null
  const t = String(token)
  const i = t.indexOf(':')
  const id = i > 0 ? t.slice(0, i) : t.slice(0, 6)
  return `${id}:…${t.slice(-4)}`
}

/** formato real de token do BotFather: <id numérico>:<35 chars> */
export function tokenValido(token) {
  return /^\d{5,}:[A-Za-z0-9_-]{20,}$/.test(String(token || '').trim())
}

/**
 * Corta o texto para caber na legenda do sendPhoto (1024). O corte é sempre em quebra de linha:
 * cada linha nossa fecha as tags que abre, então cortar no \n nunca deixa <b> pendurado — e tag
 * aberta faz o Telegram recusar a mensagem inteira com 400.
 */
export function legendaCurta(txt, limite = MAX_LEGENDA) {
  const s = String(txt === null || txt === undefined ? '' : txt)
  if (s.length <= limite) return s
  const corte = s.lastIndexOf('\n', limite - 2)
  return corte > 0 ? `${s.slice(0, corte)}\n…` : `${s.slice(0, limite - 1)}…`
}

/** 'HH:MM' -> { h, m } | null */
export function horarioValido(txt) {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(txt || '').trim())
  if (!m) return null
  return { h: Number(m[1]), m: Number(m[2]), texto: `${String(Number(m[1])).padStart(2, '0')}:${m[2]}` }
}

function estadoVazio() {
  return {
    versao: 1,
    offset: 0,
    chatId: null,
    chatNome: '',
    conectadoEm: null,
    lembrete: LEMBRETE_PADRAO,
    avisos: true,
    ultimaUrl: null,
    urlMudouEm: null,
    dia: null,
    enviados: {}, // lembrete | risco | parabens | sugestao (tipo)
    ultimoTipoSugestao: null,
    decksFortes: [], // decks que já renderam parabéns de 70%
  }
}

function minutos(d) {
  return d.getHours() * 60 + d.getMinutes()
}

export function criarTelegram({
  arquivoConfig,
  arquivoEstado,
  arquivoTunnel,
  repo,
  praticas,
  cursos,
  treinos,
  progresso,
  progTreinos = null,
  porta = 8790,
  apiBase = API_TELEGRAM,
  fetchImpl = null,
  agora = () => new Date(),
  log = (...a) => console.log('[telegram]', ...a),
} = {}) {
  // O bot e os cards falam a língua escolhida na interface. O tradutor LÊ o config a cada chamada
  // (server/i18n.js) porque o bot fica ligado por dias: trocar o idioma na tela precisa valer na
  // próxima mensagem, sem restart do PM2.
  const i18n = criarI18n(arquivoConfig)
  const dirConfig = path.dirname(arquivoConfig)
  const dirEstado = path.dirname(arquivoEstado)
  let filaEscrita = Promise.resolve()
  let st = null
  let tokenMemoria = null
  let bot = null // { id, username } depois do getMe
  let status = 'parado' // parado | sem-token | ligado | reconectando | conflito | token-invalido
  let erroAtual = null
  let ultimaAtividade = null
  let rodando = false
  let lacoAtivo = false
  let tickando = false
  let timerTick = null
  let esperaAtual = null
  const controladores = new Set()
  const buscar = (...a) => (fetchImpl || globalThis.fetch)(...a)

  // ---- estado (data/telegram.json) ---------------------------------------
  function carregarEstado() {
    if (st) return st
    try {
      const bruto = JSON.parse(fs.readFileSync(arquivoEstado, 'utf8'))
      st = { ...estadoVazio(), ...(bruto && typeof bruto === 'object' ? bruto : {}) }
    } catch (e) {
      if (e.code !== 'ENOENT') log('telegram.json ilegível, começando do zero:', e.message)
      st = estadoVazio()
    }
    if (!Number.isFinite(st.offset)) st.offset = 0
    if (st.chatId !== null && st.chatId !== undefined) st.chatId = String(st.chatId)
    if (!horarioValido(st.lembrete)) st.lembrete = LEMBRETE_PADRAO
    if (!st.enviados || typeof st.enviados !== 'object') st.enviados = {}
    if (!Array.isArray(st.decksFortes)) st.decksFortes = []
    st.avisos = st.avisos !== false
    return st
  }

  function escreverAtomico(arquivo, dir, conteudo, modo) {
    filaEscrita = filaEscrita.then(
      () =>
        new Promise((resolve) => {
          fs.mkdir(dir, { recursive: true }, () => {
            const tmp = `${arquivo}.${process.pid}.${Date.now()}.tmp`
            fs.writeFile(tmp, conteudo, { encoding: 'utf8', mode: modo }, (err) => {
              if (err) {
                log('falha ao escrever temp:', err.message)
                return resolve()
              }
              fs.rename(tmp, arquivo, (err2) => {
                if (err2) {
                  log('falha no rename:', err2.message)
                  fs.unlink(tmp, () => {})
                }
                resolve()
              })
            })
          })
        }),
    )
    return filaEscrita
  }

  function salvarEstado() {
    return escreverAtomico(arquivoEstado, dirEstado, JSON.stringify(carregarEstado(), null, 2), 0o600)
  }

  // ---- token (data/config.json, junto da key do OpenRouter) ---------------
  function lerConfigDoDisco() {
    try {
      const bruto = JSON.parse(fs.readFileSync(arquivoConfig, 'utf8'))
      return bruto && typeof bruto === 'object' ? bruto : {}
    } catch {
      return {}
    }
  }

  /** read-modify-write: o mentor.js escreve no mesmo arquivo com o snapshot dele em memória */
  function gravarNoConfig(patch) {
    const atual = lerConfigDoDisco()
    return escreverAtomico(arquivoConfig, dirConfig, JSON.stringify({ ...atual, ...patch }, null, 2), 0o600)
  }

  /** token efetivo: ambiente > arquivo */
  function tokenAtual() {
    const env = String(process.env.TELEGRAM_BOT_TOKEN || '').trim()
    if (env) return { token: env, origem: 'env' }
    const t = String(lerConfigDoDisco().telegramToken || '').trim()
    if (t) return { token: t, origem: 'arquivo' }
    return { token: null, origem: null }
  }

  // ---- HTTP do Telegram ---------------------------------------------------
  async function chamar(metodo, corpo = {}, ms = TIMEOUT_CURTO_MS) {
    const { token } = tokenAtual()
    if (!token) return { ok: false, codigo: 0, erro: 'sem token' }
    const ctrl = new AbortController()
    controladores.add(ctrl)
    const timer = setTimeout(() => ctrl.abort(), ms)
    try {
      const r = await buscar(`${apiBase}/bot${token}/${metodo}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
        signal: ctrl.signal,
      })
      const texto = await r.text()
      let dados = null
      try {
        dados = texto ? JSON.parse(texto) : null
      } catch {
        dados = null
      }
      if (!r.ok || !dados || dados.ok !== true) {
        const codigo = (dados && Number(dados.error_code)) || r.status || 0
        return { ok: false, codigo, erro: (dados && dados.description) || `HTTP ${r.status}` }
      }
      return { ok: true, resultado: dados.result }
    } catch (e) {
      const abortado = e && (e.name === 'AbortError' || e.code === 'ABORT_ERR')
      return { ok: false, codigo: 0, rede: true, abortado, erro: abortado ? 'timeout/abort' : e.message }
    } finally {
      clearTimeout(timer)
      controladores.delete(ctrl)
    }
  }

  /**
   * sendPhoto = multipart/form-data montado na mão (nada de FormData/Blob: em Node antigo o
   * Buffer vira "[object Object]" silenciosamente e o Telegram devolve 400 sem dizer por quê).
   */
  async function chamarFoto(campos, png, ms = TIMEOUT_FOTO_MS) {
    const { token } = tokenAtual()
    if (!token) return { ok: false, codigo: 0, erro: 'sem token' }
    const fronteira = `----trilharm${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
    const partes = []
    for (const [chave, valor] of Object.entries(campos)) {
      if (valor === undefined || valor === null) continue
      partes.push(Buffer.from(`--${fronteira}\r\nContent-Disposition: form-data; name="${chave}"\r\n\r\n${valor}\r\n`, 'utf8'))
    }
    partes.push(
      Buffer.from(
        `--${fronteira}\r\nContent-Disposition: form-data; name="photo"; filename="trilharm.png"\r\n` +
          'Content-Type: image/png\r\n\r\n',
        'utf8',
      ),
    )
    partes.push(png)
    partes.push(Buffer.from(`\r\n--${fronteira}--\r\n`, 'utf8'))
    const corpo = Buffer.concat(partes)
    const ctrl = new AbortController()
    controladores.add(ctrl)
    const timer = setTimeout(() => ctrl.abort(), ms)
    try {
      const r = await buscar(`${apiBase}/bot${token}/sendPhoto`, {
        method: 'POST',
        headers: { 'Content-Type': `multipart/form-data; boundary=${fronteira}`, 'Content-Length': String(corpo.length) },
        body: corpo,
        signal: ctrl.signal,
      })
      const texto = await r.text()
      let dados = null
      try {
        dados = texto ? JSON.parse(texto) : null
      } catch {
        dados = null
      }
      if (!r.ok || !dados || dados.ok !== true) {
        const codigo = (dados && Number(dados.error_code)) || r.status || 0
        return { ok: false, codigo, erro: (dados && dados.description) || `HTTP ${r.status}` }
      }
      return { ok: true, resultado: dados.result }
    } catch (e) {
      const abortado = e && (e.name === 'AbortError' || e.code === 'ABORT_ERR')
      return { ok: false, codigo: 0, rede: true, abortado, erro: abortado ? 'timeout/abort' : e.message }
    } finally {
      clearTimeout(timer)
      controladores.delete(ctrl)
    }
  }

  async function enviar(texto, { botoes = null, chatId = null } = {}) {
    const destino = chatId || carregarEstado().chatId
    if (!destino) return { ok: false, codigo: 0, erro: 'sem chat conectado' }
    const corpo = {
      chat_id: destino,
      text: String(texto).slice(0, MAX_TEXTO),
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }
    const teclado = (botoes || []).filter(Boolean)
    if (teclado.length) corpo.reply_markup = { inline_keyboard: teclado.map((l) => (Array.isArray(l) ? l : [l])) }
    const r = await chamar('sendMessage', corpo)
    if (!r.ok) log('sendMessage falhou:', r.codigo, r.erro)
    return r
  }

  async function enviarFoto(png, legenda, { botoes = null, chatId = null } = {}) {
    const destino = chatId || carregarEstado().chatId
    if (!destino) return { ok: false, codigo: 0, erro: 'sem chat conectado' }
    const campos = {
      chat_id: destino,
      caption: legendaCurta(legenda),
      parse_mode: 'HTML',
    }
    const teclado = (botoes || []).filter(Boolean)
    if (teclado.length) {
      campos.reply_markup = JSON.stringify({ inline_keyboard: teclado.map((l) => (Array.isArray(l) ? l : [l])) })
    }
    return chamarFoto(campos, png)
  }

  /**
   * Manda o card como foto com o texto na legenda; se a imagem não sair (geração quebrada, upload
   * recusado, rede fora) manda o MESMO texto por sendMessage. O `fazerPng` é preguiçoso de propósito:
   * erro na hora de desenhar não pode derrubar o aviso.
   */
  async function enviarCard(fazerPng, texto, { botoes = null, chatId = null } = {}) {
    let png = null
    try {
      png = fazerPng()
    } catch (e) {
      log('card não gerou, indo de texto:', e.message)
    }
    if (png && Buffer.isBuffer(png)) {
      const r = await enviarFoto(png, texto, { botoes, chatId })
      if (r.ok) return r
      log('sendPhoto falhou, indo de texto:', r.codigo, r.erro)
    }
    return enviar(texto, { botoes, chatId })
  }

  // ---- links --------------------------------------------------------------
  function urlDoTunel() {
    try {
      const u = fs.readFileSync(arquivoTunnel, 'utf8').trim()
      return u || null
    } catch {
      return null
    }
  }

  function base() {
    return urlDoTunel() || `http://127.0.0.1:${porta}`
  }

  function link(caminho = '/') {
    return base().replace(/\/+$/, '') + caminho
  }

  /**
   * Botão inline com URL. O Telegram recusa (BUTTON_URL_INVALID) URL de localhost/IP interno, então
   * sem túnel a gente devolve null e o link vai no texto da mensagem.
   */
  function botao(texto, caminho) {
    const url = link(caminho)
    if (!/^https:\/\//i.test(url)) return null
    return { text: texto, url }
  }

  function rodapeLink(caminho = '/') {
    const url = link(caminho)
    return /^https:\/\//i.test(url) ? '' : `\n<a href="${esc(url)}">${esc(url)}</a>`
  }

  // ---- leitura do progresso ----------------------------------------------
  function panorama() {
    const p = progresso.obter()
    const dia = hojeISO(agora())
    const decks = []
    let somaNivel = 0
    let comNivel = 0
    let acima3 = 0
    let totalTermos = 0
    let vencidosTotal = 0
    for (const d of repo.listar()) {
      let venc = 0
      let novos = 0
      let n3 = 0
      let soma = 0
      let vistos = 0
      for (const t of d.termos) {
        const est = p.termos[`${d.id}/${t.id}`]
        if (!est) {
          novos += 1
          continue
        }
        vistos += 1
        soma += Number(est.nivel) || 0
        if ((Number(est.nivel) || 0) >= 3) n3 += 1
        if (vencido(est, dia)) venc += 1
      }
      const total = d.termos.length
      decks.push({
        id: d.id,
        titulo: d.titulo,
        fase: d.fase,
        total,
        vistos,
        novos,
        vencidos: venc,
        nivelMedio: vistos ? soma / vistos : 0,
        pct3: total ? Math.round((n3 / total) * 100) : 0,
      })
      somaNivel += soma
      comNivel += vistos
      acima3 += n3
      totalTermos += total
      vencidosTotal += venc
    }
    return {
      dia,
      streak: p.streak,
      decks,
      totalTermos,
      vencidos: vencidosTotal,
      nivelMedio: comNivel ? somaNivel / comNivel : 0,
      pct3: totalTermos ? Math.round((acima3 / totalTermos) * 100) : 0,
      praticasFeitas: p.praticas || {},
      cursosEstado: p.cursos || {},
      historico: Array.isArray(p.historico) ? p.historico : [], // [{ dia, avaliacoes }] — alimenta o histograma
      novos: decks.reduce((soma, d) => soma + d.novos, 0),
    }
  }

  /** avaliações dos últimos 28 dias, com os dias sem estudo valendo 0 (o histograma precisa deles) */
  function ultimos28(pan) {
    const porDia = new Map((pan.historico || []).map((h) => [h.dia, Number(h.avaliacoes) || 0]))
    const fim = new Date(`${pan.dia}T12:00:00`)
    const saida = []
    for (let i = 27; i >= 0; i--) {
      const d = new Date(fim)
      d.setDate(d.getDate() - i)
      saida.push(porDia.get(hojeISO(d)) || 0)
    }
    return saida
  }

  /** % de termos em nível >= 3 por fase, ponderado pelo tamanho dos decks */
  function fasesDaMatriz(pan) {
    const porFase = new Map()
    for (const d of pan.decks) {
      const chave = Number.isFinite(d.fase) ? d.fase : 99
      if (!porFase.has(chave)) porFase.set(chave, { numero: chave, decks: 0, total: 0, acima3: 0 })
      const f = porFase.get(chave)
      f.decks += 1
      f.total += d.total
      f.acima3 += Math.round((d.pct3 / 100) * d.total)
    }
    return [...porFase.values()]
      .sort((a, b) => a.numero - b.numero)
      .map((f) => ({
        titulo: `Fase ${f.numero}`,
        detalhe: `${f.decks} deck${f.decks === 1 ? '' : 's'} · ${f.total} termos`,
        pct: f.total ? Math.round((f.acima3 / f.total) * 100) : 0,
      }))
  }

  /** nível-alvo da sugestão: perto do que ele já domina, nunca abaixo de 2 nem acima de 5 */
  function nivelDeConforto(pan) {
    const n = Math.round(pan.nivelMedio) + 1
    return Math.max(2, Math.min(5, n || 3))
  }

  function sugerirPratica(pan) {
    const feitas = pan.praticasFeitas
    const alvo = nivelDeConforto(pan)
    const candidatos = []
    for (const arq of praticas.listar()) {
      for (const ex of arq.exercicios) {
        const est = feitas[`${arq.deckId}/${ex.id}`]
        if (est && est.estado === 'concluida') continue
        candidatos.push({
          deckId: arq.deckId,
          deckTitulo: arq.deckTitulo,
          id: ex.id,
          titulo: ex.titulo,
          nivel: ex.nivel,
          tempoMin: ex.tempoMin,
          ambiente: ex.ambiente,
          emAndamento: Boolean(est && est.estado === 'andamento'),
        })
      }
    }
    if (!candidatos.length) return null
    candidatos.sort(
      (a, b) =>
        Number(b.emAndamento) - Number(a.emAndamento) ||
        Math.abs(a.nivel - alvo) - Math.abs(b.nivel - alvo) ||
        a.deckId.localeCompare(b.deckId) ||
        a.id.localeCompare(b.id),
    )
    return candidatos[0]
  }

  function sugerirTreino(pan) {
    const lista = treinos.listar()
    if (!lista.length) return null
    const alvo = nivelDeConforto(pan)
    const comResumo = lista.map((t) => {
      const r = progTreinos ? progTreinos.resumo(t) : null
      return {
        id: t.id,
        titulo: t.titulo,
        nivel: t.nivel,
        duracaoDias: t.duracaoDias,
        tempoTotalMin: t.tempoTotalMin,
        estado: r ? r.estado : 'nova',
        pct: r ? r.percentual : 0,
        concluidas: r ? r.concluidas : 0,
        total: t.etapas.length,
      }
    })
    const andamento = comResumo.find((t) => t.estado === 'andamento')
    if (andamento) return andamento
    const novos = comResumo.filter((t) => t.estado !== 'concluido')
    if (!novos.length) return null
    novos.sort((a, b) => Math.abs(a.nivel - alvo) - Math.abs(b.nivel - alvo) || a.id.localeCompare(b.id))
    return novos[0]
  }

  function sugerirCurso(pan) {
    const lista = cursos.listar()
    for (const c of lista) {
      const est = pan.cursosEstado[c.id] || null
      const licoes = (est && est.licoes) || {}
      const todas = c.modulos.flatMap((m) => m.licoes.map((l) => ({ id: l.id, titulo: l.titulo, moduloId: m.id })))
      if (!todas.length) continue
      const feitas = todas.filter((l) => licoes[l.id] && licoes[l.id].concluidaEm).length
      if (feitas >= todas.length) continue
      const ultima = est && est.ultimaLicao ? todas.find((l) => l.id === est.ultimaLicao) : null
      const faltando = todas.find((l) => !(licoes[l.id] && licoes[l.id].concluidaEm)) || null
      const continuar = (ultima && !(licoes[ultima.id] && licoes[ultima.id].concluidaEm) ? ultima : faltando) || faltando
      if (!continuar) continue
      return { cursoId: c.id, cursoTitulo: c.titulo, licaoId: continuar.id, licaoTitulo: continuar.titulo, feitas, total: todas.length }
    }
    return null
  }

  /** escolhe o tipo da sugestão do dia variando em relação a ontem */
  function sugestaoDoDia(pan, tipoForcado = null) {
    const ordem = tipoForcado
      ? [tipoForcado]
      : (() => {
          const i = TIPOS_SUGESTAO.indexOf(carregarEstado().ultimoTipoSugestao)
          const gira = TIPOS_SUGESTAO.slice(i + 1).concat(TIPOS_SUGESTAO.slice(0, i + 1))
          return i < 0 ? TIPOS_SUGESTAO : gira
        })()
    for (const tipo of ordem) {
      if (tipo === 'pratica') {
        const ex = sugerirPratica(pan)
        if (ex) return { tipo, dados: ex }
      } else if (tipo === 'treino') {
        const t = sugerirTreino(pan)
        if (t) return { tipo, dados: t }
      } else if (tipo === 'curso') {
        const c = sugerirCurso(pan)
        if (c) return { tipo, dados: c }
      }
    }
    return null
  }

  // ---- textos das mensagens ----------------------------------------------
  function blocoSugestao(s) {
    if (!s) return { texto: 'Sem sugestão nova: exercícios, treinos e lições estão todos concluídos. Bora revisar.', botao: botao('Revisar agora', '/estudar/misto?fonte=revisao') }
    if (s.tipo === 'pratica') {
      const d = s.dados
      const caminho = `/pratica/${encodeURIComponent(d.deckId)}/${encodeURIComponent(d.id)}`
      return {
        texto:
          `🧪 <b>Exercício${d.emAndamento ? ' (em andamento)' : ''}</b>\n` +
          `${esc(d.titulo)}\n` +
          `<i>${esc(d.deckTitulo)} · nível ${d.nivel} · ~${d.tempoMin} min · ${esc(d.ambiente)}</i>` +
          rodapeLink(caminho),
        botao: botao('Abrir exercício', caminho),
      }
    }
    if (s.tipo === 'treino') {
      const d = s.dados
      const caminho = `/treino/${encodeURIComponent(d.id)}`
      const dur = d.duracaoDias ? `${d.duracaoDias} dias` : `${d.tempoTotalMin} min`
      return {
        texto:
          `🏋️ <b>Treino Especial${d.estado === 'andamento' ? ' (continuar)' : ''}</b>\n` +
          `${esc(d.titulo)}\n` +
          `<i>nível ${d.nivel} · ${esc(dur)} · ${d.concluidas}/${d.total} etapas</i>` +
          rodapeLink(caminho),
        botao: botao(d.estado === 'andamento' ? 'Continuar treino' : 'Começar treino', caminho),
      }
    }
    const d = s.dados
    const caminho = `/curso/${encodeURIComponent(d.cursoId)}/licao/${encodeURIComponent(d.licaoId)}`
    return {
      texto:
        `📖 <b>Lição</b>\n${esc(d.licaoTitulo)}\n` +
        `<i>${esc(d.cursoTitulo)} · ${d.feitas}/${d.total} lições</i>` +
        rodapeLink(caminho),
      botao: botao('Continuar lição', caminho),
    }
  }

  function textoOfensiva(pan) {
    const s = pan.streak || {}
    const falta = Math.max(0, (s.minimoDia || 10) - (s.avaliacoesHoje || 0))
    const linha = falta
      ? `faltam <b>${falta}</b> avaliações hoje (${s.avaliacoesHoje || 0}/${s.minimoDia || 10})`
      : `dia fechado: ${s.avaliacoesHoje || 0}/${s.minimoDia || 10} ✅`
    return `🔥 <b>Ofensiva</b>: ${s.atual || 0} dia(s) · melhor ${s.melhor || 0}\n${linha}`
  }

  function textoHoje(pan) {
    const s = sugestaoDoDia(pan)
    const bs = blocoSugestao(s)
    const topo = [
      `📚 <b>Trilha RM · ${esc(pan.dia)}</b>`,
      `Vencidos: <b>${pan.vencidos}</b> termo(s) de ${pan.totalTermos}`,
      textoOfensiva(pan),
      '',
      bs.texto,
    ].join('\n')
    return { texto: topo, botoes: [[bs.botao, botao('Revisar', '/estudar/misto?fonte=revisao')].filter(Boolean)], tipo: s ? s.tipo : null }
  }

  function textoRevisar(pan) {
    const comVencidos = pan.decks.filter((d) => d.vencidos > 0).sort((a, b) => b.vencidos - a.vencidos)
    if (!comVencidos.length) {
      return { texto: '✅ Nada vencido agora. Bom momento para um exercício ou uma lição nova.', botoes: [] }
    }
    const linhas = comVencidos.slice(0, 10).map((d) => `· <b>${d.vencidos}</b> — ${esc(d.titulo)}`)
    const resto = comVencidos.length > 10 ? `\n<i>… e mais ${comVencidos.length - 10} deck(s)</i>` : ''
    const caminho = '/estudar/misto?fonte=revisao'
    return {
      texto: `♻️ <b>${pan.vencidos} termo(s) vencidos</b>\n${linhas.join('\n')}${resto}` + rodapeLink(caminho),
      botoes: [[botao('Revisar agora', caminho)].filter(Boolean)],
    }
  }

  function textoMatriz(pan) {
    const top = [...pan.decks].sort((a, b) => b.pct3 - a.pct3).slice(0, 5)
    const linhas = top.map((d) => `· ${esc(d.titulo)} — ${d.pct3}% ≥3 · nível ${d.nivelMedio.toFixed(1)} · ${d.vencidos} vencidos`)
    const caminho = '/matriz'
    return {
      texto:
        `📊 <b>Matriz</b>\nNível médio: <b>${pan.nivelMedio.toFixed(2)}</b> · ` +
        `${pan.pct3}% dos ${pan.totalTermos} termos em nível ≥3 · ${pan.vencidos} vencidos\n\n` +
        `<b>Decks mais fortes</b>\n${linhas.join('\n')}` +
        rodapeLink(caminho),
      botoes: [[botao('Abrir a matriz', caminho)].filter(Boolean)],
    }
  }

  function textoLink() {
    const u = urlDoTunel()
    if (!u) {
      return {
        texto:
          '🌐 <b>Sem túnel no ar agora.</b>\nO <code>cloudflared</code> não gravou nenhuma URL em ' +
          '<code>data/tunnel-url.txt</code>. Na LAN o app responde em ' +
          `<code>${esc(`http://127.0.0.1:${porta}`)}</code>.`,
        botoes: [],
      }
    }
    return {
      texto: `🌐 <b>Link atual do app</b>\n<a href="${esc(u)}">${esc(u)}</a>`,
      botoes: [[botao('Abrir o Trilha RM', '/'), botao('Revisar', '/estudar/misto?fonte=revisao')].filter(Boolean)],
    }
  }

  function textoAjuda() {
    const linhas = COMANDOS.map((c) => `/${c.command} — ${esc(c.description)}`)
    const e = carregarEstado()
    return {
      texto:
        `🤖 <b>Trilha RM</b>\n${linhas.join('\n')}\n\n` +
        `Lembrete diário: <b>${esc(e.lembrete)}</b> · avisos automáticos: <b>${e.avisos ? 'ligados' : 'pausados'}</b>`,
      botoes: [[{ text: '📚 Hoje', callback_data: 'cmd:hoje' }, { text: '♻️ Revisar', callback_data: 'cmd:revisar' }], [{ text: '🌐 Link', callback_data: 'cmd:link' }, { text: '🔥 Ofensiva', callback_data: 'cmd:ofensiva' }]],
    }
  }

  // ---- cards (PNG) --------------------------------------------------------
  // O card do link é o mais caro (QR + 800x418) e o mais repetido: fica em cache enquanto a URL não
  // mudar. Os outros dependem do progresso, que muda a cada avaliação — não vale cachear.
  let cacheCardLink = { url: null, png: null }

  function pngLink() {
    const u = urlDoTunel()
    const alvo = u || '' // sem túnel o card mostra o painel "sem QR": QR de 127.0.0.1 no celular não abre nada
    if (cacheCardLink.png && cacheCardLink.url === alvo) return cacheCardLink.png
    const png = cardLink(alvo, { t: i18n.t, nota: u ? 'túnel do cloudflared' : `LAN: 127.0.0.1:${porta}` })
    cacheCardLink = { url: alvo, png }
    return png
  }

  function pngHoje(pan) {
    const s = pan.streak || {}
    return cardHoje({ t: i18n.t,
      vencidos: pan.vencidos,
      novos: pan.novos,
      avaliacoesHoje: s.avaliacoesHoje || 0,
      minimoDia: s.minimoDia || 10,
      streak: s.atual || 0,
      dia: pan.dia,
    })
  }

  function pngOfensiva(pan) {
    const s = pan.streak || {}
    return cardOfensiva({ t: i18n.t, atual: s.atual || 0, melhor: s.melhor || 0, ultimos28: ultimos28(pan), minimoDia: s.minimoDia || 10 })
  }

  function pngMatriz(pan) {
    return cardMatriz({ t: i18n.t,
      fases: fasesDaMatriz(pan),
      nota: `nível médio ${pan.nivelMedio.toFixed(2)} · ${pan.pct3}% em nível ≥3`,
    })
  }

  function pngSugestao(s) {
    if (!s) {
      return cardSugestao({ t: i18n.t,
        tipo: 'pratica',
        titulo: 'Tudo concluído por aqui',
        subtitulo: 'exercícios, treinos e lições em dia — bom momento para revisar',
        nota: 'sem sugestão nova',
      })
    }
    const d = s.dados
    if (s.tipo === 'pratica') {
      return cardSugestao({ t: i18n.t,
        tipo: 'pratica',
        titulo: d.titulo,
        subtitulo: `${d.deckTitulo} · ambiente: ${d.ambiente}`,
        tempoMin: d.tempoMin,
        nivel: d.nivel,
        nota: d.emAndamento ? 'exercício em andamento' : 'sugestão do dia',
      })
    }
    if (s.tipo === 'treino') {
      const dur = d.duracaoDias ? `${d.duracaoDias} dias` : `${d.tempoTotalMin} min`
      return cardSugestao({ t: i18n.t,
        tipo: 'treino',
        titulo: d.titulo,
        subtitulo: `${dur} · ${d.concluidas}/${d.total} etapas concluídas`,
        nivel: d.nivel,
        nota: d.estado === 'andamento' ? 'temporada em andamento' : 'temporada nova',
      })
    }
    return cardSugestao({ t: i18n.t,
      tipo: 'curso',
      titulo: d.licaoTitulo,
      subtitulo: `${d.cursoTitulo} · ${d.feitas}/${d.total} lições`,
      nota: 'continuar de onde parei',
    })
  }

  /** treino: quem já começou vê o progresso da temporada; quem não começou vê o convite */
  function pngTreino(pan) {
    const t = sugerirTreino(pan)
    if (!t) return pngSugestao(null)
    if (t.estado === 'andamento' || t.concluidas > 0) {
      return cardTreino({ t: i18n.t,
        titulo: t.titulo,
        etapaAtual: t.concluidas,
        totalEtapas: t.total,
        pct: t.pct,
        nota: `nível ${t.nivel}`,
      })
    }
    return pngSugestao({ tipo: 'treino', dados: t })
  }

  /** um card por nome — é o que a rota GET /api/cards/:nome.png serve */
  function card(nome) {
    const chave = String(nome || '').toLowerCase()
    if (!NOMES_CARDS.includes(chave)) return { ok: false, erro: `card desconhecido: ${chave}` }
    try {
      if (chave === 'link') return { ok: true, png: pngLink() }
      const pan = panorama()
      if (chave === 'hoje') return { ok: true, png: pngHoje(pan) }
      if (chave === 'ofensiva') return { ok: true, png: pngOfensiva(pan) }
      if (chave === 'matriz') return { ok: true, png: pngMatriz(pan) }
      if (chave === 'sugestao') return { ok: true, png: pngSugestao(sugestaoDoDia(pan)) }
      return { ok: true, png: pngTreino(pan) }
    } catch (e) {
      log(`card ${chave} falhou:`, e.message)
      return { ok: false, erro: e.message }
    }
  }

  // ---- comandos -----------------------------------------------------------
  async function executarComando(cmd, args) {
    const e = carregarEstado()
    if (cmd === 'start') {
      e.avisos = true
      salvarEstado()
      const pan = panorama()
      const h = textoHoje(pan)
      await enviarCard(() => pngHoje(pan), `👋 Conectado. Eu aviso quando a URL do túnel mudar e mando a tarefa do dia.\n\n${h.texto}`, {
        botoes: h.botoes,
      })
      return
    }
    if (cmd === 'ajuda' || cmd === 'help' || cmd === 'menu') {
      const a = textoAjuda()
      return void (await enviar(a.texto, { botoes: a.botoes }))
    }
    if (cmd === 'link') {
      const l = textoLink()
      return void (await enviarCard(pngLink, l.texto, { botoes: l.botoes }))
    }
    if (cmd === 'hoje') {
      const pan = panorama()
      const h = textoHoje(pan)
      if (h.tipo) {
        e.ultimoTipoSugestao = h.tipo
        salvarEstado()
      }
      return void (await enviarCard(() => pngHoje(pan), h.texto, { botoes: h.botoes }))
    }
    if (cmd === 'revisar') {
      const r = textoRevisar(panorama())
      return void (await enviar(r.texto, { botoes: r.botoes }))
    }
    if (cmd === 'matriz') {
      const pan = panorama()
      const m = textoMatriz(pan)
      return void (await enviarCard(() => pngMatriz(pan), m.texto, { botoes: m.botoes }))
    }
    if (cmd === 'ofensiva') {
      const pan = panorama()
      return void (await enviarCard(() => pngOfensiva(pan), textoOfensiva(pan), {
        botoes: [[botao('Estudar', '/estudar/misto?fonte=tudo')].filter(Boolean)],
      }))
    }
    if (cmd === 'pratica' || cmd === 'treino' || cmd === 'curso') {
      const pan = panorama()
      const s = sugestaoDoDia(pan, cmd)
      const bs = blocoSugestao(s)
      if (s) {
        e.ultimoTipoSugestao = s.tipo
        salvarEstado()
      }
      // /treino de quem já começou mostra o progresso da temporada; o resto mostra o cartão da tarefa
      const fazer = cmd === 'treino' ? () => pngTreino(pan) : () => pngSugestao(s)
      return void (await enviarCard(fazer, bs.texto, { botoes: [[bs.botao].filter(Boolean)] }))
    }
    if (cmd === 'lembrete') {
      const h = horarioValido(args)
      if (!h) return void (await enviar('Use <code>/lembrete HH:MM</code> — por exemplo <code>/lembrete 08:30</code>.'))
      e.lembrete = h.texto
      e.avisos = true
      delete e.enviados.lembrete
      salvarEstado()
      return void (await enviar(`⏰ Lembrete diário às <b>${esc(h.texto)}</b>.`))
    }
    if (cmd === 'parar') {
      e.avisos = false
      salvarEstado()
      return void (await enviar('🔕 Avisos automáticos pausados. Os comandos continuam funcionando; <code>/lembrete HH:MM</code> ou /start religa.'))
    }
    const a = textoAjuda()
    await enviar(`Não conheço <code>/${esc(cmd)}</code>.\n\n${a.texto}`, { botoes: a.botoes })
  }

  // ---- updates ------------------------------------------------------------
  async function processarUpdate(u) {
    if (!u || typeof u !== 'object') return
    const e = carregarEstado()

    if (u.callback_query) {
      const q = u.callback_query
      const chatId = q.message && q.message.chat ? String(q.message.chat.id) : null
      await chamar('answerCallbackQuery', { callback_query_id: q.id })
      if (!e.chatId || chatId !== e.chatId) return // chat estranho: silêncio
      const dado = String(q.data || '')
      if (dado.startsWith('cmd:')) await executarComando(dado.slice(4).toLowerCase(), '')
      return
    }

    const msg = u.message || u.edited_message
    if (!msg || !msg.chat) return
    const chatId = String(msg.chat.id)
    const texto = String(msg.text || '').trim()
    const m = /^\/([a-zA-Z_]+)(?:@[\w_]+)?(?:\s+([\s\S]*))?$/.exec(texto)
    const cmd = m ? m[1].toLowerCase() : null
    const args = m ? String(m[2] || '').trim() : ''

    // sem chat conectado: só o /start do primeiro que falar conecta
    if (!e.chatId) {
      if (cmd !== 'start') return
      e.chatId = chatId
      e.chatNome = String(msg.from ? msg.from.first_name || msg.from.username || '' : msg.chat.title || '').slice(0, 80)
      e.conectadoEm = new Date().toISOString()
      salvarEstado()
      log('chat conectado:', chatId)
      await executarComando('start', '')
      return
    }

    if (chatId !== e.chatId) return // qualquer outro chat é ignorado em silêncio
    ultimaAtividade = new Date().toISOString()
    if (!cmd) {
      const a = textoAjuda()
      return void (await enviar(a.texto, { botoes: a.botoes }))
    }
    await executarComando(cmd, args)
  }

  // ---- tick (1x por minuto): túnel + tarefas proativas ---------------------
  function reconciliarToken() {
    // se alguém (mentor.js) reescreveu o config.json sem a nossa chave, devolvemos o token
    if (!tokenMemoria) return
    const disco = String(lerConfigDoDisco().telegramToken || '').trim()
    if (!disco) gravarNoConfig({ telegramToken: tokenMemoria })
  }

  async function avisarUrlNova(e) {
    const u = urlDoTunel()
    if (u === e.ultimaUrl) return false
    const anterior = e.ultimaUrl
    e.ultimaUrl = u
    e.urlMudouEm = new Date().toISOString()
    salvarEstado()
    if (!e.chatId) return false
    if (!u) {
      if (!anterior) return false
      await enviar('⚠️ O túnel caiu — sem URL pública no momento. Aviso quando voltar.')
      return true
    }
    const l = textoLink()
    await enviarCard(pngLink, `🔄 <b>URL nova do túnel</b>\n${l.texto.split('\n').slice(1).join('\n')}`, { botoes: l.botoes })
    return true
  }

  async function tick(quando = agora()) {
    if (tickando) return { pulou: true }
    tickando = true
    const feito = []
    try {
      const e = carregarEstado()
      const dia = hojeISO(quando)
      if (e.dia !== dia) {
        e.dia = dia
        e.enviados = {}
        salvarEstado()
      }
      reconciliarToken()
      if (await avisarUrlNova(e)) feito.push('url')
      if (!e.chatId || !e.avisos) return { feito }

      const agoraMin = minutos(quando)
      const alvo = horarioValido(e.lembrete)
      const pan = panorama()

      // 1. lembrete diário (a partir do horário; se o app estava desligado, manda quando voltar)
      if (alvo && !e.enviados.lembrete && agoraMin >= alvo.h * 60 + alvo.m) {
        const h = textoHoje(pan)
        const r = await enviarCard(() => pngHoje(pan), `⏰ <b>Hora de estudar</b>\n\n${h.texto}`, { botoes: h.botoes })
        if (r.ok) {
          e.enviados.lembrete = true
          if (h.tipo) {
            e.ultimoTipoSugestao = h.tipo
            e.enviados.sugestao = h.tipo
          }
          salvarEstado()
          feito.push('lembrete')
        }
      }

      // 2. ofensiva: parabéns quando fecha o dia, alerta quando está em risco
      const s = pan.streak || {}
      const minimo = s.minimoDia || 10
      const hoje = s.avaliacoesHoje || 0
      if (hoje >= minimo) {
        if (!e.enviados.parabens) {
          const r = await enviar(`🎉 <b>Dia fechado!</b> ${hoje}/${minimo} avaliações — ofensiva em <b>${s.atual || 0}</b> dia(s).`)
          if (r.ok) {
            e.enviados.parabens = true
            salvarEstado()
            feito.push('parabens')
          }
        }
      } else if (!e.enviados.risco && quando.getHours() >= HORA_RISCO) {
        const falta = minimo - hoje
        const caminho = pan.vencidos ? '/estudar/misto?fonte=revisao' : '/estudar/misto?fonte=tudo'
        const r = await enviarCard(
          () => pngOfensiva(pan),
          `⚠️ <b>Ofensiva em risco</b>\nFaltam <b>${falta}</b> avaliações para fechar o dia (${hoje}/${minimo}).` + rodapeLink(caminho),
          { botoes: [[botao('Salvar a ofensiva', caminho)].filter(Boolean)] },
        )
        if (r.ok) {
          e.enviados.risco = true
          salvarEstado()
          feito.push('risco')
        }
      }

      // 3. deck que passou de 70% em nível >= 3 (uma vez por deck)
      for (const d of pan.decks) {
        if (d.pct3 < PCT_DECK_FORTE || e.decksFortes.includes(d.id)) continue
        const caminho = `/deck/${encodeURIComponent(d.id)}`
        const r = await enviar(
          `🏆 <b>${esc(d.titulo)}</b> passou de ${PCT_DECK_FORTE}%: <b>${d.pct3}%</b> dos ${d.total} termos em nível ≥3 ` +
            `(nível médio ${d.nivelMedio.toFixed(1)}). Hora de puxar para o 4 — diagnosticar, não só aplicar.` +
            rodapeLink(caminho),
          { botoes: [[botao('Abrir o deck', caminho)].filter(Boolean)] },
        )
        if (r.ok) {
          e.decksFortes.push(d.id)
          salvarEstado()
          feito.push(`deck:${d.id}`)
        }
      }
      return { feito }
    } catch (err) {
      log('erro no tick:', err.message)
      return { erro: err.message }
    } finally {
      tickando = false
    }
  }

  // ---- polling ------------------------------------------------------------
  function esperar(ms) {
    return new Promise((resolve) => {
      const t = setTimeout(() => {
        esperaAtual = null
        resolve()
      }, ms)
      esperaAtual = () => {
        clearTimeout(t)
        esperaAtual = null
        resolve()
      }
    })
  }

  async function laco() {
    lacoAtivo = true
    let falhas = 0
    const e = carregarEstado()
    try {
      while (rodando) {
        const r = await chamar(
          'getUpdates',
          { offset: e.offset, timeout: POLL_TIMEOUT_S, allowed_updates: ['message', 'edited_message', 'callback_query'] },
          POLL_TIMEOUT_S * 1000 + MARGEM_TIMEOUT_MS,
        )
        if (!rodando) break
        if (r.ok) {
          falhas = 0
          status = 'ligado'
          erroAtual = null
          const updates = Array.isArray(r.resultado) ? r.resultado : []
          for (const u of updates) {
            if (Number.isFinite(u.update_id)) e.offset = Math.max(e.offset, u.update_id + 1)
            try {
              await processarUpdate(u)
            } catch (err) {
              log('falha ao tratar update:', err.message)
            }
          }
          if (updates.length) salvarEstado()
          continue
        }
        if (r.codigo === 409) {
          // ARMADILHA: token compartilhado com outro bot (AutoTrade). Parar é obrigatório: dois
          // pollings no mesmo token derrubam os dois. Nunca repetir a chamada.
          status = 'conflito'
          erroAtual = MSG_409
          rodando = false
          log('409 Conflict — polling PARADO.', MSG_409)
          break
        }
        if (r.codigo === 401 || r.codigo === 404) {
          status = 'token-invalido'
          erroAtual = 'Token recusado pelo Telegram (401/404). Confira o token com o @BotFather.'
          rodando = false
          log('token recusado:', r.erro)
          break
        }
        if (r.abortado && !rodando) break
        falhas += 1
        status = 'reconectando'
        erroAtual = r.erro
        const espera = BACKOFF_MS[Math.min(falhas - 1, BACKOFF_MS.length - 1)]
        log(`falha no getUpdates (${r.codigo || 'rede'}): ${r.erro} — nova tentativa em ${espera}ms`)
        await esperar(espera)
      }
    } finally {
      lacoAtivo = false
      if (status === 'ligado' || status === 'reconectando') status = 'parado'
    }
  }

  async function iniciar() {
    if (rodando) return { ok: true, estado: status }
    const { token } = tokenAtual()
    if (!token) {
      status = 'sem-token'
      erroAtual = null
      return { ok: false, estado: status, erro: 'sem token' }
    }
    tokenMemoria = token
    const eu = await chamar('getMe')
    if (!eu.ok) {
      if (eu.codigo === 409) {
        status = 'conflito'
        erroAtual = MSG_409
      } else if (eu.codigo === 401 || eu.codigo === 404) {
        status = 'token-invalido'
        erroAtual = 'Token recusado pelo Telegram (401/404). Confira o token com o @BotFather.'
      } else {
        status = 'reconectando'
        erroAtual = eu.erro
      }
      if (status === 'conflito' || status === 'token-invalido') return { ok: false, estado: status, erro: erroAtual }
    } else {
      bot = { id: eu.resultado.id, username: eu.resultado.username || null }
      await chamar('setMyCommands', { commands: COMANDOS })
    }
    rodando = true
    status = 'ligado'
    erroAtual = null
    carregarEstado()
    laco()
    if (!timerTick) {
      timerTick = setInterval(() => {
        tick().catch((e) => log('tick:', e.message))
      }, 60_000)
      if (timerTick.unref) timerTick.unref()
    }
    await tick()
    return { ok: true, estado: status, bot }
  }

  async function parar() {
    rodando = false
    if (timerTick) {
      clearInterval(timerTick)
      timerTick = null
    }
    if (esperaAtual) esperaAtual()
    for (const c of controladores) {
      try {
        c.abort()
      } catch {
        /* já abortado */
      }
    }
    controladores.clear()
    if (status === 'ligado' || status === 'reconectando') status = 'parado'
    await filaEscrita
    return { ok: true, estado: status }
  }

  // ---- config para a tela ------------------------------------------------
  function obterConfig() {
    const e = carregarEstado()
    const { token, origem } = tokenAtual()
    return {
      temToken: Boolean(token),
      tokenMascarado: mascararToken(token),
      origemToken: origem,
      estado: status,
      erro: erroAtual,
      conflito: status === 'conflito',
      dica409: status === 'conflito' ? MSG_409 : null,
      bot: bot ? { id: bot.id, username: bot.username } : null,
      chat: e.chatId ? { id: e.chatId, nome: e.chatNome, desde: e.conectadoEm } : null,
      lembrete: e.lembrete,
      avisos: e.avisos,
      tunnel: { url: urlDoTunel(), mudouEm: e.urlMudouEm },
      ultimaAtividade,
      rodando: lacoAtivo,
    }
  }

  /**
   * patch: { telegramToken?: 'novo'|'__apagar__', lembrete?: 'HH:MM', avisos?: boolean, chat?: '__apagar__' }
   * Trocar o token reinicia o polling; apagar o token para o bot.
   */
  async function salvarConfig(patch = {}) {
    const e = carregarEstado()
    let reiniciar = false
    if (patch.telegramToken !== undefined && patch.telegramToken !== null) {
      const t = String(patch.telegramToken).trim()
      if (t === '__apagar__') {
        tokenMemoria = null
        await gravarNoConfig({ telegramToken: '' })
        await parar()
        status = 'sem-token'
        erroAtual = null
        bot = null
      } else if (t) {
        if (!tokenValido(t)) return { ok: false, erro: 'token inválido: o formato do BotFather é 123456789:AA…' }
        tokenMemoria = t
        await gravarNoConfig({ telegramToken: t })
        reiniciar = true
      }
    }
    if (patch.lembrete !== undefined && patch.lembrete !== null) {
      const h = horarioValido(patch.lembrete)
      if (!h) return { ok: false, erro: 'horário inválido: use HH:MM' }
      e.lembrete = h.texto
      delete e.enviados.lembrete
      salvarEstado()
    }
    if (patch.avisos !== undefined && patch.avisos !== null) {
      e.avisos = Boolean(patch.avisos)
      salvarEstado()
    }
    if (patch.chat === '__apagar__') {
      e.chatId = null
      e.chatNome = ''
      e.conectadoEm = null
      salvarEstado()
    }
    if (reiniciar) {
      await parar()
      status = 'parado'
      erroAtual = null
      bot = null
      await iniciar()
    }
    return { ok: true, config: obterConfig() }
  }

  async function enviarTeste() {
    const e = carregarEstado()
    if (!e.chatId) return { ok: false, erro: 'nenhum chat conectado: mande /start para o bot no Telegram' }
    const l = textoLink()
    const r = await enviarCard(pngLink, `✅ <b>Teste do Trilha RM</b>\nSe você está lendo isso, o bot está ligado.\n\n${l.texto}`, {
      botoes: l.botoes,
    })
    return r.ok ? { ok: true } : { ok: false, erro: `${r.codigo || 'rede'}: ${r.erro}` }
  }

  return {
    iniciar,
    parar,
    tick,
    enviar,
    enviarFoto,
    enviarTeste,
    card, // { ok, png } — a rota GET /api/cards/:nome.png chama isto
    cards: NOMES_CARDS,
    obterConfig,
    salvarConfig,
    comandos: COMANDOS,
    estado: () => status,
    aguardarEscrita: () => filaEscrita,
    // usados pelos testes (harness da 8796) e por quem quiser inspecionar sem mexer no chat
    _interno: {
      panorama,
      textoHoje,
      textoLink,
      textoRevisar,
      textoMatriz,
      sugestaoDoDia,
      processarUpdate,
      carregarEstado,
      ultimos28,
      fasesDaMatriz,
      pngLink,
      pngHoje,
      pngOfensiva,
      pngMatriz,
      pngSugestao,
      pngTreino,
    },
  }
}
