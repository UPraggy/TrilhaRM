import { useEffect } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import Logo from './Logo.jsx'
import Tutor from './Tutor.jsx'
import { IcoBusca, IcoChama } from './Icones.jsx'
import { PRINCIPAL, ehImersiva } from '../nav.js'
import { useStore } from '../store.jsx'
import { useT } from '../i18n/index.jsx'

export function Streak() {
  const { progresso } = useStore()
  const { t } = useT()
  const s = progresso.streak || {}
  const on = (s.atual || 0) > 0
  const falta = Math.max(0, (s.minimoDia || 10) - (s.avaliacoesHoje || 0))
  const titulo = s.hojeContou
    ? t('Hoje já contou. Melhor sequência: {n} dias.', { n: s.melhor || 0 })
    : t('Faltam {f} avaliações hoje para manter a ofensiva. Melhor: {n} dias.', { f: falta, n: s.melhor || 0 })
  return (
    <Link to="/perfil" className={`streak ${on ? 'on' : ''}`} title={titulo} aria-label={`${t('Ofensiva')}: ${s.atual || 0}. ${titulo}`}>
      <IcoChama />
      <b>{s.atual || 0}</b>
      <span className="dim">{s.atual === 1 ? t('dia') : t('dias')}</span>
      {!s.hojeContou && <span className="dim mono small">· {s.avaliacoesHoje || 0}/{s.minimoDia || 10}</span>}
    </Link>
  )
}

export default function Layout() {
  const { aviso } = useStore()
  const { t } = useT()
  const { pathname } = useLocation()
  const imersiva = ehImersiva(pathname)

  // sessão em tela cheia: sem cabeçalho, sem barra inferior, sem rodapé.
  // A classe no <body> existe porque o CSS precisa remover o padding reservado para a barra.
  useEffect(() => {
    document.body.classList.toggle('imersivo', imersiva)
    return () => document.body.classList.remove('imersivo')
  }, [imersiva])

  // trocar de rota volta ao topo. Sem isto, sair de uma lição rolada até o fim abre a tela seguinte
  // no meio — e a de resultado aparece em branco, porque o conteúdo dela é curto.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [pathname])

  if (imersiva) {
    return (
      <>
        <main className="main main--imersivo" id="conteudo">
          <Outlet />
        </main>
        <Tutor imersivo />
        {aviso && (
          <div className="toast" role="status">
            {aviso}
          </div>
        )}
      </>
    )
  }

  return (
    <>
      <a className="pular" href="#conteudo">
        {t('Pular para o conteúdo')}
      </a>
      <header className="header">
        <div className="header__in">
          <Link to="/" className="brand">
            <Logo className="brand__logo" />
            <span className="brand__name">
              Trilha <span>RM</span>
            </span>
          </Link>
          <nav className="header__nav" aria-label={t('Principal')}>
            {PRINCIPAL.map(({ to, rotulo, end }) => (
              <NavLink key={to} to={to} end={end} className="navlink">
                {t(rotulo)}
              </NavLink>
            ))}
          </nav>
          <div className="header__spacer" />
          <NavLink to="/glossario" className="iconbtn so-compacto" aria-label={t('Glossário: buscar um termo')}>
            <IcoBusca />
          </NavLink>
          <Streak />
        </div>
      </header>

      <main className="main" id="conteudo">
        <Outlet />
      </main>

      <footer className="footer">
        <div>
          <b>Trilha RM · Rafael MR</b>
        </div>
        <div>{t('Construo o ambiente inteiro — código, servidor, rede e tudo entre os dois.')}</div>
      </footer>

      <nav className="bottomnav bottomnav--4" aria-label={t('Principal (celular)')}>
        {PRINCIPAL.map(({ to, rotulo, Ico, end }) => (
          <NavLink key={to} to={to} end={end}>
            <Ico />
            <span>{t(rotulo)}</span>
          </NavLink>
        ))}
      </nav>

      <Tutor />

      {aviso && (
        <div className="toast" role="status">
          {aviso}
        </div>
      )}
    </>
  )
}
