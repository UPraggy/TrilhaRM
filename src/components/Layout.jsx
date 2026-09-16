import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import Logo from './Logo.jsx'
import {
  IcoBusca,
  IcoCasa,
  IcoChama,
  IcoCurso,
  IcoEngrenagem,
  IcoGrade,
  IcoLivro,
  IcoMenu,
  IcoTerminal,
  IcoX,
} from './Icones.jsx'
import { useStore } from '../store.jsx'

/** as quatro camadas do app + o resto; o cabeçalho do desktop mostra tudo */
const PRINCIPAIS = [
  { to: '/', rotulo: 'Início', Ico: IcoCasa, end: true },
  { to: '/praticas', rotulo: 'Praticar', Ico: IcoTerminal },
  { to: '/cursos', rotulo: 'Cursos', Ico: IcoCurso },
  { to: '/treinos', rotulo: 'Treinos', Ico: IcoChama },
]
/** no celular vivem atrás do botão "Mais"; no desktop ficam na barra do cabeçalho */
const SECUNDARIOS = [
  { to: '/glossario', rotulo: 'Glossário', Ico: IcoLivro, desc: 'Buscar um termo e ver os relacionados' },
  { to: '/matriz', rotulo: 'Matriz', Ico: IcoGrade, desc: 'Nível por deck, ofensiva e histórico' },
  { to: '/config', rotulo: 'Config', Ico: IcoEngrenagem, desc: 'Mentor IA, chave do OpenRouter, reset' },
]
const LINKS = [...PRINCIPAIS, ...SECUNDARIOS]

export function Streak() {
  const { progresso } = useStore()
  const s = progresso.streak || {}
  const on = (s.atual || 0) > 0
  const falta = Math.max(0, (s.minimoDia || 10) - (s.avaliacoesHoje || 0))
  const titulo = s.hojeContou
    ? `Hoje já contou. Melhor sequência: ${s.melhor || 0} dias.`
    : `Faltam ${falta} avaliações hoje para manter a ofensiva. Melhor: ${s.melhor || 0} dias.`
  return (
    <Link to="/matriz" className={`streak ${on ? 'on' : ''}`} title={titulo} aria-label={`Ofensiva: ${s.atual || 0} dias. ${titulo}`}>
      <IcoChama />
      <b>{s.atual || 0}</b>
      <span className="dim">{s.atual === 1 ? 'dia' : 'dias'}</span>
      {!s.hojeContou && <span className="dim mono small">· {s.avaliacoesHoje || 0}/{s.minimoDia || 10}</span>}
    </Link>
  )
}

/** Folha de baixo com o que não coube na barra de 5. Fecha no Esc, no toque fora e ao navegar. */
function MenuMais({ aberto, onFechar, botaoRef }) {
  const primeiro = useRef(null)
  useEffect(() => {
    if (!aberto) return
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onFechar()
      }
    }
    window.addEventListener('keydown', onKey)
    if (primeiro.current) primeiro.current.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [aberto, onFechar])

  // devolve o foco para o botão que abriu
  useEffect(() => {
    if (!aberto && botaoRef.current && botaoRef.current.dataset.usou === '1') {
      botaoRef.current.dataset.usou = '0'
      botaoRef.current.focus()
    }
  }, [aberto, botaoRef])

  if (!aberto) return null
  return (
    <div className="folha-bg" onClick={onFechar}>
      <div className="folha" role="dialog" aria-modal="true" aria-label="Mais telas" onClick={(e) => e.stopPropagation()}>
        <div className="folha__topo">
          <span className="eyebrow">Mais</span>
          <button className="btn btn--sm btn--ghost folha__x" onClick={onFechar} aria-label="Fechar o menu">
            <IcoX width={18} height={18} />
          </button>
        </div>
        {SECUNDARIOS.map(({ to, rotulo, Ico, desc }, i) => (
          <NavLink key={to} to={to} className="folha__item" onClick={onFechar} ref={i === 0 ? primeiro : null}>
            <Ico />
            <span className="folha__txt">
              <b>{rotulo}</b>
              <span className="dim small">{desc}</span>
            </span>
          </NavLink>
        ))}
      </div>
    </div>
  )
}

export default function Layout() {
  const { aviso } = useStore()
  const [menu, setMenu] = useState(false)
  const botaoRef = useRef(null)
  const { pathname } = useLocation()

  useEffect(() => {
    setMenu(false)
  }, [pathname])

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
            {LINKS.map(({ to, rotulo, end }) => (
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

      <nav className="bottomnav" aria-label="Principal (celular)">
        {PRINCIPAIS.map(({ to, rotulo, Ico, end }) => (
          <NavLink key={to} to={to} end={end}>
            <Ico />
            <span>{rotulo}</span>
          </NavLink>
        ))}
        <button
          type="button"
          ref={botaoRef}
          className={`bottomnav__mais ${menu ? 'active' : ''}`}
          aria-haspopup="dialog"
          aria-expanded={menu}
          onClick={(e) => {
            e.currentTarget.dataset.usou = '1'
            setMenu((v) => !v)
          }}
        >
          <IcoMenu />
          <span>Mais</span>
        </button>
      </nav>

      <MenuMais aberto={menu} onFechar={() => setMenu(false)} botaoRef={botaoRef} />

      {aviso && (
        <div className="toast" role="status">
          {aviso}
        </div>
      )}
    </>
  )
}
