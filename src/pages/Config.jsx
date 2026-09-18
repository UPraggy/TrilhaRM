import { useEffect, useState } from 'react'
import { useStore } from '../store.jsx'
import ConfigTelegram from '../components/ConfigTelegram.jsx'
import { obterConfig, salvarConfig, listarModelos, avaliarComMentor } from '../api.js'
import { useT } from '../i18n/index.jsx'

/**
 * /config - Mentor IA (OpenRouter): key (mascarada), modelo gratuito, idioma do feedback e teste.
 * Sem senha: o app roda atrás do túnel do dono. A key fica só em data/config.json no servidor.
 */
export default function Config() {
  const { termos, mostrarAviso } = useStore()
  const { t, idioma, trocar, idiomas } = useT()
  const [config, setConfig] = useState(null)
  const [erroConfig, setErroConfig] = useState(null)
  const [modelos, setModelos] = useState({ modelos: [], fallback: false, carregando: true })
  const [key, setKey] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [teste, setTeste] = useState(null) // { estado: 'rodando'|'ok'|'erro', texto }

  const recarregar = () =>
    obterConfig()
      .then((c) => {
        setConfig(c)
        setErroConfig(null)
      })
      .catch((e) => setErroConfig(e.message))

  useEffect(() => {
    recarregar()
    listarModelos()
      .then((r) => setModelos({ modelos: r.modelos || [], fallback: Boolean(r.fallback), carregando: false }))
      .catch(() => setModelos({ modelos: [], fallback: true, carregando: false }))
  }, [])

  const aplicar = async (patch, msgOk) => {
    setSalvando(true)
    try {
      const r = await salvarConfig(patch)
      setConfig(r.config)
      if (msgOk) mostrarAviso(msgOk)
      return true
    } catch (e) {
      mostrarAviso(`Não salvou: ${e.message}`, 4000)
      return false
    } finally {
      setSalvando(false)
    }
  }

  const salvarKey = async () => {
    const k = key.trim()
    if (!k) return mostrarAviso('Cole a key antes de salvar.')
    if (!k.startsWith('sk-or-')) return mostrarAviso('A key do OpenRouter começa com sk-or-…', 3500)
    if (await aplicar({ openrouterKey: k }, 'Key salva.')) setKey('')
  }

  const removerKey = () => aplicar({ openrouterKey: '__apagar__' }, 'Key removida.')

  const testar = async () => {
    const t = termos[0]
    if (!t) return setTeste({ estado: 'erro', texto: 'Sem termos carregados para testar.' })
    setTeste({ estado: 'rodando', texto: `Perguntando ao mentor sobre "${t.termo}"…` })
    try {
      const r = await avaliarComMentor({ deckId: t.deckId, termoId: t.id, resposta: 'teste', idioma: 'pt' })
      if (r.bruto) setTeste({ estado: 'ok', texto: `Respondeu (texto cru, sem JSON) via ${r.modelo}.` })
      else setTeste({ estado: 'ok', texto: `Funcionou · ${r.modelo} · classificou "teste" como ${r.classificacao || '?'} (nível ${r.nivelSugerido ?? '?'}).` })
    } catch (e) {
      setTeste({ estado: 'erro', texto: `${e.codigo ? `${e.codigo}: ` : ''}${e.message}` })
    }
  }

  const modeloAtual = config ? config.modelo : ''
  const lista = modelos.modelos
  const temAtualNaLista = lista.some((m) => m.id === modeloAtual)
  const deepseek = lista.filter((m) => /deepseek/i.test(m.id))
  const outros = lista.filter((m) => !/deepseek/i.test(m.id))

  return (
    <div className="page">
      <p className="kicker">{t('Perfil')}</p>
      <h1>{t('Ajustes')}</h1>

      {/* IDIOMA vem primeiro: é o ajuste que muda tudo o que está abaixo dele. */}
      <div className="card">
        <h2>{t('Idioma')}</h2>
        <p className="dim small">{t('A interface inteira, o bot do Telegram e os cards mudam junto.')}</p>
        <div className="acoes">
          {idiomas.map((l) => (
            <button
              key={l.id}
              type="button"
              className={`btn ${l.id === idioma ? 'btn--primary' : 'btn--ghost'}`}
              onClick={() => trocar(l.id)}
              aria-pressed={l.id === idioma}
            >
              {l.nome}
            </button>
          ))}
        </div>
      </div>

      <h2 className="secao">Mentor IA (OpenRouter)</h2>
      <p className="muted small" style={{ marginTop: 6 }}>
        No modo Explique e nas práticas de texto, um modelo gratuito lê sua resposta, compara com o gabarito e sugere o nível 0–5. No modo automático o app tenta os gratuitos em ordem até um responder — é o que mais funciona, porque os modelos livres vivem saturando.
      </p>

      {erroConfig && <p className="rose">Não carregou a configuração: {erroConfig}</p>}

      <div className="card" style={{ marginTop: 14 }}>
        <div className="row row--between">
          <h2>Key do OpenRouter</h2>
          {config && (
            <span className={`chip mono ${config.temKey ? 'chip--green' : 'chip--amber'}`}>
              {config.temKey ? (config.origemKey === 'env' ? `via .env · ${config.keyMascarada}` : config.keyMascarada) : 'não configurada'}
            </span>
          )}
        </div>
        {config && config.origemKey === 'env' && (
          <p className="dim small" style={{ marginTop: 8 }}>
            A variável <code>OPENROUTER_API_KEY</code> do ambiente está em uso e sobrepõe a key deste formulário.
          </p>
        )}
        <div className="campo">
          <label htmlFor="cfg-key">{config && config.temKey ? 'Trocar a key' : 'Colar a key'}</label>
          <div className="campo__linha">
            <input
              id="cfg-key"
              className="input mono"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="sk-or-v1-…"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && salvarKey()}
            />
            <button className="btn btn--primary" onClick={salvarKey} disabled={salvando || !key.trim()}>
              Salvar
            </button>
            {config && config.temKey && config.origemKey === 'arquivo' && (
              <button className="btn btn--danger" onClick={removerKey} disabled={salvando}>
                Remover
              </button>
            )}
          </div>
        </div>
        <p className="dim small" style={{ margin: '12px 0 0' }}>
          Crie uma key grátis em <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">openrouter.ai → Keys</a>. Modelos{' '}
          <code>:free</code> não cobram. A key fica só em <code>data/config.json</code> neste servidor.
        </p>
      </div>

      <div className="card">
        <h2>Modelo e idioma</h2>
        <div className="campo">
          <label htmlFor="cfg-modelo">
            Modelo gratuito{' '}
            {modelos.fallback && <span className="amber">· lista offline (não consegui falar com o OpenRouter)</span>}
            {modelos.carregando && <span className="dim">· carregando…</span>}
          </label>
          <select
            id="cfg-modelo"
            className="input"
            value={modeloAtual}
            disabled={!config || salvando || modelos.carregando}
            onChange={(e) => aplicar({ modelo: e.target.value }, 'Modelo salvo.')}
          >
            <option value="auto">Automático — tenta os gratuitos em ordem até um responder (recomendado)</option>
            {!temAtualNaLista && modeloAtual && modeloAtual !== 'auto' && <option value={modeloAtual}>{modeloAtual} (atual)</option>}
            {deepseek.length > 0 && (
              <optgroup label="DeepSeek · grátis (recomendado)">
                {deepseek.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} · grátis{m.context_length ? ` · ${Math.round(m.context_length / 1000)}k ctx` : ''}
                  </option>
                ))}
              </optgroup>
            )}
            {outros.length > 0 && (
              <optgroup label="Outros gratuitos">
                {outros.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} · grátis{m.context_length ? ` · ${Math.round(m.context_length / 1000)}k ctx` : ''}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <span className="dim small mono">{modeloAtual === 'auto' ? 'automático' : modeloAtual}</span>
        </div>
        <div className="campo">
          <label htmlFor="cfg-idioma">Idioma do feedback do mentor</label>
          <select
            id="cfg-idioma"
            className="input"
            value={config ? config.idiomaFeedback : 'pt'}
            disabled={!config || salvando}
            onChange={(e) => aplicar({ idiomaFeedback: e.target.value }, 'Idioma salvo.')}
          >
            <option value="pt">Português</option>
            <option value="en">English</option>
          </select>
        </div>
        <p className="dim small" style={{ margin: '12px 0 0' }}>
          A pergunta e a sua resposta seguem o toggle PT/EN do modo Explique; aqui é só a língua em que o mentor escreve.
          Modelos <code>:free</code> têm limite por minuto/dia e saem do ar sem aviso. No modo <b>automático</b> o app já tenta o próximo da fila sozinho; a resposta diz qual modelo respondeu.
        </p>
      </div>

      <div className="card">
        <div className="row row--between">
          <h2>Testar</h2>
          <button className="btn" onClick={testar} disabled={!config || !config.temKey || (teste && teste.estado === 'rodando')}>
            {teste && teste.estado === 'rodando' ? 'Testando…' : 'Testar'}
          </button>
        </div>
        <p className="muted small" style={{ marginTop: 8 }}>
          Envia a resposta "teste" para o primeiro termo carregado e mostra se o mentor respondeu.
          {config && !config.temKey ? ' Salve uma key primeiro.' : ''}
        </p>
        {teste && (
          <div className={`feedback ${teste.estado === 'ok' ? 'ok' : teste.estado === 'erro' ? 'bad' : ''}`} role="status">
            {teste.estado === 'rodando' ? <span className="mentor__lendo">{teste.texto}</span> : teste.texto}
          </div>
        )}
      </div>

      <ConfigTelegram mostrarAviso={mostrarAviso} />

      <p className="dim small" style={{ marginTop: 14 }}>
        Esta tela não tem senha — o app roda atrás do túnel do dono. A key nunca é devolvida inteira pela API (só os 4 últimos caracteres).
      </p>
    </div>
  )
}
