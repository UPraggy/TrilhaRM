// Mentor IA via OpenRouter (modelos gratuitos, DeepSeek primeiro).
// Config em data/config.json (escrita atômica temp + rename); OPENROUTER_API_KEY no ambiente sobrepõe a key do arquivo.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

// 'auto' = tenta a cadeia de modelos gratuitos em ordem ate um responder (os :free vivem saturando: 429/503).
export const MODELO_PADRAO = 'auto'
const OPENROUTER = 'https://openrouter.ai/api/v1'
const REFERER = 'https://github.com/UPraggy/TrilhaRM'
const TITULO_APP = 'Trilha RM'
const CACHE_MODELOS_MS = 60 * 60 * 1000
const TIMEOUT_AVALIAR_MS = 60_000
const TIMEOUT_MODELOS_MS = 15_000
const MAX_RESPOSTA = 6000

// Cadeia de gratuitos medida em 16/09/2026 (os :free do DeepSeek saíram do ar; esta lista e o socorro
// quando a listagem ao vivo do OpenRouter nao responde, e tambem a ordem de tentativa do modo 'auto').
const MODELOS_FALLBACK = [
  { id: 'nvidia/nemotron-3-super-120b-a12b:free', name: 'Nemotron 3 Super 120B (free)', context_length: 262144 },
  { id: 'nex-agi/nex-n2.5-pro:free', name: 'Nex N2.5 Pro (free)', context_length: 262144 },
  { id: 'inclusionai/ling-3.0-flash-vl:free', name: 'Ling 3.0 Flash VL (free)', context_length: 262144 },
  { id: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free', name: 'Nemotron 3 Nano Omni (free)', context_length: 256000 },
  { id: 'nvidia/nemotron-3.5-lightning:free', name: 'Nemotron 3.5 Lightning (free)', context_length: 1000000 },
  { id: 'inclusionai/ling-3.0-flash-fin:free', name: 'Ling 3.0 Flash Fin (free)', context_length: 262144 },
  { id: 'z-ai/glm-5.2:free', name: 'GLM 5.2 (free)', context_length: 32768 },
  { id: 'google/gemma-4-31b-it:free', name: 'Gemma 4 31B (free)', context_length: 262144 },
]
// ids que o OpenRouter lista como gratuitos mas recusam uso normal (so em 'agentic harness', so moderacao, etc.)
const MODELOS_VETADOS = /^(?:thinkingmachines\/|google\/lyria|nvidia\/nemotron-3\.5-content-safety|openrouter\/free$|stealth\/)/i

const ESCALA = '0 desconheço · 1 reconheço · 2 consigo explicar · 3 consigo aplicar · 4 consigo diagnosticar · 5 consigo ensinar/defender'

const SYSTEM_PROMPT =
  'Você é um mentor técnico nível Senior/Staff Software Engineer avaliando a resposta de um dev Full Stack Pleno a uma pergunta de entrevista. ' +
  'Não ensine do zero. Compare a resposta com o gabarito de profundidade. Classifique em Iniciante / Júnior / Pleno / Sênior / Staff. ' +
  `Sugira um nível 0–5 na escala: ${ESCALA}. ` +
  'Aponte o que faltou (máx 4 itens, objetivos), o que estava certo (máx 3), e faça UMA pergunta de aprofundamento mais difícil. ' +
  'Se a resposta foi em inglês, inclua `correcaoIngles` com até 3 correções curtas (erro → forma natural) sem virar aula de gramática; se foi em português, devolva `correcaoIngles` vazio. ' +
  "Não aceite resposta superficial: se ele só citou a ferramenta ('usaria Redis'), cobre o porquê. " +
  'Responda SOMENTE com JSON válido, sem markdown, no formato: ' +
  '{"classificacao":"Pleno","nivelSugerido":3,"certo":[],"faltou":[],"feedback":"2-4 frases diretas","perguntaAprofundamento":"...","correcaoIngles":[]}'

/** Carrega um .env simples (CHAVE=valor) sem sobrescrever o que já está no ambiente. Sem dependências. */
export function carregarEnv(arquivo) {
  let texto
  try {
    texto = fs.readFileSync(arquivo, 'utf8')
  } catch {
    certificadoDoAntivirus() // sem .env o certificado ainda precisa ser resolvido
    return
  }
  for (const linha of texto.split(/\r?\n/)) {
    const l = linha.trim()
    if (!l || l.startsWith('#')) continue
    const i = l.indexOf('=')
    if (i <= 0) continue
    const chave = l.slice(0, i).trim()
    let valor = l.slice(i + 1).trim()
    if ((valor.startsWith('"') && valor.endsWith('"')) || (valor.startsWith("'") && valor.endsWith("'"))) valor = valor.slice(1, -1)
    if (chave && process.env[chave] === undefined) process.env[chave] = valor
  }
  certificadoDoAntivirus()
}

/**
 * Antivirus que inspeciona HTTPS (Avast, Kaspersky, ESET...) reassina o certificado do OpenRouter e o
 * Node rejeita a conexao com um "fetch failed" seco. Se o CA do antivirus estiver no disco e ninguem
 * tiver definido NODE_EXTRA_CA_CERTS, apontamos para ele. Em maquina sem antivirus desses, nada acontece.
 * Definir a variavel em runtime funciona porque o TLS so le a lista de CAs na primeira conexao.
 */
export function certificadoDoAntivirus() {
  // 1) cofre de certificados do sistema operacional. No Windows e onde vive o certificado raiz que o
  //    antivirus (Avast/AVG/Kaspersky/ESET) instala para inspecionar HTTPS; sem ele o Node rejeita a
  //    conexao com "fetch failed / UNABLE_TO_VERIFY_LEAF_SIGNATURE". Em Linux/Android nao muda nada.
  try {
    const tls = require('node:tls')
    if (typeof tls.getCACertificates === 'function' && typeof tls.setDefaultCACertificates === 'function') {
      const sistema = tls.getCACertificates('system')
      if (sistema && sistema.length) {
        const juntos = [...new Set([...tls.getCACertificates('default'), ...sistema])]
        tls.setDefaultCACertificates(juntos)
        console.log('[trilharm] TLS: ' + sistema.length + ' certificados do sistema somados aos ' + juntos.length + ' confiaveis')
      }
    }
  } catch (e) {
    console.warn('[trilharm] nao consegui ler o cofre de certificados do sistema:', e.message)
  }

  // 2) alem disso, se o PEM do antivirus estiver no disco e ninguem tiver definido NODE_EXTRA_CA_CERTS,
  //    aponta para ele (cinto e suspensorio; em maquina sem antivirus desses nada acontece).
  if (process.platform !== 'win32' || process.env.NODE_EXTRA_CA_CERTS) return null
  const candidatos = [
    'C:\\ProgramData\\Avast Software\\Avast\\wscert.pem',
    'C:\\ProgramData\\AVG\\Antivirus\\wscert.pem',
  ]
  for (const c of candidatos) {
    try {
      if (fs.statSync(c).isFile()) {
        process.env.NODE_EXTRA_CA_CERTS = c
        console.log('[trilharm] TLS: usando tambem o certificado do antivirus:', c)
        return c
      }
    } catch {
      /* proximo */
    }
  }
  return null
}

function configVazia() {
  // `idioma` é a LÍNGUA DA INTERFACE (site, bot e cards). `idiomaFeedback` é só a do mentor.
  return { openrouterKey: '', modelo: MODELO_PADRAO, idiomaFeedback: 'pt', idioma: 'pt' }
}

export function mascararKey(key) {
  if (!key) return null
  const fim = key.slice(-4)
  const inicio = key.startsWith('sk-or-v1-') ? 'sk-or-v1-' : key.slice(0, 6)
  return `${inicio}…${fim}`
}

/** Extrai o primeiro bloco {...} balanceado de um texto (o DeepSeek R1 às vezes manda <think> antes). */
export function extrairJSON(texto) {
  if (typeof texto !== 'string') return null
  const limpo = texto.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```(?:json)?/gi, '').trim()
  try {
    const direto = JSON.parse(limpo)
    if (direto && typeof direto === 'object') return direto
  } catch {
    /* segue para o parser balanceado */
  }
  const ini = limpo.indexOf('{')
  if (ini < 0) return null
  let prof = 0
  let emStr = false
  let esc = false
  for (let i = ini; i < limpo.length; i++) {
    const c = limpo[i]
    if (emStr) {
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') emStr = false
      continue
    }
    if (c === '"') emStr = true
    else if (c === '{') prof += 1
    else if (c === '}') {
      prof -= 1
      if (prof === 0) {
        try {
          return JSON.parse(limpo.slice(ini, i + 1))
        } catch {
          return null
        }
      }
    }
  }
  return null
}

function normalizarAvaliacao(obj) {
  const lista = (v, max) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).slice(0, max) : [])
  const nivel = Number(obj.nivelSugerido)
  return {
    classificacao: typeof obj.classificacao === 'string' ? obj.classificacao.trim().slice(0, 40) : null,
    nivelSugerido: Number.isFinite(nivel) ? Math.max(0, Math.min(5, Math.round(nivel))) : null,
    certo: lista(obj.certo, 3),
    faltou: lista(obj.faltou, 4),
    feedback: typeof obj.feedback === 'string' ? obj.feedback.trim() : '',
    perguntaAprofundamento: typeof obj.perguntaAprofundamento === 'string' ? obj.perguntaAprofundamento.trim() : '',
    correcaoIngles: lista(obj.correcaoIngles, 3),
  }
}

function montarPromptUsuario(termo, resposta, idioma, idiomaFeedback) {
  const pergunta = idioma === 'en' && termo.perguntaEntrevistaEN ? termo.perguntaEntrevistaEN : termo.perguntaEntrevista
  const partes = [
    `TERMO: ${termo.termo}${termo.termoEN && termo.termoEN !== termo.termo ? ` (EN: ${termo.termoEN})` : ''}`,
    `NÍVEL ALVO DO TERMO (0–5): ${termo.nivelAlvo}`,
    `PERGUNTA DE ENTREVISTA (${idioma === 'en' ? 'em inglês' : 'em português'}): ${pergunta}`,
    '',
    `GABARITO — DEFINIÇÃO: ${termo.definicao}`,
    `GABARITO — PROFUNDIDADE: ${termo.profundidade || '(sem profundidade cadastrada; use seu critério de Staff)'}`,
    termo.exemplo ? `GABARITO — EXEMPLO:\n${termo.exemplo}` : '',
    '',
    `RESPOSTA DO CANDIDATO (${idioma === 'en' ? 'escrita em inglês' : 'escrita em português'}):\n"""\n${resposta}\n"""`,
    '',
    idiomaFeedback === 'en'
      ? 'Write `feedback`, `certo`, `faltou` and `perguntaAprofundamento` in English. Keep the JSON keys exactly as specified.'
      : 'Escreva `feedback`, `certo`, `faltou` e `perguntaAprofundamento` em português do Brasil. Mantenha as chaves do JSON exatamente como especificado.',
  ]
  return partes.filter((p) => p !== '').join('\n')
}

async function fetchComTimeout(url, opts, ms) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}

export function criarMentor({ arquivoConfig, repo, progresso }) {
  const dir = path.dirname(arquivoConfig)
  let config = null
  let filaEscrita = Promise.resolve()
  let cacheModelos = { quando: 0, lista: null }

  function carregar() {
    if (config) return config
    try {
      const bruto = JSON.parse(fs.readFileSync(arquivoConfig, 'utf8'))
      config = { ...configVazia(), ...(bruto && typeof bruto === 'object' ? bruto : {}) }
    } catch (e) {
      if (e.code !== 'ENOENT') console.warn('[mentor] config.json ilegível, usando padrão:', e.message)
      config = configVazia()
    }
    if (typeof config.openrouterKey !== 'string') config.openrouterKey = ''
    if (typeof config.modelo !== 'string' || !config.modelo) config.modelo = MODELO_PADRAO
    if (config.idiomaFeedback !== 'en') config.idiomaFeedback = 'pt'
    return config
  }

  function salvar() {
    const snapshot = JSON.stringify(config, null, 2)
    filaEscrita = filaEscrita.then(
      () =>
        new Promise((resolve) => {
          fs.mkdir(dir, { recursive: true }, () => {
            const tmp = `${arquivoConfig}.${process.pid}.${Date.now()}.tmp`
            fs.writeFile(tmp, snapshot, { encoding: 'utf8', mode: 0o600 }, (err) => {
              if (err) {
                console.error('[mentor] falha ao escrever temp:', err.message)
                return resolve()
              }
              fs.rename(tmp, arquivoConfig, (err2) => {
                if (err2) {
                  console.error('[mentor] falha no rename:', err2.message)
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

  /** key efetiva: ambiente > arquivo */
  function keyAtual() {
    const env = (process.env.OPENROUTER_API_KEY || '').trim()
    if (env) return { key: env, origem: 'env' }
    const c = carregar()
    if (c.openrouterKey) return { key: c.openrouterKey, origem: 'arquivo' }
    return { key: null, origem: null }
  }

  function obterConfig() {
    const c = carregar()
    const { key, origem } = keyAtual()
    return {
      temKey: Boolean(key),
      keyMascarada: mascararKey(key),
      origemKey: origem,
      modelo: c.modelo,
      modeloPadrao: MODELO_PADRAO,
      idiomaFeedback: c.idiomaFeedback,
      idioma: c.idioma || 'pt',
    }
  }

  /** aplica um patch; devolve { ok, erro? }. Key vazia/omitida mantém; "__apagar__" remove. */
  function salvarConfig(patch = {}) {
    const c = carregar()
    if (patch.openrouterKey !== undefined && patch.openrouterKey !== null) {
      const k = String(patch.openrouterKey).trim()
      if (k === '__apagar__') c.openrouterKey = ''
      else if (k) {
        if (!k.startsWith('sk-or-')) return { ok: false, erro: 'key inválida: deve começar com sk-or-' }
        if (k.length > 300 || /\s/.test(k)) return { ok: false, erro: 'key inválida' }
        c.openrouterKey = k
      }
    }
    if (patch.modelo !== undefined && patch.modelo !== null) {
      const m = String(patch.modelo).trim()
      if (m.length > 120 || !/^[\w.\-:/]*$/.test(m)) return { ok: false, erro: 'modelo inválido' }
      c.modelo = m || MODELO_PADRAO
    }
    if (patch.idiomaFeedback !== undefined && patch.idiomaFeedback !== null) {
      const l = String(patch.idiomaFeedback).trim().toLowerCase()
      if (l !== 'pt' && l !== 'en') return { ok: false, erro: 'idiomaFeedback deve ser pt ou en' }
      c.idiomaFeedback = l
    }
    if (patch.idioma !== undefined && patch.idioma !== null) {
      const l = String(patch.idioma).trim().toLowerCase()
      if (l !== 'pt' && l !== 'en') return { ok: false, erro: 'idioma deve ser pt ou en' }
      c.idioma = l
    }
    salvar()
    return { ok: true }
  }

  async function listarModelos() {
    const agora = Date.now()
    if (cacheModelos.lista && agora - cacheModelos.quando < CACHE_MODELOS_MS) return { modelos: cacheModelos.lista, fallback: false, cache: true }
    const { key } = keyAtual()
    const headers = { 'HTTP-Referer': REFERER, 'X-Title': TITULO_APP }
    if (key) headers.Authorization = `Bearer ${key}`
    try {
      const r = await fetchComTimeout(`${OPENROUTER}/models`, { headers }, TIMEOUT_MODELOS_MS)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const dados = await r.json()
      const todos = Array.isArray(dados && dados.data) ? dados.data : []
      const gratis = todos
        .filter((m) => m && m.pricing && String(m.pricing.prompt) === '0' && String(m.pricing.completion) === '0')
        .filter((m) => !MODELOS_VETADOS.test(m.id)) // gratuitos que recusam uso normal so poluem a lista
        .map((m) => ({ id: m.id, name: m.name || m.id, context_length: m.context_length || null }))
      const ehDeepseek = (m) => /deepseek/i.test(m.id)
      gratis.sort((a, b) => Number(ehDeepseek(b)) - Number(ehDeepseek(a)) || a.name.localeCompare(b.name))
      if (!gratis.length) throw new Error('lista vazia')
      cacheModelos = { quando: agora, lista: gratis }
      return { modelos: gratis, fallback: false, cache: false }
    } catch (e) {
      console.warn('[mentor] não consegui listar modelos do OpenRouter:', e.name === 'AbortError' ? 'timeout' : e.message)
      return { modelos: MODELOS_FALLBACK, fallback: true, cache: false }
    }
  }

  /**
   * Avalia a resposta do usuário. Devolve { status, corpo } - o router só repassa.
   */
  async function avaliar({ deckId, termoId, resposta, idioma }) {
    const { key } = keyAtual()
    if (!key) return { status: 400, corpo: { erro: 'sem_key', mensagem: 'Configure a key do OpenRouter em Configurações.' } }
    if (!deckId || !termoId) return { status: 400, corpo: { erro: 'parametros', mensagem: 'deckId e termoId são obrigatórios' } }
    const deck = repo.obter(String(deckId))
    if (!deck) return { status: 404, corpo: { erro: 'nao_encontrado', mensagem: 'deck não encontrado' } }
    const termo = deck.termos.find((t) => t.id === String(termoId))
    if (!termo) return { status: 404, corpo: { erro: 'nao_encontrado', mensagem: 'termo não encontrado' } }
    const texto = typeof resposta === 'string' ? resposta.trim().slice(0, MAX_RESPOSTA) : ''
    if (!texto) return { status: 400, corpo: { erro: 'parametros', mensagem: 'resposta vazia' } }
    const lingua = idioma === 'en' ? 'en' : 'pt'
    const c = carregar()

    const rr = await completar(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: montarPromptUsuario(termo, texto, lingua, c.idiomaFeedback) },
      ],
      900,
    )
    if (!rr.ok) return rr.resposta
    const modelo = rr.modelo // qual gratuito respondeu de fato (a fila pode ter trocado)
    const { conteudo, uso } = rr
    const obj = extrairJSON(conteudo || '')
    if (!obj) {
      console.warn(`[mentor] resposta do modelo ${modelo} não veio em JSON; devolvendo bruto`)
      return { status: 200, corpo: { bruto: String(conteudo || '').trim(), modelo, uso } }
    }
    const avaliacao = normalizarAvaliacao(obj)
    try {
      progresso.anexarAvaliacaoIA({ deckId: deck.id, termoId: termo.id, resposta: texto, avaliacao: { ...avaliacao, modelo, idioma: lingua } })
    } catch (e) {
      console.warn('[mentor] não gravou a avaliação no progresso:', e.message)
    }
    return { status: 200, corpo: { ...avaliacao, modelo, uso } }
  }

  /**
   * Chamada genérica ao chat/completions. Devolve { ok:true, conteudo, uso, modelo } ou
   * { ok:false, resposta:{ status, corpo } } já no formato que o router repassa.
   */
  async function completarNoModelo(modelo, messages, maxTokens) {
    const { key } = keyAtual()
    if (!key) return { ok: false, resposta: { status: 400, corpo: { erro: 'sem_key', mensagem: 'Configure a key do OpenRouter em Configurações.' } } }
    const body = { model: modelo, messages, temperature: 0.3, max_tokens: maxTokens }

    let r
    try {
      r = await fetchComTimeout(
        `${OPENROUTER}/chat/completions`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': REFERER,
            'X-Title': TITULO_APP,
          },
          body: JSON.stringify(body),
        },
        TIMEOUT_AVALIAR_MS,
      )
    } catch (e) {
      const timeout = e.name === 'AbortError'
      console.warn('[mentor] falha de rede ao chamar o OpenRouter:', timeout ? 'timeout 60s' : e.message)
      if (!timeout) console.warn('[mentor] detalhe:', e.cause ? (e.cause.code || e.cause.message || String(e.cause)) : 'sem cause', '| proxy:', process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy || 'nenhum', '| CA:', process.env.NODE_EXTRA_CA_CERTS || 'padrao')
      return {
        ok: false,
        resposta: {
          status: 502,
          corpo: { erro: timeout ? 'timeout' : 'rede', mensagem: timeout ? 'O mentor demorou mais de 60 s e a chamada foi cancelada.' : `Sem resposta do OpenRouter: ${e.message}` },
        },
      }
    }

    let dados = null
    const bruto = await r.text()
    try {
      dados = bruto ? JSON.parse(bruto) : null
    } catch {
      dados = null
    }

    const falha = (status, corpo) => ({ ok: false, resposta: { status, corpo } })
    if (!r.ok) {
      const msgApi = (dados && dados.error && (dados.error.message || dados.error.code)) || bruto.slice(0, 200) || `HTTP ${r.status}`
      console.warn(`[mentor] openrouter respondeu ${r.status} (modelo ${modelo}): ${String(msgApi).slice(0, 200)}`)
      if (r.status === 401) return falha(401, { erro: 'key_invalida', mensagem: 'A key do OpenRouter foi recusada (401). Confira em Configurações.' })
      if (r.status === 402) return falha(402, { erro: 'sem_credito', mensagem: 'Sem crédito no OpenRouter (402). Use um modelo :free ou adicione crédito.' })
      if (r.status === 429) return falha(429, { erro: 'rate_limit', mensagem: `Limite de uso do modelo gratuito (429). Espere um pouco ou troque o modelo. ${msgApi}`.trim() })
      return falha(502, { erro: 'openrouter', status: r.status, mensagem: String(msgApi) })
    }

    // OpenRouter devolve 200 com { error } em alguns casos (modelo indisponível etc.)
    if (dados && dados.error) {
      const msg = dados.error.message || dados.error.code || 'erro do OpenRouter'
      console.warn(`[mentor] openrouter (200 com error, modelo ${modelo}): ${String(msg).slice(0, 200)}`)
      const code = Number(dados.error.code)
      if (code === 429) return falha(429, { erro: 'rate_limit', mensagem: String(msg) })
      return falha(502, { erro: 'openrouter', status: code || 200, mensagem: String(msg) })
    }

    const conteudo = dados && dados.choices && dados.choices[0] && dados.choices[0].message ? dados.choices[0].message.content : ''
    const uso = dados && dados.usage ? { prompt: dados.usage.prompt_tokens, completion: dados.usage.completion_tokens } : null
    return { ok: true, conteudo, uso, modelo }
  }

  /** erro passageiro do provedor: vale tentar o proximo modelo gratuito da fila */
  function vaiAdiantarTrocarDeModelo(resposta) {
    const st = resposta && resposta.status
    const erro = (resposta && resposta.corpo && resposta.corpo.erro) || ''
    if (st === 429 || st === 502 || st === 503 || st === 404 || st === 403) return true
    return erro === 'rate_limit' || erro === 'openrouter' || erro === 'timeout'
  }

  /**
   * Chama o chat/completions. Com modelo 'auto' (padrao) percorre a fila de gratuitos ate um responder;
   * com modelo fixo, tenta ele primeiro e so cai para a fila se o provedor estiver fora do ar.
   * Devolve { ok:true, conteudo, uso, modelo, tentativas } ou { ok:false, resposta }.
   */
  async function completar(messages, maxTokens = 900) {
    const c = carregar()
    const escolhido = c.modelo || MODELO_PADRAO
    const fila = await filaDeModelos(escolhido)
    let ultima = null
    const tentativas = []
    for (const m of fila) {
      const r = await completarNoModelo(m, messages, maxTokens)
      if (r.ok) return { ...r, tentativas }
      tentativas.push({ modelo: m, erro: (r.resposta && r.resposta.corpo && r.resposta.corpo.erro) || 'falha' })
      ultima = r
      if (!vaiAdiantarTrocarDeModelo(r.resposta)) break // key invalida, sem credito, resposta vazia: trocar nao resolve
    }
    if (ultima && ultima.resposta && ultima.resposta.corpo && tentativas.length > 1) {
      ultima.resposta.corpo.tentativas = tentativas
      ultima.resposta.corpo.mensagem =
        (ultima.resposta.corpo.mensagem || 'falhou') + ' (tentei ' + tentativas.length + ' modelos gratuitos)'
    }
    return ultima || { ok: false, resposta: { status: 502, corpo: { erro: 'openrouter', mensagem: 'nenhum modelo gratuito disponivel agora' } } }
  }

  /** ordem de tentativa: o escolhido na frente, depois os gratuitos vivos (lista ao vivo, senao o fallback) */
  async function filaDeModelos(escolhido) {
    const { modelos } = await listarModelos()
    const ids = modelos.map((m) => m.id).filter((id) => !MODELOS_VETADOS.test(id))
    const ordem = MODELOS_FALLBACK.map((m) => m.id).filter((id) => ids.includes(id) || !ids.length)
    for (const id of ids) if (!ordem.includes(id)) ordem.push(id)
    if (escolhido && escolhido !== 'auto') return [escolhido, ...ordem.filter((id) => id !== escolhido)].slice(0, 5)
    return ordem.slice(0, 5)
  }

  /**
   * Avalia a entrega de um exercício prático (código, postmortem, texto) contra enunciado, critérios e gabarito.
   * Devolve { status, corpo } - o router só repassa. Não mexe no SM-2; grava a avaliação no histórico da prática.
   */
  async function avaliarPratica({ exercicio, chave, resposta }) {
    const texto = typeof resposta === 'string' ? resposta.trim().slice(0, MAX_RESPOSTA) : ''
    if (!texto) return { status: 400, corpo: { erro: 'parametros', mensagem: 'resposta vazia' } }
    const c = carregar()
    const ex = exercicio
    const partes = [
      `EXERCÍCIO: ${ex.titulo}`,
      `TERMOS EM JOGO: ${ex.termos.map((t) => t.termo).join(', ')}`,
      `NÍVEL ALVO (0–5): ${ex.nivel} · AMBIENTE: ${ex.ambiente}${ex.postmortem ? ' · É UM FAILURE LAB: a entrega deve seguir sintoma → evidência → causa → correção → o que muda no processo' : ''}`,
      '',
      `ENUNCIADO:\n${ex.enunciado}`,
      ex.passos.length ? `PASSOS SUGERIDOS:\n- ${ex.passos.join('\n- ')}` : '',
      '',
      `CRITÉRIOS DE UMA BOA ENTREGA:\n- ${ex.criterios.join('\n- ') || '(sem critérios cadastrados; use seu julgamento de Staff)'}`,
      `GABARITO (não revele literalmente; use para comparar):\n${ex.solucao || '(sem gabarito)'}`,
      '',
      `ENTREGA DO CANDIDATO:\n"""\n${texto}\n"""`,
      '',
      c.idiomaFeedback === 'en'
        ? 'Write `feedback`, `certo`, `faltou` and `perguntaAprofundamento` in English. Keep the JSON keys exactly as specified.'
        : 'Escreva `feedback`, `certo`, `faltou` e `perguntaAprofundamento` em português do Brasil. Mantenha as chaves do JSON exatamente como especificado.',
    ]
    const system =
      'Você é um mentor técnico nível Senior/Staff Software Engineer revisando a ENTREGA PRÁTICA de um dev Full Stack Pleno (código, medições, postmortem ou raciocínio de design) feita fora do app. ' +
      'Não ensine do zero. Verifique se a entrega cumpre os critérios e bate com o gabarito. Exija evidência (números medidos, saída de comando, plano do EXPLAIN) quando o enunciado pede medição: entrega sem evidência não passa de nível 2. ' +
      `Sugira um nível 0–5 na escala: ${ESCALA}. Classifique em Iniciante / Júnior / Pleno / Sênior / Staff. ` +
      'Aponte o que faltou (máx 4 itens, objetivos), o que estava certo (máx 3) e faça UMA pergunta de aprofundamento mais difícil ligada ao que ele entregou. ' +
      'Responda SOMENTE com JSON válido, sem markdown, no formato: ' +
      '{"classificacao":"Pleno","nivelSugerido":3,"certo":[],"faltou":[],"feedback":"2-4 frases diretas","perguntaAprofundamento":"...","correcaoIngles":[]}'

    const rr = await completar(
      [
        { role: 'system', content: system },
        { role: 'user', content: partes.filter((p) => p !== '').join('\n') },
      ],
      1000,
    )
    if (!rr.ok) return rr.resposta
    const { conteudo, uso, modelo } = rr // modelo = qual gratuito respondeu de fato
    const obj = extrairJSON(conteudo || '')
    if (!obj) {
      console.warn(`[mentor] (pratica) resposta do modelo ${modelo} não veio em JSON; devolvendo bruto`)
      return { status: 200, corpo: { bruto: String(conteudo || '').trim(), modelo, uso } }
    }
    const avaliacao = normalizarAvaliacao(obj)
    try {
      progresso.anexarAvaliacaoIAPratica({ chave, resposta: texto, avaliacao: { ...avaliacao, modelo } })
    } catch (e) {
      console.warn('[mentor] não gravou a avaliação da prática no progresso:', e.message)
    }
    return { status: 200, corpo: { ...avaliacao, modelo, uso } }
  }

  // `completar` sai daqui para server/entrevista.js: a fila de modelos gratuitos é a mesma
  return { obterConfig, salvarConfig, listarModelos, avaliar, avaliarPratica, completar, aguardarEscrita: () => filaEscrita }
}
