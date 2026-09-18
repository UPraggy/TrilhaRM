// Diário de erros: três campos por entrada — o que eu achei · o que era · como detectar da próxima.
// É matéria-prima de revisão antes de uma entrevista, e sai em Markdown por GET /api/diario.md.
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import { useStore } from '../store.jsx'
import { Carregando, Confirmar, Vazio } from '../components/Comuns.jsx'
import { fmtDataCurta } from '../lib/util.js'
import { useT } from '../i18n/index.jsx'

const VAZIA = { titulo: '', achei: '', era: '', detectar: '', moduloId: '' }

export default function DiarioErros() {
  const { estrutura, mostrarAviso } = useStore()
  const { t } = useT()
  const [lista, setLista] = useState(null)
  const [filtro, setFiltro] = useState('')
  const [nova, setNova] = useState(VAZIA)
  const [abrindo, setAbrindo] = useState(false)
  const [editando, setEditando] = useState(null)
  const [apagar, setApagar] = useState(null)

  const modulos = useMemo(() => (estrutura ? estrutura.trilhas.flatMap((tr) => tr.modulos.map((m) => ({ id: m.id, titulo: m.titulo }))) : []), [estrutura])

  const carregar = () =>
    api
      .diario()
      .then((r) => setLista(r.erros || []))
      .catch(() => setLista([]))

  useEffect(() => {
    carregar()
  }, [])

  const salvar = async (e) => {
    e.preventDefault()
    try {
      await api.diarioAnotar(nova)
      setNova(VAZIA)
      setAbrindo(false)
      await carregar()
      mostrarAviso(t('Anotado.'))
    } catch (err) {
      mostrarAviso(`${t('Não anotou:')} ${err.message}`, 4000)
    }
  }

  const salvarEdicao = async (id, campos) => {
    try {
      await api.diarioAtualizar(id, campos)
      setEditando(null)
      await carregar()
    } catch (err) {
      mostrarAviso(`${t('Não salvou:')} ${err.message}`, 4000)
    }
  }

  const visiveis = (lista || []).filter((e) => !filtro || e.moduloId === filtro)

  return (
    <div className="page diario">
      <p className="kicker"><Link to="/perfil">{t('Perfil')}</Link></p>
      <h1>{t('Diário de erros')}</h1>
      <p className="lead">
        {t('Todo erro vira uma entrada de três campos:')} <b>{t('O que eu achei')}</b>, <b>{t('O que era')}</b>{' '}
        {t('e')} <b>{t('Como detectar da próxima')}</b>.{' '}
        {t('O terceiro é o que muda alguma coisa — os dois primeiros só descrevem o passado.')}
      </p>

      <div className="diario__acoes">
        <button className="btn btn--primary" onClick={() => setAbrindo((v) => !v)}>
          {abrindo ? t('Cancelar') : t('Anotar um erro')}
        </button>
        <a className="btn btn--ghost" href="/api/diario.md" download="diario-de-erros.md">
          {t('Exportar em Markdown')}
        </a>
        {modulos.length > 0 && (
          <select className="select" value={filtro} onChange={(e) => setFiltro(e.target.value)} aria-label={t('Filtrar por módulo')}>
            <option value="">{t('todos os módulos')}</option>
            {modulos.map((m) => (
              <option key={m.id} value={m.id}>
                {m.titulo}
              </option>
            ))}
          </select>
        )}
      </div>

      {abrindo && (
        <form className="card diario__form" onSubmit={salvar}>
          <label>
            <span className="eyebrow">{t('Título (o conceito ou a situação)')}</span>
            <input className="input" value={nova.titulo} onChange={(e) => setNova({ ...nova, titulo: e.target.value })} placeholder="TIME_WAIT vs CLOSE_WAIT" autoFocus />
          </label>
          <label>
            <span className="eyebrow">{t('O que eu achei')}</span>
            <textarea className="textarea" rows={2} value={nova.achei} onChange={(e) => setNova({ ...nova, achei: e.target.value })} placeholder="que os dois eram sintoma de vazamento" />
          </label>
          <label>
            <span className="eyebrow">{t('O que era')}</span>
            <textarea className="textarea" rows={2} value={nova.era} onChange={(e) => setNova({ ...nova, era: e.target.value })} placeholder="TIME_WAIT é de quem fecha primeiro e é normal; CLOSE_WAIT é falta de close() no meu código" />
          </label>
          <label>
            <span className="eyebrow">{t('Como detectar da próxima')}</span>
            <textarea className="textarea" rows={2} value={nova.detectar} onChange={(e) => setNova({ ...nova, detectar: e.target.value })} placeholder="`ss -s` e olhar QUAL estado cresce antes de mexer em sysctl" />
          </label>
          <label>
            <span className="eyebrow">{t('Módulo (opcional)')}</span>
            <select className="select" value={nova.moduloId} onChange={(e) => setNova({ ...nova, moduloId: e.target.value })}>
              <option value="">— {t('nenhum')} —</option>
              {modulos.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.titulo}
                </option>
              ))}
            </select>
          </label>
          <button className="btn btn--primary btn--block" type="submit">
            {t('Anotar')}
          </button>
        </form>
      )}

      {lista === null ? (
        <Carregando texto={t('Abrindo o diário…')} cartoes={2} />
      ) : !visiveis.length ? (
        <Vazio titulo={filtro ? t('Nenhum erro anotado neste módulo') : t('O diário está vazio')}>
          {filtro
            ? t('Troque o filtro ou anote o primeiro deste módulo.')
            : t('Na próxima vez que errar numa lição, anote aqui. Em um mês isto vira o melhor roteiro de revisão que você tem — porque é feito só dos seus erros.')}
        </Vazio>
      ) : (
        <ul className="diario__lista">
          {visiveis.map((e) => (
            <li key={e.id} className="card diario__item">
              <div className="diario__cab">
                <b>{e.titulo || e.termoId || t('sem título')}</b>
                <span className="dim mono small">{fmtDataCurta(e.dia)}</span>
              </div>
              {e.moduloId && (
                <Link to={`/modulo/${e.moduloId}`} className="chip chip--xs">
                  {(modulos.find((m) => m.id === e.moduloId) || {}).titulo || e.moduloId}
                </Link>
              )}
              {editando === e.id ? (
                <EditarEntrada entrada={e} onSalvar={(campos) => salvarEdicao(e.id, campos)} onCancelar={() => setEditando(null)} />
              ) : (
                <>
                  {e.achei && <p><span className="eyebrow">{t('Eu achei')}</span> {e.achei}</p>}
                  {e.era && <p><span className="eyebrow">{t('Era')}</span> {e.era}</p>}
                  {e.detectar && <p className="diario__detectar"><span className="eyebrow">{t('Da próxima, detecto por')}</span> {e.detectar}</p>}
                  <div className="diario__botoes">
                    <button className="btn btn--sm btn--ghost" onClick={() => setEditando(e.id)}>
                      {t('editar')}
                    </button>
                    <button className="btn btn--sm btn--ghost" onClick={() => setApagar(e)}>
                      {t('apagar')}
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {apagar && (
        <Confirmar
          titulo={t('Apagar esta entrada?')}
          texto={apagar.titulo || t('Esta entrada do diário')}
          confirmar={t('Apagar')}
          perigo
          onSim={async () => {
            await api.diarioRemover(apagar.id)
            setApagar(null)
            carregar()
          }}
          onNao={() => setApagar(null)}
        />
      )}
    </div>
  )
}

function EditarEntrada({ entrada, onSalvar, onCancelar }) {
  const [campos, setCampos] = useState({ titulo: entrada.titulo, achei: entrada.achei, era: entrada.era, detectar: entrada.detectar })
  return (
    <form
      className="diario__form"
      onSubmit={(e) => {
        e.preventDefault()
        onSalvar(campos)
      }}
    >
      <input className="input" value={campos.titulo} onChange={(e) => setCampos({ ...campos, titulo: e.target.value })} aria-label="Título" />
      <textarea className="textarea" rows={2} value={campos.achei} onChange={(e) => setCampos({ ...campos, achei: e.target.value })} aria-label="O que eu achei" />
      <textarea className="textarea" rows={2} value={campos.era} onChange={(e) => setCampos({ ...campos, era: e.target.value })} aria-label="O que era" />
      <textarea className="textarea" rows={2} value={campos.detectar} onChange={(e) => setCampos({ ...campos, detectar: e.target.value })} aria-label="Como detectar da próxima" />
      <div className="diario__botoes">
        <button className="btn btn--sm btn--primary" type="submit">
          salvar
        </button>
        <button className="btn btn--sm btn--ghost" type="button" onClick={onCancelar}>
          cancelar
        </button>
      </div>
    </form>
  )
}
