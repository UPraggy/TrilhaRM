// A porta de entrada: sem sessão, o app mostra Entrar / Criar conta; com sessão, o resto do app
// (StoreProvider incluso) monta DEPOIS — assim ele já carrega a trajetória de quem entrou.
// Trocar de conta desmonta e remonta tudo pela `key`: nenhum dado de uma pessoa sobra na tela da outra.
import { Fragment, createContext, useCallback, useContext, useEffect, useState } from 'react'
import Logo from './components/Logo.jsx'
import { api } from './api.js'
import { useT } from './i18n/index.jsx'

const Ctx = createContext(null)

export function useSessao() {
  return useContext(Ctx) || { usuario: null, sair: () => {} }
}

export function Sessao({ children }) {
  const [estado, setEstado] = useState({ carregando: true, usuario: null, contas: null })

  const conferir = useCallback(async () => {
    try {
      const r = await api.authEu()
      setEstado({ carregando: false, usuario: r.usuario, contas: null })
    } catch (e) {
      const contas = e.dados && typeof e.dados.temContas === 'boolean' ? e.dados : await api.authEstado().catch(() => null)
      setEstado({ carregando: false, usuario: null, contas })
    }
  }, [])

  useEffect(() => {
    conferir()
    const semSessao = () => conferir()
    window.addEventListener('trilha:sem-sessao', semSessao)
    return () => window.removeEventListener('trilha:sem-sessao', semSessao)
  }, [conferir])

  const sair = useCallback(async () => {
    await api.authSair().catch(() => {})
    try {
      // a conversa do tutor é da pessoa, não do aparelho
      for (const k of Object.keys(sessionStorage)) if (k.startsWith('trilharm.tutor')) sessionStorage.removeItem(k)
    } catch {
      /* sem storage */
    }
    conferir()
  }, [conferir])

  if (estado.carregando) return <div className="entrada entrada--carregando" aria-busy="true" />
  if (!estado.usuario) return <Entrada contas={estado.contas} aoEntrar={(usuario) => setEstado({ carregando: false, usuario, contas: null })} />
  return (
    <Ctx.Provider value={{ usuario: estado.usuario, sair }}>
      <Fragment key={estado.usuario.id}>{children}</Fragment>
    </Ctx.Provider>
  )
}

function Entrada({ contas, aoEntrar }) {
  const { t } = useT()
  const primeira = Boolean(contas && contas.precisaCodigo)
  const podeCadastrar = !contas || contas.cadastroAberto
  const [modo, setModo] = useState(primeira ? 'cadastrar' : 'entrar')
  const [campos, setCampos] = useState({ nome: '', login: '', senha: '', codigo: '' })
  const [erro, setErro] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const mudar = (k) => (e) => setCampos((c) => ({ ...c, [k]: e.target.value }))

  const enviar = async (e) => {
    e.preventDefault()
    setErro(null)
    setEnviando(true)
    try {
      const r = modo === 'entrar' ? await api.authEntrar({ login: campos.login, senha: campos.senha }) : await api.authCadastrar(campos)
      aoEntrar(r.usuario)
    } catch (err) {
      setErro(err.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <main className="entrada">
      <form className="entrada__cartao" onSubmit={enviar}>
        <div className="entrada__marca">
          <Logo className="brand__logo" />
          <span className="brand__name">
            Trilha <span>RM</span>
          </span>
        </div>
        <h1 className="entrada__titulo">{modo === 'entrar' ? t('Entrar') : primeira ? t('Criar a conta do dono') : t('Criar conta')}</h1>
        <p className="dim small">
          {primeira
            ? t('Esta é a primeira conta: ela herda todo o progresso que já existe no app. Use o código do dono que chegou no bot do Telegram (ou está em data/codigo-dono.txt).')
            : t('Cada conta guarda a própria trajetória: lições, XP, ofensiva, diário e entrevistas.')}
        </p>

        {!primeira && podeCadastrar && (
          <div className="toggle entrada__abas" role="tablist">
            <button type="button" role="tab" aria-selected={modo === 'entrar'} className={modo === 'entrar' ? 'active' : ''} onClick={() => setModo('entrar')}>
              {t('Entrar')}
            </button>
            <button type="button" role="tab" aria-selected={modo === 'cadastrar'} className={modo === 'cadastrar' ? 'active' : ''} onClick={() => setModo('cadastrar')}>
              {t('Criar conta')}
            </button>
          </div>
        )}

        {modo === 'cadastrar' && (
          <label className="entrada__campo">
            <span>{t('Seu nome')}</span>
            <input value={campos.nome} onChange={mudar('nome')} autoComplete="name" required minLength={2} maxLength={60} />
          </label>
        )}
        <label className="entrada__campo">
          <span>{t('Usuário')}</span>
          <input value={campos.login} onChange={mudar('login')} autoComplete="username" autoCapitalize="none" spellCheck={false} required minLength={3} maxLength={32} />
        </label>
        <label className="entrada__campo">
          <span>{t('Senha')}</span>
          <input
            type="password"
            value={campos.senha}
            onChange={mudar('senha')}
            autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'}
            required
            minLength={modo === 'entrar' ? 1 : 8}
          />
        </label>
        {modo === 'cadastrar' && primeira && (
          <label className="entrada__campo">
            <span>{t('Código do dono')}</span>
            <input value={campos.codigo} onChange={mudar('codigo')} autoCapitalize="characters" spellCheck={false} required />
          </label>
        )}

        {erro && (
          <p className="entrada__erro" role="alert">
            {erro}
          </p>
        )}

        <button type="submit" className="btn btn--primary btn--block btn--lg" disabled={enviando}>
          {enviando ? t('Um instante…') : modo === 'entrar' ? t('Entrar') : t('Criar conta')}
        </button>
        {!podeCadastrar && <p className="dim small">{t('O cadastro de novas contas está fechado pelo dono do app.')}</p>}
      </form>
    </main>
  )
}
