import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api.js'
import { useStore } from '../store.jsx'
import Blocos from '../components/Blocos.jsx'
import { Barra, Carregando, Erro } from '../components/Comuns.jsx'
import { IcoCheck, IcoSeta } from '../components/Icones.jsx'
import '../cursos.css'

/**
 * /curso/:id/licao/:licaoId — a lição: blocos vindos do Markdown, atividades embutidas (mesmo fluxo
 * das práticas) e o botão de concluir. Entrar já marca como "última lição vista" (continuar de onde parei).
 */
export default function Licao() {
  const { id, licaoId } = useParams()
  const navegar = useNavigate()
  const { mostrarAviso } = useStore()
  const [curso, setCurso] = useState(null)
  const [erro, setErro] = useState(null)
  const [prog, setProg] = useState(null)
  const [atividades, setAtividades] = useState({})
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(() => {
    setErro(null)
    api
      .curso(id)
      .then((c) => {
        setCurso(c)
        setProg(c.progresso)
        const mapa = {}
        for (const a of c.atividades || []) mapa[a.id] = a
        setAtividades(mapa)
      })
      .catch((e) => setErro(e.message))
  }, [id])

  useEffect(() => {
    setCurso(null)
    carregar()
  }, [carregar])

  // "continuar de onde parei"
  useEffect(() => {
    if (!curso) return
    api
      .cursoLicaoVisto(id, licaoId)
      .then((r) => setProg(r.progresso))
      .catch(() => {})
    window.scrollTo(0, 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, licaoId, Boolean(curso)])

  const ctx = useMemo(() => {
    if (!curso) return null
    const todas = curso.modulos.flatMap((m) => m.licoes.map((l) => ({ ...l, moduloTitulo: m.titulo })))
    const i = todas.findIndex((l) => l.id === licaoId)
    if (i < 0) return { naoExiste: true, todas }
    return { licao: todas[i], anterior: todas[i - 1] || null, proxima: todas[i + 1] || null, indice: i, total: todas.length, todas }
  }, [curso, licaoId])

  const concluir = async (valor) => {
    setSalvando(true)
    try {
      const r = await api.cursoLicaoConcluir(id, licaoId, valor)
      setProg(r.progresso)
      mostrarAviso(valor ? 'Lição concluída.' : 'Lição desmarcada.')
      if (valor && ctx && ctx.proxima) navegar(`/curso/${id}/licao/${ctx.proxima.id}`)
    } catch (e) {
      mostrarAviso(`Não gravou: ${e.message}`, 4000)
    } finally {
      setSalvando(false)
    }
  }

  if (erro) return <Erro texto={erro} onRetry={carregar} />
  if (!curso || !ctx) return <Carregando />
  if (ctx.naoExiste)
    return (
      <Erro
        texto={`A lição "${licaoId}" não existe em ${curso.titulo}.`}
        onRetry={() => navegar(`/curso/${id}`)}
      />
    )

  const { licao, anterior, proxima } = ctx
  const estado = (prog && prog.licoes && prog.licoes[licao.id]) || null
  const concluida = Boolean(estado && estado.concluidaEm)
  const daLicao = licao.atividades.map((a) => atividades[a]).filter(Boolean)
  const feitas = daLicao.filter((a) => a.estado && a.estado.estado === 'concluida').length

  return (
    <div>
      <div className="eyebrow">
        <Link to="/cursos" className="muted">
          Cursos
        </Link>{' '}
        /{' '}
        <Link to={`/curso/${curso.id}`} className="muted">
          {curso.titulo}
        </Link>{' '}
        / {licao.moduloTitulo}
      </div>
      <h1 style={{ marginTop: 6 }}>{licao.titulo}</h1>
      <div className="ctx" style={{ marginTop: 8 }}>
        <span className="chip mono">
          lição {ctx.indice + 1}/{ctx.total}
        </span>
        {daLicao.length > 0 && (
          <span className={`chip ${feitas === daLicao.length ? 'chip--peri' : 'chip--amber'}`}>
            {feitas}/{daLicao.length} atividades
          </span>
        )}
        {concluida && <span className="chip chip--peri">concluída</span>}
      </div>
      {prog && (
        <div style={{ marginTop: 10 }}>
          <Barra valor={prog.concluidas} max={prog.total} cor={prog.pct === 100 ? 'green' : ''} />
        </div>
      )}

      <div className="card" style={{ marginTop: 14 }}>
        <Blocos
          blocos={licao.blocos}
          atividades={atividades}
          cursoId={curso.id}
          aoMudarAtividade={(a) => setAtividades((m) => ({ ...m, [a.id]: a }))}
        />
      </div>

      <div className="card card--2 licao__fim">
        <div className="row row--between">
          <div>
            <div className="eyebrow">{concluida ? 'Lição concluída' : 'Terminou a lição?'}</div>
            <p className="dim small" style={{ margin: '6px 0 0' }}>
              {daLicao.length > 0 && feitas < daLicao.length
                ? `Ainda faltam ${daLicao.length - feitas} de ${daLicao.length} atividades — dá para concluir assim mesmo e voltar depois.`
                : 'Marcar a lição não avalia termo nenhum: quem vira nota SM-2 é a atividade.'}
            </p>
          </div>
        </div>
        <div className="acoes">
          {concluida ? (
            <button className="btn" disabled={salvando} onClick={() => concluir(false)}>
              Desmarcar
            </button>
          ) : (
            <button className="btn btn--primary btn--lg" disabled={salvando} onClick={() => concluir(true)}>
              <IcoCheck /> Marcar como concluída{proxima ? ' e seguir' : ''}
            </button>
          )}
          {proxima && (
            <Link to={`/curso/${curso.id}/licao/${proxima.id}`} className="btn btn--ghost">
              <IcoSeta /> Próxima: {proxima.titulo}
            </Link>
          )}
        </div>
      </div>

      <div className="licao__nav">
        {anterior ? (
          <Link to={`/curso/${curso.id}/licao/${anterior.id}`} className="btn btn--ghost">
            ← {anterior.titulo}
          </Link>
        ) : (
          <Link to={`/curso/${curso.id}`} className="btn btn--ghost">
            ← Sumário
          </Link>
        )}
        {proxima ? (
          <Link to={`/curso/${curso.id}/licao/${proxima.id}`} className="btn">
            {proxima.titulo} →
          </Link>
        ) : (
          <Link to={`/curso/${curso.id}`} className="btn">
            Fim do curso · sumário
          </Link>
        )}
      </div>
    </div>
  )
}
