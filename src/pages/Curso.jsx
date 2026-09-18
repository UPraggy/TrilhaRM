import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api.js'
import Blocos from '../components/Blocos.jsx'
import { Barra, Carregando, Erro } from '../components/Comuns.jsx'
import { IcoCheck, IcoSeta } from '../components/Icones.jsx'
import '../cursos.css'

/** /curso/:id — sumário: intro, módulos, lições com estado e por onde continuar. */
export default function Curso() {
  const { id } = useParams()
  const [curso, setCurso] = useState(null)
  const [erro, setErro] = useState(null)

  const carregar = useCallback(() => {
    setErro(null)
    api
      .curso(id)
      .then(setCurso)
      .catch((e) => setErro(e.message))
  }, [id])

  useEffect(() => {
    setCurso(null)
    carregar()
  }, [carregar])

  if (erro) return <Erro texto={erro} onRetry={carregar} />
  if (!curso) return <Carregando />

  const p = curso.progresso
  const continuar = p.continuar

  return (
    <div>
      <div className="eyebrow">
        <Link to="/cursos" className="muted">
          Cursos
        </Link>{' '}
        / F{curso.fase}
      </div>
      <h1 className="mt-1">{curso.titulo}</h1>
      {curso.descricao && (
        <p className="muted mt-1">
          {curso.descricao}
        </p>
      )}
      <div className="ctx mt-3">
        <span className="chip">
          {curso.totalModulos} {curso.totalModulos === 1 ? 'módulo' : 'módulos'}
        </span>
        <span className="chip">
          {curso.totalLicoes} {curso.totalLicoes === 1 ? 'lição' : 'lições'}
        </span>
        {curso.totalAtividades > 0 && <span className="chip chip--amber">{curso.totalAtividades} atividades</span>}
        {curso.deck && (
          <Link to={`/deck/${curso.deck}`} className="chip chip--peri">
            deck {curso.deck}
          </Link>
        )}
        <span className="chip mono" title="arquivo de origem">
          {curso.arquivo}
        </span>
      </div>

      <div className="card card--2 mt-5">
        <div className="row row--between">
          <div className="eyebrow">Progresso</div>
          <span className="dim small mono">
            {p.concluidas}/{p.total} · {p.pct}%
          </span>
        </div>
        <div className="mt-3">
          <Barra valor={p.concluidas} max={p.total} grande cor={p.pct === 100 ? 'green' : ''} />
        </div>
        {continuar && (
          <div className="acoes">
            <Link to={`/curso/${curso.id}/licao/${continuar.id}`} className="btn btn--lg btn--primary">
              <IcoSeta /> {p.concluidas ? 'Continuar' : 'Começar'} · {continuar.titulo}
            </Link>
          </div>
        )}
      </div>

      {curso.intro && curso.intro.length > 0 && (
        <div className="card mt-5">
          <Blocos blocos={curso.intro} cursoId={curso.id} />
        </div>
      )}

      {curso.modulos.map((m, i) => (
        <section key={m.id} className="curso-mod">
          <div className="curso-mod__head">
            <span className="curso-mod__n">M{i + 1}</span>
            <span className="curso-mod__t">{m.titulo}</span>
            <span className="dim small mono">
              {m.progresso.concluidas}/{m.progresso.total}
            </span>
          </div>
          {m.licoes.map((l) => {
            const ok = Boolean(l.estado && l.estado.concluidaEm)
            const atual = continuar && continuar.id === l.id
            return (
              <Link
                key={l.id}
                to={`/curso/${curso.id}/licao/${l.id}`}
                className={`curso-lic ${ok ? 'curso-lic--ok' : ''} ${atual && !ok ? 'curso-lic--atual' : ''}`}
              >
                <span className="curso-lic__i">{ok && <IcoCheck width={12} height={12} strokeWidth={3} />}</span>
                <span className="curso-lic__t">{l.titulo}</span>
                {l.atividades.length > 0 && (
                  <span className="chip chip--amber" title="atividades nesta lição">
                    {l.atividades.length}
                  </span>
                )}
              </Link>
            )
          })}
        </section>
      ))}
    </div>
  )
}
