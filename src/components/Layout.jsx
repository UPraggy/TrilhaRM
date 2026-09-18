import { useEffect } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import Logo from './Logo.jsx'
import { IcoBusca, IcoChama } from './Icones.jsx'
import { PRINCIPAL, ehImersiva } from '../nav.js'
import { useStore } from '../store.jsx'

export function Streak() {
  const { progresso } = useStore()
  const s = progresso.streak || {}
  const on = (s.atual || 0) > 0
  const falta = Math.max(0, (s.minimoDia || 10) - (s.avaliacoesHoje || 0))
  const titulo = s.hojeContou
    ? `Hoje já contou. Melhor sequência: ${s.melhor || 0} dias.`
    : `Faltam ${falta} avaliações hoje para manter a ofensiva. Melhor: ${s.melhor || 0} dias.`
  return (
    <Link to="/perfil" className={`streak ${on ? 'on' : ''}`} title={titulo} aria-label={`Ofensiva: ${s.atual || 0} dias. ${titulo}`}>
      <IcoChama />
      <b>{s.atual || 0}</b>
      <span className="dim">{s.atual === 1 ? 'dia' : 'dias'}</span>
      {!s.hojeContou && <span className="dim mono small">· {s.avaliacoesHoje || 0}/{s.minimoDia || 10}</span>}
    </Link>
  )
}

export default function Layout() {
  const { aviso } = useStore()
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
        Pular para o conteúdo
      </a>
      <header className="header">
        <div className="header__in">
          <Link to="/" className="brand">
            <Logo className="brand__logo" />
            <span className="brand__name">
              Trilha <span>RM</span>
            </span>
          </Link>
          <nav className="header__nav" aria-label="Principal">
            {PRINCIPAL.map(({ to, rotulo, end }) => (
              <NavLink key={to} to={to} end={end} className="navlink">
                {rotulo}
              </NavLink>
            ))}
          </nav>
          <div className="header__spacer" />
          <NavLink to="/glossario" className="iconbtn so-compacto" aria-label="Glossário: buscar um termo">
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
        <div>Construo o ambiente inteiro — código, servidor, rede e tudo entre os dois.</div>
      </footer>

      <nav className="bottomnav bottomnav--4" aria-label="Principal (celular)">
        {PRINCIPAL.map(({ to, rotulo, Ico, end }) => (
          <NavLink key={to} to={to} end={end}>
            <Ico />
            <span>{rotulo}</span>
          </NavLink>
        ))}
      </nav>

      {aviso && (
        <div className="toast" role="status">
          {aviso}
        </div>
      )}
    </>
  )
}
