// Biblioteca: para quando você quer ESCOLHER em vez de seguir o caminho.
// As telas continuam as mesmas (Glossário, Cursos, Laboratório, Treinos) — só passaram a viver aqui.
import { Link } from 'react-router-dom'
import { BIBLIOTECA } from '../nav.js'
import { useStore } from '../store.jsx'
import IconeModulo from '../components/IconeModulo.jsx'
import Coroas from '../components/Coroas.jsx'
import { useT } from '../i18n/index.jsx'

export default function Biblioteca() {
  const { estrutura, termos, resumoPraticas, resumoCursos, resumoTreinos } = useStore()
  const { t } = useT()

  const numeros = {
    '/glossario': `${termos.length} ${t('termos')}`,
    '/cursos': resumoCursos ? `${resumoCursos.total} ${t('cursos')} · ${resumoCursos.licoes} ${t('lições')}` : '…',
    '/praticas': `${resumoPraticas.geral.total} ${t('exercícios')} · ${resumoPraticas.geral.feitas} ${t('feitos')}`,
    '/treinos': resumoTreinos ? `${resumoTreinos.total} ${t('temporadas')}` : '…',
  }

  // ⚠️ o parâmetro não pode se chamar `t`: sombrearia a função de tradução deste escopo
  const modulos = estrutura ? estrutura.trilhas.flatMap((tr) => tr.modulos.map((m) => ({ ...m, trilha: tr }))) : []

  return (
    <div className="page biblioteca">
      <h1>{t('Biblioteca')}</h1>
      <p className="lead">
        {t('O caminho fica na')} <Link to="/trilha">{t('Trilha')}</Link>.{' '}
        {t('Aqui é o acervo: para quando você quer buscar um termo, ler um curso inteiro ou escolher um exercício específico.')}
      </p>

      <div className="grade-cards">
        {BIBLIOTECA.map(({ to, rotulo, Ico, desc }) => (
          <Link key={to} to={to} className="card card--link">
            <Ico />
            <b>{t(rotulo)}</b>
            <span className="dim small">{t(desc)}</span>
            <span className="dim mono small">{numeros[to] || ''}</span>
          </Link>
        ))}
      </div>

      <h2 className="secao">{t('Vocabulário por módulo')}</h2>
      <p className="dim small">
        {t('Cada módulo tem um baralho de termos. Aqui você estuda solto, no modo que quiser — sem fechar nó nem avançar no caminho. Para avançar, use a lição.')}
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
                <span className="dim small">
                  T{m.trilha.numero} · {m.conteudo.termos} {t('termos')} · {m.conteudo.exercicios} {t('exercícios')}
                </span>
              </span>
              {!m.emProducao && <Coroas n={m.progresso.coroas} rotulo={false} />}
              {m.emProducao && <span className="chip chip--xs">{t('em produção')}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
