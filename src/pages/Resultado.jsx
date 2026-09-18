// Tela de resultado da lição: XP, acertos, coroas do módulo, o que falta para fechar o dia e
// para onde ir agora. Recebe o resultado por `state` da navegação (vem do POST de concluir).
import { useEffect, useMemo } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../store.jsx'
import Coroas from '../components/Coroas.jsx'
import { IcoChama, IcoCheck, IcoSeta } from '../components/Icones.jsx'
import { useT } from '../i18n/index.jsx'

function frase(pct, t) {
  if (pct >= 90) return t('Passou reto.')
  if (pct >= 70) return t('Boa lição.')
  if (pct >= 50) return t('Deu para andar.')
  return t('Essa doeu — e é assim que fixa.')
}

export default function Resultado() {
  const { moduloId, n } = useParams()
  const { state } = useLocation()
  const navegar = useNavigate()
  const { progresso } = useStore()
  const { t } = useT()
  const r = state && state.resultado
  const modulo = state && state.modulo

  // entrou direto na URL (recarregou a página): não há resultado para mostrar
  useEffect(() => {
    if (!r) navegar(`/modulo/${moduloId}`, { replace: true })
  }, [r, moduloId, navegar])
  if (!r) return null

  const meta = r.meta || { falta: 0, fechou: true, feito: 0, meta: 60 }
  const s = r.streak || progresso.streak || {}
  const faltaAval = Math.max(0, (s.minimoDia || 10) - (s.avaliacoesHoje || 0))

  return (
    <div className="page resultado">
      <div className="resultado__selo">
        <IcoCheck width={34} height={34} />
      </div>
      <h1>{frase(r.pct, t)}</h1>
      <p className="lead">
        {modulo ? modulo.titulo : moduloId} · {t('lição')} {n}
      </p>

      <div className="resultado__xp">
        <b>+{r.xp}</b>
        <span className="dim small">XP{r.primeiraVez ? ` ${t('(com o bônus de primeira vez)')}` : ''}</span>
      </div>

      <div className="resultado__grade">
        <div className="stat">
          <b>{r.acertos}/{r.total}</b>
          <span className="dim small">{t('itens com nível 3+')}</span>
        </div>
        <div className="stat">
          <b>{r.pct}%</b>
          <span className="dim small">{t('de aproveitamento')}</span>
        </div>
        <div className="stat">
          <Coroas n={r.coroas} rotulo={false} />
          <span className="dim small">{t('coroas do módulo (média')} {Number(r.nivelMedio || 0).toFixed(1)})</span>
        </div>
        <div className="stat">
          <b>{r.xpTotal}</b>
          <span className="dim small">{t('XP acumulado')}</span>
        </div>
      </div>

      <div className="resultado__metas">
        <div>
          <span className="dim small">
            {t('Ofensiva —')} <b>{s.avaliacoesHoje || 0}/{s.minimoDia || 10}</b> {t('avaliações')}
            {faltaAval > 0 ? ` · ${t('faltam')} ${faltaAval} ${t('para o dia contar')}` : ` · ${t('o dia já contou')}`}
          </span>
          <div className="progress">
            <span style={{ width: `${Math.min(100, Math.round(((s.avaliacoesHoje || 0) / (s.minimoDia || 10)) * 100))}%` }} />
          </div>
        </div>
        <div>
          <span className="dim small">
            {t('XP do dia —')} <b>{meta.feito}/{meta.meta}</b>
            {meta.fechou ? ` · ${t('meta batida')}` : ` · ${t('faltam')} ${meta.falta}`}
          </span>
          <div className="progress progress--amber">
            <span style={{ width: `${meta.pct}%` }} />
          </div>
        </div>
      </div>

      {s.atual > 0 && (
        <p className="resultado__streak">
          <IcoChama width={18} height={18} /> <b>{s.atual}</b> {s.atual === 1 ? t('dia') : t('dias')} {t('de ofensiva')}
        </p>
      )}

      {r.moduloConcluido && (
        <div className="resultado__modulo-feito">
          <b>{t('Módulo concluído.')}</b> {t('Todas as lições de')} {modulo ? modulo.titulo : t('deste módulo')}{' '}
          {t('estão fechadas.')} {t('Os termos continuam voltando pela revisão espaçada — e refazer uma lição é sempre permitido.')}
        </div>
      )}

      <div className="acoes acoes--col resultado__acoes">
        {r.proximo ? (
          <Link
            to={r.proximo.tipo === 'chefao' ? `/treino/${r.proximo.treinoId}` : `/licao/${moduloId}/${r.proximo.n}`}
            className="btn btn--primary btn--block"
          >
            {r.proximo.tipo === 'chefao' ? `${t('Encarar o chefão —')} ${r.proximo.titulo}` : `${t('Continuar —')} ${r.proximo.titulo}`}
            <IcoSeta width={18} height={18} />
          </Link>
        ) : (
          <Link to={`/trilha`} className="btn btn--primary btn--block">
            {t('Voltar para a trilha')}
            <IcoSeta width={18} height={18} />
          </Link>
        )}
        <Link to={`/duelo/${moduloId}/${n}`} className="btn btn--ghost btn--block">
          {t('Duelo contra o passado')}
        </Link>
        <Link to={`/licao/${moduloId}/${n}`} className="btn btn--ghost btn--block">
          {t('Refazer esta lição')}
        </Link>
        <Link to={`/modulo/${moduloId}`} className="btn btn--ghost btn--block">
          {t('Voltar ao módulo')}
        </Link>
      </div>

      <p className="dim small">
        {t('Errou alguma coisa que vale anotar? O')} <Link to="/perfil/erros">{t('Diário de erros')}</Link>{' '}
        {t('guarda "o que eu achei · o que era · como detectar da próxima".')}
      </p>
    </div>
  )
}
