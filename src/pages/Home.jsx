// Início: responde UMA pergunta — "o que eu faço agora?".
//
// A V2 tirou daqui as "quatro camadas" (Decorar/Praticar/Aprender/Treinar): elas descreviam a divisão
// TÉCNICA do conteúdo, não o caminho de estudo, e por isso não ajudavam a decidir. O caminho vive na
// Trilha; o acervo, na Biblioteca; a medição, no Perfil. Esta tela só empurra para a próxima ação.
import { Link } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { Carregando, Erro, Vazio } from '../components/Comuns.jsx'
import { IcoChama, IcoRetomar, IcoSeta, IcoTerminal } from '../components/Icones.jsx'
import IconeModulo from '../components/IconeModulo.jsx'
import Coroas from '../components/Coroas.jsx'
import { META_XP_DIA } from '../lib/xp.js'
import { fmtDataCurta } from '../lib/util.js'
import { useT } from '../i18n/index.jsx'

/** o cartão grande: a ação do dia */
function AcaoDoDia({ proximo, vencidos }) {
  const { t } = useT()
  if (!proximo) {
    return (
      <div className="card acao">
        <span className="eyebrow">{t('Hoje')}</span>
        <h2>{t('Tudo em dia por aqui.')}</h2>
        <p className="dim">
          {t('Não há lição desbloqueada esperando. Escolha um módulo na')} <Link to="/trilha">{t('Trilha')}</Link>{' '}
          {t('para refazer, ou abra um exercício no')} <Link to="/praticas">{t('Laboratório')}</Link>.
        </p>
      </div>
    )
  }
  const destino = proximo.no.tipo === 'chefao' ? `/trilha` : `/licao/${proximo.moduloId}/${proximo.no.n}`
  return (
    <Link to={destino} className="card acao acao--link">
      <span className="eyebrow">{t('Agora')}</span>
      <h2>{proximo.no.tipo === 'chefao' ? proximo.no.titulo : `${proximo.moduloTitulo} · ${proximo.no.titulo}`}</h2>
      <p className="dim">
        {proximo.no.totalItens} {proximo.no.totalItens === 1 ? t('item') : t('itens')} · {t('5 a 10 minutos')}
        {vencidos > 0 ? ` · ${vencidos} ${vencidos === 1 ? t('termo vencido entra') : t('termos vencidos entram')} ${t('primeiro')}` : ''}
      </p>
      <span className="btn btn--primary btn--block acao__btn">
        {t('Começar')}
        <IcoSeta width={18} height={18} />
      </span>
      <span className="dim small acao__trilha">
        {t('Trilha')} {proximo.trilhaNumero} · {proximo.trilhaTitulo}
      </span>
    </Link>
  )
}

export default function Home() {
  const { estrutura, progresso, carregando, erro, carregar, resumo, resumoPraticas, hoje } = useStore()
  const { t } = useT()

  if (erro) return <Erro texto={erro} onRetry={carregar} />
  if (carregando || !estrutura) return <Carregando texto={t('Abrindo a trilha…')} />
  if (!estrutura.trilhas.length) {
    return (
      <div className="page">
        <Vazio titulo={t('Nenhum conteúdo carregado')}>
          {t('Solte um deck em')} <code>content/decks/</code> {t('e declare o módulo em')}{' '}
          <code>content/estrutura.json</code>. {t('O esquema está em')} <code>docs/AI-GUIA.md</code>.
        </Vazio>
      </div>
    )
  }

  const s = progresso.streak || {}
  const xpHoje = s.xpHoje || 0
  const faltaAval = Math.max(0, (s.minimoDia || 10) - (s.avaliacoesHoje || 0))
  const trilhaAtual = estrutura.trilhas.find((tr) => tr.id === estrutura.trilhaAtual) || estrutura.trilhas[0]

  // "continuar": módulos já começados e ainda não fechados, o mais avançado primeiro
  const emAndamento = estrutura.trilhas
    .flatMap((tr) => tr.modulos.map((m) => ({ ...m, trilha: tr })))
    .filter((m) => m.progresso.nosFeitos > 0 && !m.progresso.concluido)
    .sort((a, b) => b.progresso.pct - a.progresso.pct)
    .slice(0, 3)

  return (
    <div className="page inicio">
      <header className="inicio__topo">
        <div>
          <p className="eyebrow">{t('Hoje')} · {fmtDataCurta(hoje)}</p>
          <h1>{t('O que fazer agora')}</h1>
        </div>
        <Link to="/perfil" className={`inicio__streak ${s.atual > 0 ? 'on' : ''}`} title={t('Ofensiva')}>
          <IcoChama width={20} height={20} />
          <b>{s.atual || 0}</b>
        </Link>
      </header>

      <AcaoDoDia proximo={estrutura.proximo} vencidos={resumo.vencidos} />

      <div className="inicio__metas">
        <div>
          <span className="dim small">
            {t('Ofensiva')} · <b>{s.avaliacoesHoje || 0}/{s.minimoDia || 10}</b> {t('avaliações')}
            {faltaAval > 0 ? ` — ${t('faltam')} ${faltaAval}` : ` — ${t('o dia contou')}`}
          </span>
          <div className="progress">
            <span style={{ width: `${Math.min(100, Math.round(((s.avaliacoesHoje || 0) / (s.minimoDia || 10)) * 100))}%` }} />
          </div>
        </div>
        <div>
          <span className="dim small">
            XP · <b>{xpHoje}/{META_XP_DIA}</b>
            {xpHoje >= META_XP_DIA ? ` — ${t('meta batida')}` : ` — ${t('faltam')} ${META_XP_DIA - xpHoje}`}
          </span>
          <div className="progress progress--amber">
            <span style={{ width: `${Math.min(100, Math.round((xpHoje / META_XP_DIA) * 100))}%` }} />
          </div>
        </div>
      </div>

      {emAndamento.length > 0 && (
        <>
          <h2 className="secao">{t('Continuar de onde parei')}</h2>
          <ul className="lista-modulos">
            {emAndamento.map((m) => (
              <li key={m.id}>
                <Link to={`/modulo/${m.id}`} className="lista-modulos__item" style={{ '--cor-modulo': m.trilha.cor }}>
                  <span className="lista-modulos__ico" aria-hidden="true">
                    <IconeModulo nome={m.icone} width={18} height={18} />
                  </span>
                  <span className="lista-modulos__txt">
                    <b>{m.titulo}</b>
                    <span className="dim small">
                      {m.progresso.nosFeitos}/{m.progresso.nosTotal} {t('lições')}
                      {m.progresso.vencidos > 0 ? ` · ${m.progresso.vencidos} ${t('para revisar')}` : ''}
                    </span>
                  </span>
                  <Coroas n={m.progresso.coroas} rotulo={false} />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      <h2 className="secao">{t('Onde você está')}</h2>
      <Link to={`/trilha/${trilhaAtual.id}`} className="card card--link inicio__trilha" style={{ '--cor-trilha': trilhaAtual.cor }}>
        <span className="eyebrow">{t('Trilha')} {trilhaAtual.numero} {t('de')} {estrutura.trilhas.length}</span>
        <b>{trilhaAtual.titulo}</b>
        <div className="progress">
          <span style={{ width: `${trilhaAtual.progresso.pct}%` }} />
        </div>
        <span className="dim small">
          {trilhaAtual.progresso.nosFeitos}/{trilhaAtual.progresso.nosTotal} {t('lições')} ·{' '}
          {trilhaAtual.progresso.modulosConcluidos}/{trilhaAtual.progresso.modulos} {t('módulos')}
        </span>
      </Link>

      <ul className="inicio__trilhas">
        {estrutura.trilhas.map((tr) => (
          <li key={tr.id}>
            <Link to={`/trilha/${tr.id}`} className={`inicio__trilha-mini ${tr.id === trilhaAtual.id ? 'on' : ''}`}>
              <b>T{tr.numero}</b>
              <div className="progress">
                <span style={{ width: `${tr.progresso.pct}%`, background: tr.cor }} />
              </div>
              <span className="dim mono small">{tr.progresso.pct}%</span>
            </Link>
          </li>
        ))}
      </ul>

      <h2 className="secao">{t('Fora do app')}</h2>
      <Link to="/praticas" className="card card--link">
        <IcoTerminal />
        <b>{t('Laboratório')}</b>
        <span className="dim small">
          {resumoPraticas.geral.feitas}/{resumoPraticas.geral.total}{' '}
          {t('exercícios entregues — provar no terminal o que a lição só explicou')}
        </span>
      </Link>

      <p className="dim small inicio__rodape">
        <IcoRetomar width={14} height={14} /> {t('Perdeu o fio?')}{' '}
        <Link to="/anatomia">{t('Como o app é organizado')}</Link>.
      </p>
    </div>
  )
}
