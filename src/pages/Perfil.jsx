// Perfil: medir, revisar e ajustar. As telas antigas (Matriz, Config) passaram a viver aqui.
import { Link } from 'react-router-dom'
import { PERFIL } from '../nav.js'
import { useStore } from '../store.jsx'
import { META_XP_DIA } from '../lib/xp.js'
import { IcoChama } from '../components/Icones.jsx'
import { useT } from '../i18n/index.jsx'
import { useSessao } from '../sessao.jsx'

export default function Perfil() {
  const { progresso, resumo, estrutura, resumoPraticas } = useStore()
  const { t } = useT()
  const { usuario, sair } = useSessao()
  const s = progresso.streak || {}
  const xpHoje = s.xpHoje || 0
  const faltaXp = Math.max(0, META_XP_DIA - xpHoje)
  const faltaAval = Math.max(0, (s.minimoDia || 10) - (s.avaliacoesHoje || 0))

  const nivel3 = Object.values(resumo.porDeck).reduce((a, d) => a + d.n3, 0)
  const pctNivel3 = resumo.total ? Math.round((nivel3 / resumo.total) * 100) : 0
  const nosFeitos = estrutura ? estrutura.trilhas.reduce((a, tr) => a + tr.progresso.nosFeitos, 0) : 0
  const nosTotal = estrutura ? estrutura.trilhas.reduce((a, tr) => a + tr.progresso.nosTotal, 0) : 0

  return (
    <div className="page perfil">
      <h1>{t('Perfil')}</h1>

      {usuario && (
        <div className="perfil__conta">
          <span className="perfil__avatar" aria-hidden="true">
            {usuario.nome.slice(0, 1).toUpperCase()}
          </span>
          <div className="perfil__quem">
            <b>{usuario.nome}</b>
            <span className="dim small mono">
              @{usuario.login}
              {usuario.papel === 'dono' ? ` · ${t('dono do app')}` : ''}
            </span>
          </div>
          <button type="button" className="btn btn--sm btn--ghost" onClick={sair}>
            {t('Sair')}
          </button>
        </div>
      )}

      <div className="perfil__hoje">
        <div className={`perfil__streak ${s.atual > 0 ? 'on' : ''}`}>
          <IcoChama width={26} height={26} />
          <b>{s.atual || 0}</b>
          <span className="dim small">{s.atual === 1 ? t('dia') : t('dias')} {t('de ofensiva')}</span>
          <span className="dim mono small">{t('melhor:')} {s.melhor || 0}</span>
        </div>
        <div className="perfil__metas">
          <div>
            <span className="dim small">{t('Meta do dia — avaliações')} <b>{t('(é esta que conta)')}</b></span>
            <div className="progress">
              <span style={{ width: `${Math.min(100, Math.round(((s.avaliacoesHoje || 0) / (s.minimoDia || 10)) * 100))}%` }} />
            </div>
            <span className="dim mono small">
              {s.avaliacoesHoje || 0}/{s.minimoDia || 10}
              {faltaAval > 0 ? ` · ${t('faltam')} ${faltaAval}` : ` · ${t('o dia já contou')}`}
            </span>
          </div>
          <div>
            <span className="dim small">{t('XP do dia')}</span>
            <div className="progress progress--amber">
              <span style={{ width: `${Math.min(100, Math.round((xpHoje / META_XP_DIA) * 100))}%` }} />
            </div>
            <span className="dim mono small">
              {xpHoje}/{META_XP_DIA} XP{faltaXp > 0 ? ` · ${t('faltam')} ${faltaXp}` : ` · ${t('meta batida')}`} · {t('total')} {s.xpTotal || 0}
            </span>
          </div>
        </div>
      </div>

      <div className="perfil__numeros">
        <div className="stat">
          <b>{pctNivel3}%</b>
          <span className="dim small">{t('dos termos em nível 3+ ("aplico")')}</span>
        </div>
        <div className="stat">
          <b>{resumo.vencidos}</b>
          <span className="dim small">{t('termos para revisar hoje')}</span>
        </div>
        <div className="stat">
          <b>{nosFeitos}/{nosTotal}</b>
          <span className="dim small">{t('lições concluídas')}</span>
        </div>
        <div className="stat">
          <b>{resumoPraticas.geral.feitas}</b>
          <span className="dim small">{t('exercícios entregues')}</span>
        </div>
      </div>

      <div className="grade-cards">
        {PERFIL.map(({ to, rotulo, Ico, desc }) => (
          <Link key={to} to={to} className="card card--link">
            <Ico />
            <b>{t(rotulo)}</b>
            <span className="dim small">{t(desc)}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
