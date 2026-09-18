// Biblioteca: para quando você quer ESCOLHER em vez de seguir o caminho.
// As telas continuam as mesmas (Glossário, Cursos, Laboratório, Treinos) — só passaram a viver aqui.
import { Link } from 'react-router-dom'
import { BIBLIOTECA } from '../nav.js'
import { useStore } from '../store.jsx'
import IconeModulo from '../components/IconeModulo.jsx'
import Coroas from '../components/Coroas.jsx'

export default function Biblioteca() {
  const { estrutura, termos, resumoPraticas, resumoCursos, resumoTreinos } = useStore()

  const numeros = {
    '/glossario': `${termos.length} termos`,
    '/cursos': resumoCursos ? `${resumoCursos.total} cursos · ${resumoCursos.licoes} lições` : '…',
    '/praticas': `${resumoPraticas.geral.total} exercícios · ${resumoPraticas.geral.feitas} feitos`,
    '/treinos': resumoTreinos ? `${resumoTreinos.total} temporadas` : '…',
  }

  const modulos = estrutura ? estrutura.trilhas.flatMap((t) => t.modulos.map((m) => ({ ...m, trilha: t }))) : []

  return (
    <div className="page biblioteca">
      <h1>Biblioteca</h1>
      <p className="lead">
        O caminho fica na <Link to="/trilha">Trilha</Link>. Aqui é o acervo: para quando você quer buscar
        um termo, ler um curso inteiro ou escolher um exercício específico.
      </p>

      <div className="grade-cards">
        {BIBLIOTECA.map(({ to, rotulo, Ico, desc }) => (
          <Link key={to} to={to} className="card card--link">
            <Ico />
            <b>{rotulo}</b>
            <span className="dim small">{desc}</span>
            <span className="dim mono small">{numeros[to] || ''}</span>
          </Link>
        ))}
      </div>

      <h2 className="secao">Vocabulário por módulo</h2>
      <p className="dim small">
        Cada módulo tem um baralho de termos. Aqui você estuda solto, no modo que quiser — sem fechar nó
        nem avançar no caminho. Para avançar, use a lição.
      </p>
      <ul className="lista-modulos">
        {modulos.map((m) => (
          <li key={m.id}>
            <Link to={`/deck/${m.deckId}`} className={`lista-modulos__item ${m.emProducao ? 'is-producao' : ''}`} style={{ '--cor-modulo': m.trilha.cor }}>
              <span className="lista-modulos__ico" aria-hidden="true">
                <IconeModulo nome={m.icone} width={18} height={18} />
              </span>
              <span className="lista-modulos__txt">
                <b>{m.titulo}</b>
                <span className="dim small">T{m.trilha.numero} · {m.conteudo.termos} termos · {m.conteudo.exercicios} exercícios</span>
              </span>
              {!m.emProducao && <Coroas n={m.progresso.coroas} rotulo={false} />}
              {m.emProducao && <span className="chip chip--xs">em produção</span>}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
