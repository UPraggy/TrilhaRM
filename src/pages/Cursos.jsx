import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import { Barra, Carregando, Erro } from '../components/Comuns.jsx'
import { IcoCurso, IcoSeta } from '../components/Icones.jsx'
import '../cursos.css'

/**
 * /cursos — cursos escritos em Markdown (content/cursos/*.md), com progresso e "continuar".
 * Conteúdo novo é só um arquivo .md na pasta: o servidor recarrega pelo mtime, sem restart.
 */
export default function Cursos() {
  const [cursos, setCursos] = useState(null)
  const [erros, setErros] = useState([])
  const [erro, setErro] = useState(null)

  const carregar = useCallback(() => {
    setErro(null)
    api
      .cursos()
      .then((r) => {
        setCursos(r.cursos || [])
        setErros(r.erros || [])
      })
      .catch((e) => setErro(e.message))
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  if (erro) return <Erro texto={erro} onRetry={carregar} />
  if (!cursos) return <Carregando />

  const totalLicoes = cursos.reduce((a, c) => a + c.totalLicoes, 0)
  const feitas = cursos.reduce((a, c) => a + c.progresso.concluidas, 0)

  return (
    <div>
      <div className="eyebrow">§27 · Trilha guiada</div>
      <h1 className="mt-1">Cursos</h1>
      <p className="muted small mt-1">
        Lições em Markdown com <b>atividades embutidas</b>: a nota de cada atividade vira avaliação SM-2 no termo principal, igual às práticas.
        Para adicionar conteúdo, solte um arquivo <code>.md</code> em <code>content/cursos/</code> — sem restart, sem código.
      </p>

      {erros.length > 0 && (
        <div className="card card--flat mt-4">
          <div className="eyebrow">Avisos de conteúdo ({erros.length})</div>
          <ul className="criterios">
            {erros.slice(0, 8).map((e, i) => (
              <li key={i} className="small mono" style={{ overflowWrap: 'anywhere' }}>
                {e}
              </li>
            ))}
          </ul>
        </div>
      )}

      {cursos.length > 0 && (
        <div className="card card--2 mt-4">
          <div className="stats">
            <div className="stat">
              <div className="stat__v green">{feitas}</div>
              <div className="stat__l">lições de {totalLicoes}</div>
            </div>
            <div className="stat">
              <div className="stat__v">{cursos.length}</div>
              <div className="stat__l">{cursos.length === 1 ? 'curso' : 'cursos'}</div>
            </div>
            <div className="stat">
              <div className="stat__v amber">{cursos.reduce((a, c) => a + c.totalAtividades, 0)}</div>
              <div className="stat__l">atividades</div>
            </div>
            <div className="stat">
              <div className="stat__v">{totalLicoes ? Math.round((feitas / totalLicoes) * 100) : 0}%</div>
              <div className="stat__l">concluído</div>
            </div>
          </div>
          <div className="mt-4">
            <Barra valor={feitas} max={totalLicoes} grande cor="green" />
          </div>
        </div>
      )}

      {cursos.map((c) => (
        <div key={c.id} className="card mt-5">
          <div className="curso-card__head">
            <span className="chip chip--peri">F{c.fase}</span>
            <Link to={`/curso/${c.id}`} className="curso-card__t">
              {c.titulo}
            </Link>
            <span className="dim small mono">
              {c.progresso.concluidas}/{c.totalLicoes}
            </span>
          </div>
          {c.descricao && <p className="curso-card__d">{c.descricao}</p>}
          <div className="ctx mt-3">
            <span className="chip">
              {c.totalModulos} {c.totalModulos === 1 ? 'módulo' : 'módulos'}
            </span>
            <span className="chip">
              {c.totalLicoes} {c.totalLicoes === 1 ? 'lição' : 'lições'}
            </span>
            {c.totalAtividades > 0 && <span className="chip chip--amber">{c.totalAtividades} atividades</span>}
            {c.deck && (
              <Link to={`/deck/${c.deck}`} className="chip chip--peri">
                deck {c.deck}
              </Link>
            )}
            {(c.tags || []).slice(0, 3).map((t) => (
              <span key={t} className="chip">
                {t}
              </span>
            ))}
          </div>
          <div className="mt-4">
            <Barra valor={c.progresso.concluidas} max={c.totalLicoes} cor={c.progresso.pct === 100 ? 'green' : ''} />
          </div>
          <div className="acoes">
            {c.progresso.continuar && (
              <Link to={`/curso/${c.id}/licao/${c.progresso.continuar.id}`} className="btn btn--primary">
                <IcoSeta /> {c.progresso.concluidas ? 'Continuar' : 'Começar'} · {c.progresso.continuar.titulo}
              </Link>
            )}
            <Link to={`/curso/${c.id}`} className="btn btn--ghost">
              <IcoCurso /> Ver o sumário
            </Link>
          </div>
        </div>
      ))}

      {cursos.length === 0 && (
        <div className="vazio">
          Nenhum curso em <code>content/cursos/</code>. Veja o <code>README.md</code> da pasta para o formato — e{' '}
          <code>COMO-PEDIR-PARA-UMA-IA.md</code> para gerar um módulo novo com qualquer IA.
        </div>
      )}
    </div>
  )
}
