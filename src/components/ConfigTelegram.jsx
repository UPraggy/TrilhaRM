import { useEffect, useRef, useState } from 'react'
import '../telegram.css'

/**
 * Bloco "Bot do Telegram" da tela /config.
 *
 * Auto-contido de propósito: fala com /api/telegram pelo helper daqui de baixo, então dá para
 * encaixar em src/pages/Config.jsx com uma linha (`<ConfigTelegram />`) sem mexer em src/api.js.
 * Se você preferir centralizar, INTEGRACAO-TELEGRAM.md tem as funções prontas para o api.js —
 * é só trocar `req(...)` por `api.telegram(...)`.
 *
 * O token nunca volta inteiro do servidor: a API devolve só `tokenMascarado`.
 */
async function req(url, opts) {
  const r = await fetch(url, { headers: { 'Content-Type': 'application/json', ...(opts && opts.headers) }, ...opts })
  const texto = await r.text()
  let dados = null
  try {
    dados = texto ? JSON.parse(texto) : null
  } catch {
    dados = { erro: texto }
  }
  if (!r.ok) {
    const e = new Error((dados && (dados.mensagem || dados.erro)) || `HTTP ${r.status}`)
    e.status = r.status
    throw e
  }
  return dados
}

const ROTULO_ESTADO = {
  parado: { texto: 'parado', classe: 'tg-chip--dim' },
  'sem-token': { texto: 'sem token', classe: 'tg-chip--amber' },
  ligado: { texto: 'ligado', classe: 'tg-chip--green' },
  reconectando: { texto: 'reconectando…', classe: 'tg-chip--amber' },
  conflito: { texto: 'erro 409 · token em uso', classe: 'tg-chip--rose' },
  'token-invalido': { texto: 'token recusado', classe: 'tg-chip--rose' },
}

export default function ConfigTelegram({ mostrarAviso }) {
  const [cfg, setCfg] = useState(null)
  const [erro, setErro] = useState(null)
  const [token, setToken] = useState('')
  const [hora, setHora] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [teste, setTeste] = useState(null) // { estado: 'rodando'|'ok'|'erro', texto }
  const montado = useRef(true)

  const avisar = (msg) => (mostrarAviso ? mostrarAviso(msg) : setTeste({ estado: 'ok', texto: msg }))

  const recarregar = () =>
    req('/api/telegram')
      .then((c) => {
        if (!montado.current) return
        setCfg(c)
        setErro(null)
        setHora((h) => h || c.lembrete || '')
      })
      .catch((e) => montado.current && setErro(e.message))

  useEffect(() => {
    montado.current = true
    recarregar()
    // enquanto espera o /start chegar do celular, vale reconsultar de vez em quando
    const t = setInterval(recarregar, 15000)
    return () => {
      montado.current = false
      clearInterval(t)
    }
  }, [])

  const aplicar = async (patch, msgOk) => {
    setSalvando(true)
    try {
      const r = await req('/api/telegram', { method: 'PUT', body: JSON.stringify(patch) })
      setCfg(r.config)
      if (msgOk) avisar(msgOk)
      return true
    } catch (e) {
      avisar(`Não salvou: ${e.message}`)
      return false
    } finally {
      setSalvando(false)
    }
  }

  const salvarToken = async () => {
    const t = token.trim()
    if (!t) return avisar('Cole o token antes de salvar.')
    if (!/^\d{5,}:[A-Za-z0-9_-]{20,}$/.test(t)) return avisar('O token do @BotFather tem o formato 123456789:AA…')
    if (await aplicar({ telegramToken: t }, 'Token salvo — ligando o bot.')) setToken('')
  }

  const removerToken = () => aplicar({ telegramToken: '__apagar__' }, 'Token removido, bot parado.')

  const religar = async () => {
    setSalvando(true)
    try {
      const r = await req('/api/telegram/iniciar', { method: 'POST', body: '{}' })
      setCfg(r.config)
    } catch (e) {
      avisar(`Não ligou: ${e.message}`)
    } finally {
      setSalvando(false)
    }
  }

  const testar = async () => {
    setTeste({ estado: 'rodando', texto: 'Mandando mensagem…' })
    try {
      const r = await req('/api/telegram/teste', { method: 'POST', body: '{}' })
      setTeste(r.ok ? { estado: 'ok', texto: 'Mensagem enviada — olha o Telegram.' } : { estado: 'erro', texto: r.erro || 'não enviou' })
    } catch (e) {
      setTeste({ estado: 'erro', texto: e.message })
    }
  }

  const estado = cfg ? ROTULO_ESTADO[cfg.estado] || { texto: cfg.estado, classe: 'tg-chip--dim' } : null
  const url = cfg && cfg.tunnel ? cfg.tunnel.url : null

  return (
    <div className="card tg-card">
      <div className="row row--between tg-topo">
        <h2>Bot do Telegram</h2>
        {estado && <span className={`chip mono tg-chip ${estado.classe}`}>{estado.texto}</span>}
      </div>
      <p className="muted small tg-intro">
        O bot avisa a URL nova do túnel sozinho, responde <code>/hoje</code>, <code>/revisar</code>, <code>/pratica</code> e manda a tarefa do dia
        no horário. Só o seu chat é atendido — qualquer outro é ignorado.
      </p>

      {erro && <p className="rose small">Não carregou: {erro}</p>}

      {cfg && cfg.conflito && (
        <div className="tg-alerta" role="alert">
          <b>409 Conflict — polling parado.</b>
          <span>{cfg.dica409}</span>
        </div>
      )}
      {cfg && !cfg.conflito && cfg.erro && <div className="tg-alerta tg-alerta--leve">{cfg.erro}</div>}

      <div className="campo">
        <label htmlFor="tg-token">{cfg && cfg.temToken ? 'Trocar o token' : 'Colar o token do @BotFather'}</label>
        <div className="campo__linha tg-linha">
          <input
            id="tg-token"
            className="input mono tg-input"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="123456789:AA…"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && salvarToken()}
          />
          <button className="btn btn--primary" onClick={salvarToken} disabled={salvando || !token.trim()}>
            Salvar
          </button>
          {cfg && cfg.temToken && cfg.origemToken === 'arquivo' && (
            <button className="btn btn--danger" onClick={removerToken} disabled={salvando}>
              Remover
            </button>
          )}
        </div>
        {cfg && (
          <span className="dim small mono tg-quebra">
            {cfg.temToken
              ? `${cfg.origemToken === 'env' ? 'via TELEGRAM_BOT_TOKEN · ' : ''}${cfg.tokenMascarado}${cfg.bot && cfg.bot.username ? ` · @${cfg.bot.username}` : ''}`
              : 'nenhum token configurado'}
          </span>
        )}
      </div>

      <div className="tg-grid">
        <div className="tg-box">
          <div className="tg-box__rotulo">Chat conectado</div>
          {cfg && cfg.chat ? (
            <>
              <div className="tg-box__valor">{cfg.chat.nome || 'você'}</div>
              <div className="dim small mono tg-quebra">id {cfg.chat.id}</div>
            </>
          ) : (
            <div className="tg-box__valor tg-amber">
              mande <code>/start</code> para o bot
              {cfg && cfg.bot && cfg.bot.username && (
                <>
                  {' '}
                  <a href={`https://t.me/${cfg.bot.username}`} target="_blank" rel="noreferrer">
                    abrir @{cfg.bot.username}
                  </a>
                </>
              )}
            </div>
          )}
        </div>

        <div className="tg-box">
          <div className="tg-box__rotulo">Lembrete diário</div>
          <div className="campo__linha tg-linha">
            <input
              className="input mono tg-input tg-input--hora"
              type="time"
              value={hora}
              onChange={(e) => setHora(e.target.value)}
              disabled={!cfg || salvando}
            />
            <button className="btn" onClick={() => aplicar({ lembrete: hora }, `Lembrete às ${hora}.`)} disabled={!cfg || salvando || !hora}>
              Salvar
            </button>
          </div>
          {cfg && (
            <label className="tg-check">
              <input type="checkbox" checked={Boolean(cfg.avisos)} disabled={salvando} onChange={(e) => aplicar({ avisos: e.target.checked })} />
              <span>avisos automáticos (lembrete, ofensiva, URL nova)</span>
            </label>
          )}
        </div>

        <div className="tg-box">
          <div className="tg-box__rotulo">Link do túnel agora</div>
          {url ? (
            <a className="tg-url mono" href={url} target="_blank" rel="noreferrer">
              {url}
            </a>
          ) : (
            <div className="tg-box__valor dim">sem túnel no ar (só LAN)</div>
          )}
          {cfg && cfg.tunnel && cfg.tunnel.mudouEm && <div className="dim small">mudou em {new Date(cfg.tunnel.mudouEm).toLocaleString()}</div>}
        </div>
      </div>

      <div className="tg-acoes">
        <button className="btn" onClick={testar} disabled={!cfg || !cfg.chat}>
          Mandar mensagem de teste
        </button>
        {cfg && cfg.temToken && (cfg.estado === 'parado' || cfg.estado === 'conflito' || cfg.estado === 'token-invalido') && (
          <button className="btn" onClick={religar} disabled={salvando}>
            Tentar ligar de novo
          </button>
        )}
      </div>
      {teste && (
        <div className={`feedback ${teste.estado === 'ok' ? 'ok' : teste.estado === 'erro' ? 'bad' : ''}`} role="status">
          {teste.texto}
        </div>
      )}

      <p className="dim small tg-rodape">
        O token fica só em <code>data/config.json</code> neste servidor (gitignored) e a API nunca devolve ele inteiro. Crie um bot <b>novo</b> no{' '}
        <a href="https://t.me/BotFather" target="_blank" rel="noreferrer">
          @BotFather
        </a>{' '}
        — reaproveitar o token de outro bot derruba os dois com 409.
      </p>
    </div>
  )
}
