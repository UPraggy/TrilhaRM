import { Link, NavLink, Outlet } from 'react-router-dom'
import Logo from './Logo.jsx'
import { IcoCasa, IcoLivro, IcoGrade, IcoCurso, IcoChama, IcoEngrenagem, IcoTerminal } from './Icones.jsx'
import { useStore } from '../store.jsx'

const LINKS = [
  { to: '/', rotulo: 'Início', Ico: IcoCasa, end: true },
  { to: '/praticas', rotulo: 'Praticar', Ico: IcoTerminal },
  { to: '/treinos', rotulo: 'Treinos', Ico: IcoChama },
  { to: '/glossario', rotulo: 'Glossário', Ico: IcoLivro },
  { to: '/matriz', rotulo: 'Matriz', Ico: IcoGrade },
  { to: '/cursos', rotulo: 'Cursos', Ico: IcoCurso },
  { to: '/config', rotulo: 'Config', Ico: IcoEngrenagem },
]

export function Streak() {
  const { progresso } = useStore()
  const s = progresso.streak || {}
  const on = (s.atual || 0) > 0
  const falta = Math.max(0, (s.minimoDia || 10) - (s.avaliacoesHoje || 0))
  const titulo = s.hojeContou
    ? `Hoje já contou. Melhor sequência: ${s.melhor || 0} dias.`
    : `Faltam ${falta} avaliações hoje para manter a ofensiva. Melhor: ${s.melhor || 0} dias.`
  return (
    <Link to="/matriz" className={`streak ${on ? 'on' : ''}`} title={titulo} aria-label={`Ofensiva: ${s.atual || 0} dias`}>
      <IcoChama />
      <b>{s.atual || 0}</b>
      <span className="dim">{s.atual === 1 ? 'dia' : 'dias'}</span>
      {!s.hojeContou && <span className="dim mono small">· {s.avaliacoesHoje || 0}/{s.minimoDia || 10}</span>}
    </Link>
  )
}

export default function Layout() {
  const { aviso } = useStore()
  return (
    <>
      <header className="header">
        <div className="header__in">
          <Link to="/" className="brand">
            <Logo className="brand__logo" />
            <span className="brand__name">
              Trilha <span>RM</span>
            </span>
          </Link>
          <nav className="header__nav" aria-label="Principal">
            {LINKS.map(({ to, rotulo, end }) => (
              <NavLink key={to} to={to} end={end} className="navlink">
                {rotulo}
              </NavLink>
            ))}
          </nav>
          <div className="header__spacer" />
          <Streak />
        </div>
      </header>

      <main className="main">
        <Outlet />
      </main>

      <footer className="footer">
        <div>
          <b>Trilha RM · Rafael MR</b>
        </div>
        <div>Construo o ambiente inteiro — código, servidor, rede e tudo entre os dois.</div>
      </footer>

      <nav className="bottomnav" aria-label="Principal (mobile)">
        {LINKS.map(({ to, rotulo, Ico, end }) => (
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
