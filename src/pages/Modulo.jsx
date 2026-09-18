// Um módulo: os nós (lições) em ordem, mais tudo que existe daquele tema num lugar só.
// Dados de GET /api/modulos/:id (server/estrutura.js).
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api.js'
import { useStore } from '../store.jsx'
import { Carregando, Erro, Vazio } from '../components/Comuns.jsx'
import { IcoCartas, IcoChama, IcoCheck, IcoCurso, IcoFaisca, IcoSeta, IcoTerminal } from '../components/Icones.jsx'
import IconeModulo from '../components/IconeModulo.jsx'
import Coroas from '../components/Coroas.jsx'
import { nomeAmbiente } from '../lib/util.js'
import { useT } from '../i18n/index.jsx'

function No({ no, moduloId }) {
  const { t } = useT()
  const bloqueado = no.estado === 'bloqueado'
  const feito = no.estado === 'feito'
  const destino = no.tipo === 'chefao' ? `/treino/${no.treinoId}` : `/licao/${moduloId}/${no.n}`
  const Tag = bloqueado ? 'div' : Link
  const props = bloqueado ? {} : { to: destino }

  return (
    <li className={`nos__item ${feito ? 'is-feito' : ''} ${no.estado === 'disponivel' ? 'is-atual' : ''} ${bloqueado ? 'is-bloqueado' : ''}`}>
      <Tag {...props} className="nos__card">
        <span className="nos__bolha" aria-hidden="true">
          {feito ? <IcoCheck width={20} height={20} /> : no.tipo === 'chefao' ? <IcoChama width={20} height={20} /> : no.n}
        </span>
        <span className="nos__txt">
          <b>{no.tipo === 'chefao' ? `${t('Chefão')} · ${no.titulo}` : `${t('Lição')} ${no.n}`}</b>
          <span className="dim small">
            {no.tipo === 'chefao'
              ? `${no.totalItens} ${t('etapas — o Treino Especial deste módulo')}`
              : [
                  no.termos.length ? `${no.termos.length} ${no.termos.length === 1 ? t('termo') : t('termos')}` : null,
                  no.leituras.length ? `${no.leituras.length} ${no.leituras.length === 1 ? t('leitura') : t('leituras')}` : null,
                  no.exercicios.length ? `${no.exercicios.length} ${no.exercicios.length === 1 ? t('exercício') : t('exercícios')}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
          </span>
          {feito && (
            <span className="dim mono small">
              {no.xp} XP{no.ultimoAcerto != null ? ` · ${Math.round(no.ultimoAcerto * 100)}% ${t('de acerto')}` : ''}
              {no.vezes > 1 ? ` · ${no.vezes}×` : ''}
            </span>
          )}
        </span>
        {!bloqueado && (
          <span className="nos__ir">
            {feito ? <span className="dim small">{t('refazer')}</span> : <IcoSeta width={18} height={18} />}
          </span>
        )}
      </Tag>
    </li>
  )
}

export default function Modulo() {
  const { id } = useParams()
  const navegar = useNavigate()
  const { mostrarAviso } = useStore()
  const { t } = useT()
  const [modulo, setModulo] = useState(null)
  const [erro, setErro] = useState(null)

  useEffect(() => {
    let vivo = true
    setModulo(null)
    setErro(null)
    api
      .modulo(id)
      .then((m) => vivo && setModulo(m))
      .catch((e) => vivo && setErro(e.message))
    return () => {
      vivo = false
    }
  }, [id])

  if (erro) return <Erro texto={erro} onRetry={() => navegar(0)} />
  if (!modulo) return <Carregando texto={t('Abrindo o módulo…')} />

  const p = modulo.progresso
  const c = modulo.conteudo
  const proximo = modulo.nos.find((x) => x.estado === 'disponivel')

  return (
    <div className="page modulo" style={{ '--cor-modulo': modulo.trilha.cor }}>
      <p className="kicker">
        <Link to={`/trilha/${modulo.trilha.id}`}>{t('Trilha')} {modulo.trilha.numero} · {modulo.trilha.titulo}</Link>
      </p>

      <header className="modulo__topo">
        <span className="modulo__icone" aria-hidden="true">
          <IconeModulo nome={modulo.icone} width={26} height={26} />
        </span>
        <div className="modulo__cab">
          <h1>{modulo.titulo}</h1>
          <p className="lead">{modulo.resumo}</p>
          <div className="modulo__meta">
            <Coroas n={p.coroas} />
            <span className="dim mono small">{t('nível médio')} {p.nivelMedio.toFixed(1)} · {p.vistos}/{p.total} {t('termos vistos')}</span>
          </div>
        </div>
      </header>

      {modulo.emProducao ? (
        <Vazio titulo={t('Este módulo ainda não tem conteúdo')}>
          <code>{modulo.deckId}</code> {t('está declarado em')} <code>content/estrutura.json</code>{' '}
          {t('mas o arquivo não existe. Gere com o prompt de')} <code>content/PROMPT-MASTER.md</code>{' '}
          {t('e solte em')} <code>content/decks/</code> {t('— sem build e sem restart.')}
        </Vazio>
      ) : (
        <>
          <div className="modulo__barras">
            <div>
              <span className="dim small">{t('Lições')}</span>
              <div className="progress">
                <span style={{ width: `${p.pct}%` }} />
              </div>
              <span className="dim mono small">{p.nosFeitos}/{p.nosTotal}</span>
            </div>
            <div>
              <span className="dim small">{t('Exercícios')}</span>
              <div className="progress">
                <span style={{ width: `${c.exercicios ? Math.round((p.exerciciosFeitos / c.exercicios) * 100) : 0}%` }} />
              </div>
              <span className="dim mono small">{p.exerciciosFeitos}/{c.exercicios}</span>
            </div>
          </div>

          {(p.vencidos > 0 || p.novos > 0) && (
            <p className="dim small modulo__fila">
              {p.vencidos > 0 && <><b>{p.vencidos}</b> {p.vencidos === 1 ? t('termo vencido') : t('termos vencidos')}</>}
              {p.vencidos > 0 && p.novos > 0 && ' · '}
              {p.novos > 0 && <><b>{p.novos}</b> {p.novos === 1 ? t('termo novo') : t('termos novos')}</>}
              {' '}{t('— a lição já começa pelos vencidos.')}
            </p>
          )}

          {proximo && (
            <Link
              to={proximo.tipo === 'chefao' ? `/treino/${proximo.treinoId}` : `/licao/${modulo.id}/${proximo.n}`}
              className="btn btn--primary btn--block"
            >
              {p.nosFeitos === 0 ? t('Começar a primeira lição') : `${t('Continuar —')} ${proximo.titulo}`}
              <IcoSeta width={18} height={18} />
            </Link>
          )}

          <h2 className="secao">{t('Lições deste módulo')}</h2>
          <ol className="nos">
            {modulo.nos.map((n) => (
              <No key={n.id} no={n} moduloId={modulo.id} />
            ))}
          </ol>

          <h2 className="secao">{t('Tudo deste tema')}</h2>
          <div className="modulo__tudo">
            <Link to={`/deck/${modulo.deckId}`} className="card card--link">
              <IcoCartas />
              <b>{t('Vocabulário')}</b>
              <span className="dim small">{c.termos} {t('termos — estudar solto, no modo que quiser')}</span>
            </Link>
            {c.cursosIds.map((cid) => (
              <Link key={cid} to={`/curso/${cid}`} className="card card--link">
                <IcoCurso />
                <b>{t('Curso')}</b>
                <span className="dim small">{c.leituras} {t('lições em Markdown')}</span>
              </Link>
            ))}
            <Link to="/praticas" className="card card--link" onClick={() => mostrarAviso(`Filtre por ${modulo.titulo}`)}>
              <IcoTerminal />
              <b>{t('Laboratório')}</b>
              <span className="dim small">{c.exercicios} {t('exercícios fora do app')}</span>
            </Link>
            {c.chefao && (
              <Link to={`/treino/${c.chefao.treinoId}`} className="card card--link">
                <IcoChama />
                <b>{t('Chefão')}</b>
                <span className="dim small">{c.chefao.titulo} — {c.chefao.etapas} {t('etapas')}</span>
              </Link>
            )}
            <Link to={`/entrevista/${modulo.id}`} className="card card--link">
              <IcoFaisca />
              <b>{t('Entrevista simulada')}</b>
              <span className="dim small">{t('3 a 5 rodadas; o mentor pergunta em cima da sua resposta')}</span>
            </Link>
          </div>

          {c.exercicios > 0 && (
            <>
              <h2 className="secao">{t('Exercícios (ambientes)')}</h2>
              <p className="dim small">
                {[...new Set(modulo.nos.flatMap((n) => n.exercicios.map((e) => e.ambiente)))].map(nomeAmbiente).join(' · ')}
              </p>
            </>
          )}
        </>
      )}
    </div>
  )
}
