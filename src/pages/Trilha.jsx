// O caminho: mapa vertical da trilha atual, com os módulos como nós (estilo Duolingo).
// Os dados vêm de GET /api/estrutura (server/estrutura.js). Ver docs/AI-GUIA.md.
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { Carregando, Erro, Vazio } from '../components/Comuns.jsx'
import { IcoChama, IcoCheck, IcoSeta } from '../components/Icones.jsx'
import IconeModulo from '../components/IconeModulo.jsx'
import Coroas from '../components/Coroas.jsx'
import { useT } from '../i18n/index.jsx'

function NoModulo({ modulo, cor, primeiro }) {
  const { t } = useT()
  const p = modulo.progresso
  const feito = p.concluido
  const emAndamento = p.nosFeitos > 0 && !feito
  const classe = ['mapa__no', feito ? 'is-feito' : '', emAndamento ? 'is-andamento' : '', modulo.emProducao ? 'is-producao' : '', modulo.bloqueado ? 'is-bloqueado' : '', primeiro && !feito ? 'is-atual' : ''].filter(Boolean).join(' ')

  return (
    <li className={classe}>
      <span className="mapa__linha" aria-hidden="true" />
      <Link to={`/modulo/${modulo.id}`} className="mapa__card" style={{ '--cor-modulo': cor }}>
        <span className="mapa__bolha" aria-hidden="true">
          {feito ? <IcoCheck width={22} height={22} /> : <IconeModulo nome={modulo.icone} width={22} height={22} />}
        </span>
        <span className="mapa__txt">
          <b className="mapa__titulo">{modulo.titulo}</b>
          <span className="dim small mapa__resumo">{modulo.resumo}</span>
          <span className="mapa__meta">
            <Coroas n={p.coroas} />
            <span className="dim mono small">
              {modulo.emProducao ? t('em produção') : `${p.nosFeitos}/${p.nosTotal} ${t('lições')}`}
            </span>
            {p.vencidos > 0 && <span className="chip chip--amber chip--xs">{p.vencidos} {t('para revisar')}</span>}
            {modulo.conteudo.chefao && <span className="chip chip--xs" title={t('Este módulo termina num Treino Especial')}><IcoChama width={12} height={12} /> {t('chefão')}</span>}
          </span>
        </span>
        <span className="mapa__ir" aria-hidden="true">
          <IcoSeta width={18} height={18} />
        </span>
      </Link>
      {modulo.bloqueado && (
        <p className="mapa__aviso dim small">
          {t('O plano sugere terminar')} <b>{modulo.bloqueadoPor.titulo}</b> {t('antes — mas você pode entrar assim mesmo.')}
        </p>
      )}
    </li>
  )
}

export default function Trilha() {
  const { estrutura, carregando, erro, carregar } = useStore()
  const { t } = useT()
  const { id } = useParams()
  const navegar = useNavigate()
  const [aberta, setAberta] = useState(null)

  const trilhaId = id || aberta || (estrutura && estrutura.trilhaAtual)
  const trilha = useMemo(() => {
    if (!estrutura) return null
    return estrutura.trilhas.find((tr) => tr.id === trilhaId) || estrutura.trilhas[0] || null
  }, [estrutura, trilhaId])

  if (erro) return <Erro texto={erro} onRetry={carregar} />
  if (carregando || !estrutura) return <Carregando texto={t('Montando o caminho…')} />
  if (!trilha) return <Vazio titulo={t('Nenhuma trilha configurada')}>Crie `content/estrutura.json` — o esquema está em `docs/AI-GUIA.md`.</Vazio>

  const p = trilha.progresso
  const primeiroNaoFeito = trilha.modulos.find((m) => !m.progresso.concluido && !m.emProducao)

  return (
    <div className="page trilha">
      <header className="trilha__topo" style={{ '--cor-trilha': trilha.cor }}>
        <p className="eyebrow">{t('Trilha')} {trilha.numero} {t('de')} {estrutura.trilhas.length}</p>
        <h1>{trilha.titulo}</h1>
        {trilha.subtitulo && <p className="lead">{trilha.subtitulo}</p>}
        {trilha.periodo && <p className="dim small mono">{trilha.periodo}</p>}
        <div className="trilha__barra">
          <div className="progress" role="progressbar" aria-valuenow={p.pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${p.pct}%`}>
            <span style={{ width: `${p.pct}%` }} />
          </div>
          <span className="dim mono small">
            {p.nosFeitos}/{p.nosTotal} {t('lições')} · {p.modulosConcluidos}/{p.modulos} {t('módulos')} · {p.termos} {t('termos')}
          </span>
        </div>
        {p.vencidos > 0 && (
          <p className="dim small">
            <b>{p.vencidos}</b> {p.vencidos === 1 ? t('termo vencido') : t('termos vencidos')} {t('nesta trilha — a lição já começa por eles.')}
          </p>
        )}
      </header>

      <nav className="trilha__seletor" aria-label={t('Escolher a trilha')}>
        {estrutura.trilhas.map((tr) => (
          <button
            key={tr.id}
            type="button"
            className={`chip ${tr.id === trilha.id ? 'chip--on' : ''}`}
            style={{ '--cor-trilha': tr.cor }}
            onClick={() => {
              setAberta(tr.id)
              if (id) navegar(`/trilha/${tr.id}`)
            }}
            aria-current={tr.id === trilha.id ? 'true' : undefined}
          >
            T{tr.numero}
            <span className="dim small"> · {tr.progresso.pct}%</span>
          </button>
        ))}
      </nav>

      {primeiroNaoFeito && (
        <Link to={`/modulo/${primeiroNaoFeito.id}`} className="btn btn--primary btn--block trilha__continuar">
          {t('Continuar em')} {primeiroNaoFeito.titulo}
          <IcoSeta width={18} height={18} />
        </Link>
      )}

      <ol className="mapa" aria-label={`${t('módulos')} ${trilha.numero}`}>
        {trilha.modulos.map((m) => (
          <NoModulo key={m.id} modulo={m} cor={trilha.cor} primeiro={primeiroNaoFeito && m.id === primeiroNaoFeito.id} />
        ))}
      </ol>

      <p className="dim small trilha__rodape">
        {t('Não entendeu a divisão?')} <Link to="/anatomia">{t('Veja como o app é organizado')}</Link>.
      </p>
    </div>
  )
}
