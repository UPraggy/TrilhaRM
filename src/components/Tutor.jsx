import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { IcoEnviar, IcoTutor, IcoX } from './Icones.jsx'
import { api } from '../api.js'
import { useT } from '../i18n/index.jsx'

// O tutor: botão flutuante em TODA tela (inclusive dentro da lição). Um toque explica o que está na
// tela; o chat continua a conversa. Quem responde é server/tutor.js, pela mesma fila de modelos
// gratuitos do mentor — a key e o modelo são os de Ajustes.
//
// "Ver a tela" = o texto visível de <main id="conteudo"> no momento da pergunta, mais o que o aluno
// digitou nos campos e o trecho que ele selecionou. Nada disso sai do app a não ser para o OpenRouter.

const CHAVE_SESSAO = 'trilharm.tutor'
const MAX_GUARDADAS = 30
const MAX_TELA = 7000
const SELECAO_VALE_MS = 90_000

function lerSessao() {
  try {
    const v = JSON.parse(sessionStorage.getItem(CHAVE_SESSAO) || '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

function gravarSessao(msgs) {
  try {
    sessionStorage.setItem(CHAVE_SESSAO, JSON.stringify(msgs.slice(-MAX_GUARDADAS)))
  } catch {
    /* sem storage a conversa vale até fechar a aba */
  }
}

/** o que o tutor "vê": texto visível da tela + o que foi digitado nos campos (nunca em Ajustes) */
export function capturarTela(rota) {
  const main = document.getElementById('conteudo')
  let texto = main ? main.innerText || '' : ''
  if (main && rota !== '/config') {
    const digitado = [...main.querySelectorAll('textarea, input[type="text"], input:not([type])')]
      .map((el) => String(el.value || '').trim())
      .filter(Boolean)
    if (digitado.length) texto += `\n\n[o que o aluno digitou nos campos]\n${digitado.join('\n---\n')}`
  }
  return { rota, titulo: document.title || '', texto: texto.replace(/\n{3,}/g, '\n\n').slice(0, MAX_TELA) }
}

/** negrito e `código` dentro de uma linha, sem innerHTML */
function emLinha(texto, chave) {
  const partes = String(texto).split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  return partes.map((p, i) => {
    if (/^\*\*[^*]+\*\*$/.test(p)) return <b key={`${chave}-${i}`}>{p.slice(2, -2)}</b>
    if (/^`[^`]+`$/.test(p)) return <code key={`${chave}-${i}`}>{p.slice(1, -1)}</code>
    return p
  })
}

/** Markdown mínimo que o tutor usa: parágrafos, listas "- " / "1.", blocos ``` */
export function TextoRico({ texto }) {
  const blocos = []
  const linhas = String(texto || '').split('\n')
  let i = 0
  while (i < linhas.length) {
    const l = linhas[i]
    if (/^\s*```/.test(l)) {
      const corpo = []
      i += 1
      while (i < linhas.length && !/^\s*```/.test(linhas[i])) corpo.push(linhas[i++])
      i += 1
      blocos.push(<pre key={blocos.length}><code>{corpo.join('\n')}</code></pre>)
      continue
    }
    if (/^\s*([-*•]|\d+[.)])\s+/.test(l)) {
      const itens = []
      const numerada = /^\s*\d+[.)]/.test(l)
      while (i < linhas.length && /^\s*([-*•]|\d+[.)])\s+/.test(linhas[i])) itens.push(linhas[i++].replace(/^\s*([-*•]|\d+[.)])\s+/, ''))
      const Lista = numerada ? 'ol' : 'ul'
      blocos.push(
        <Lista key={blocos.length}>
          {itens.map((x, k) => (
            <li key={k}>{emLinha(x, `${blocos.length}-${k}`)}</li>
          ))}
        </Lista>,
      )
      continue
    }
    if (!l.trim()) {
      i += 1
      continue
    }
    const par = []
    while (i < linhas.length && linhas[i].trim() && !/^\s*```/.test(linhas[i]) && !/^\s*([-*•]|\d+[.)])\s+/.test(linhas[i])) par.push(linhas[i++].replace(/^#+\s*/, ''))
    blocos.push(<p key={blocos.length}>{emLinha(par.join(' '), blocos.length)}</p>)
  }
  return <>{blocos}</>
}

export default function Tutor({ imersivo = false }) {
  const { t, idioma } = useT()
  const { pathname } = useLocation()
  const [aberto, setAberto] = useState(false)
  const [mensagens, setMensagens] = useState(lerSessao)
  const [rascunho, setRascunho] = useState('')
  const [rodando, setRodando] = useState(null) // null | 'explicar' | 'chat'
  const [erro, setErro] = useState(null) // { codigo, mensagem }
  const [selecao, setSelecao] = useState(null) // { texto, quando }
  const fimRef = useRef(null)
  const campoRef = useRef(null)

  useEffect(() => gravarSessao(mensagens), [mensagens])

  // guarda o último trecho selecionado DENTRO da tela: no celular, tocar no botão limpa a seleção
  useEffect(() => {
    const aoSelecionar = () => {
      const s = window.getSelection && window.getSelection()
      const txt = s ? String(s).trim() : ''
      if (!txt || txt.length < 3) return
      const main = document.getElementById('conteudo')
      if (main && s.anchorNode && main.contains(s.anchorNode)) setSelecao({ texto: txt.slice(0, 1500), quando: Date.now() })
    }
    document.addEventListener('selectionchange', aoSelecionar)
    return () => document.removeEventListener('selectionchange', aoSelecionar)
  }, [])

  // trocar de tela descarta a seleção da tela anterior
  useEffect(() => setSelecao(null), [pathname])

  useEffect(() => {
    if (!aberto) return undefined
    const esc = (e) => e.key === 'Escape' && setAberto(false)
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [aberto])

  // resposta nova: rola para o COMEÇO dela (ler de cima); pergunta ou "pensando": para o fim
  const conversaRef = useRef(null)
  useEffect(() => {
    if (!aberto) return
    const ultima = mensagens[mensagens.length - 1]
    const caixa = conversaRef.current
    if (!rodando && ultima && ultima.papel === 'tutor' && caixa) {
      const balao = caixa.querySelectorAll('.tutor__msg--tutor')
      const alvo = balao[balao.length - 1]
      if (alvo) return void alvo.scrollIntoView({ block: 'start', behavior: 'smooth' })
    }
    if (fimRef.current) fimRef.current.scrollIntoView({ block: 'end' })
  }, [aberto, mensagens, rodando])

  const selecaoValida = selecao && Date.now() - selecao.quando < SELECAO_VALE_MS ? selecao.texto : ''

  const pedir = useCallback(
    async (acao, pergunta) => {
      const tela = { ...capturarTela(pathname), selecao: selecaoValida }
      const minha = acao === 'chat' ? { papel: 'eu', texto: pergunta, rota: pathname } : null
      const historico = minha ? [...mensagens, minha] : mensagens
      if (minha) setMensagens(historico)
      setRodando(acao)
      setErro(null)
      try {
        const r = await api.tutor({ acao, idioma, tela, mensagens: historico.map(({ papel, texto, rota }) => ({ papel, texto, rota })) })
        const resposta = { papel: 'tutor', texto: r.resposta, rota: pathname, modelo: r.modelo }
        if (acao === 'explicar') {
          const pedido = { papel: 'eu', texto: selecaoValida ? t('Explique o trecho selecionado') : t('Explique esta tela'), rota: pathname }
          setMensagens((m) => [...m, pedido, resposta])
        } else {
          setMensagens((m) => [...m, resposta])
        }
        setSelecao(null)
      } catch (e) {
        setErro({ codigo: e.codigo, mensagem: e.message })
      } finally {
        setRodando(null)
      }
    },
    [pathname, mensagens, idioma, selecaoValida, t],
  )

  const abrir = () => {
    setAberto(true)
    // primeira abertura numa tela sem conversa: já explica, que é o motivo de ter tocado no botão
    if (!mensagens.length && !rodando) pedir('explicar')
    setTimeout(() => campoRef.current && campoRef.current.focus({ preventScroll: true }), 50)
  }

  const enviar = (e) => {
    if (e) e.preventDefault()
    const p = rascunho.trim()
    if (!p || rodando) return
    setRascunho('')
    pedir('chat', p)
  }

  const aoTeclar = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) enviar(e)
  }

  const novaConversa = () => {
    setMensagens([])
    setErro(null)
  }

  return (
    <>
      {!aberto && (
        <button type="button" className={`tutor-fab ${imersivo ? 'tutor-fab--imersivo' : ''}`} onClick={abrir} aria-label={t('Chamar o tutor')} title={t('Chamar o tutor')}>
          <IcoTutor />
          <span className="tutor-fab__rotulo">{t('Tutor')}</span>
        </button>
      )}

      {aberto && (
        <div className="tutor-bg" onClick={() => setAberto(false)}>
          <section className="tutor" role="dialog" aria-modal="true" aria-label={t('Tutor')} onClick={(e) => e.stopPropagation()}>
            <header className="tutor__topo">
              <IcoTutor />
              <b className="tutor__titulo">{t('Tutor')}</b>
              <span className="dim small tutor__onde">{t('vendo esta tela')}</span>
              <button type="button" className="btn btn--sm btn--ghost" onClick={novaConversa} disabled={!mensagens.length || Boolean(rodando)}>
                {t('Nova conversa')}
              </button>
              <button type="button" className="iconbtn" onClick={() => setAberto(false)} aria-label={t('Fechar o tutor')}>
                <IcoX />
              </button>
            </header>

            <div className="tutor__conversa" aria-live="polite" ref={conversaRef}>
              {!mensagens.length && !rodando && (
                <p className="dim small">{t('Pergunte qualquer coisa sobre o que está na tela, sobre um conceito ou sobre como o app funciona.')}</p>
              )}
              {mensagens.map((m, i) => (
                <div key={i} className={`tutor__msg tutor__msg--${m.papel}`}>
                  {m.papel === 'tutor' ? <TextoRico texto={m.texto} /> : <p>{m.texto}</p>}
                  {m.papel === 'tutor' && m.modelo && <span className="tutor__modelo mono">{m.modelo}</span>}
                </div>
              ))}
              {rodando && (
                <div className="tutor__msg tutor__msg--tutor tutor__msg--pensando">
                  <p className="dim">{rodando === 'explicar' ? t('Lendo a tela…') : t('Pensando…')}</p>
                </div>
              )}
              {erro && (
                <div className="tutor__erro" role="alert">
                  <p>{erro.mensagem}</p>
                  {(erro.codigo === 'sem_key' || erro.codigo === 'key_invalida') && (
                    <Link to="/config" onClick={() => setAberto(false)}>
                      {t('Abrir Ajustes')}
                    </Link>
                  )}
                </div>
              )}
              <div ref={fimRef} />
            </div>

            {selecaoValida && (
              <div className="tutor__selecao small">
                <span className="dim">{t('Trecho selecionado:')}</span> <span className="tutor__selecao-txt">“{selecaoValida.slice(0, 120)}{selecaoValida.length > 120 ? '…' : ''}”</span>
                <button type="button" className="iconbtn" onClick={() => setSelecao(null)} aria-label={t('Descartar o trecho')}>
                  <IcoX />
                </button>
              </div>
            )}

            <div className="tutor__acoes">
              <button type="button" className="btn btn--sm" onClick={() => pedir('explicar')} disabled={Boolean(rodando)}>
                {selecaoValida ? t('Explicar o trecho') : t('Explicar esta tela')}
              </button>
            </div>

            <form className="tutor__form" onSubmit={enviar}>
              <textarea
                ref={campoRef}
                className="tutor__campo"
                rows={2}
                value={rascunho}
                onChange={(e) => setRascunho(e.target.value)}
                onKeyDown={aoTeclar}
                placeholder={t('Pergunte ao tutor…')}
                aria-label={t('Pergunta para o tutor')}
                maxLength={4000}
              />
              <button type="submit" className="btn btn--primary tutor__enviar" disabled={!rascunho.trim() || Boolean(rodando)} aria-label={t('Enviar')}>
                <IcoEnviar />
              </button>
            </form>
          </section>
        </div>
      )}
    </>
  )
}
