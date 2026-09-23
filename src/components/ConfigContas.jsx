import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { useT } from '../i18n/index.jsx'
import { useSessao } from '../sessao.jsx'

/** Ajustes → Conta: trocar a senha (todos) e, para o dono, quem tem conta e se o cadastro está aberto */
export default function ConfigContas({ mostrarAviso }) {
  const { t, data } = useT()
  const { usuario } = useSessao()
  const ehDono = usuario && usuario.papel === 'dono'
  const [senhas, setSenhas] = useState({ atual: '', nova: '' })
  const [lista, setLista] = useState(null)

  useEffect(() => {
    if (ehDono) api.authUsuarios().then(setLista).catch(() => setLista(null))
  }, [ehDono])

  const trocar = async (e) => {
    e.preventDefault()
    try {
      await api.authSenha(senhas)
      setSenhas({ atual: '', nova: '' })
      mostrarAviso(t('Senha trocada. As outras sessões desta conta foram encerradas.'), 3500)
    } catch (err) {
      mostrarAviso(err.message, 4000)
    }
  }

  const alternarCadastro = async () => {
    try {
      const r = await api.authCadastro(!lista.cadastroAberto)
      setLista((l) => ({ ...l, cadastroAberto: r.cadastroAberto }))
    } catch (err) {
      mostrarAviso(err.message, 4000)
    }
  }

  return (
    <>
      <h2 className="secao">{t('Conta')}</h2>
      <form className="card stack-sm" onSubmit={trocar}>
        <h2>{t('Trocar senha')}</h2>
        <label className="entrada__campo">
          <span>{t('Senha atual')}</span>
          <input type="password" autoComplete="current-password" value={senhas.atual} onChange={(e) => setSenhas((s) => ({ ...s, atual: e.target.value }))} required />
        </label>
        <label className="entrada__campo">
          <span>{t('Senha nova (8+ caracteres)')}</span>
          <input type="password" autoComplete="new-password" minLength={8} value={senhas.nova} onChange={(e) => setSenhas((s) => ({ ...s, nova: e.target.value }))} required />
        </label>
        <div className="acoes">
          <button type="submit" className="btn">
            {t('Trocar senha')}
          </button>
        </div>
      </form>

      {ehDono && lista && (
        <div className="card">
          <div className="row row--between">
            <h2>{t('Contas no app')}</h2>
            <button type="button" className={`btn btn--sm ${lista.cadastroAberto ? 'btn--ok' : 'btn--bad'}`} onClick={alternarCadastro} aria-pressed={lista.cadastroAberto}>
              {lista.cadastroAberto ? t('Cadastro aberto') : t('Cadastro fechado')}
            </button>
          </div>
          <p className="dim small">{t('Com o cadastro aberto, qualquer pessoa com o link do túnel cria uma conta. Cada uma tem a própria trajetória e usa a sua key do OpenRouter no mentor e no tutor.')}</p>
          <ul className="contas">
            {lista.usuarios.map((u) => (
              <li key={u.id}>
                <span className="perfil__avatar perfil__avatar--sm" aria-hidden="true">
                  {u.nome.slice(0, 1).toUpperCase()}
                </span>
                <b>{u.nome}</b>
                <span className="dim small mono">@{u.login}</span>
                <span className="dim small ml-auto">{u.papel === 'dono' ? t('dono') : data(u.criadoEm)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}
