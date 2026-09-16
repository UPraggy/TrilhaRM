import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Barra, Carregando, Erro } from '../components/Comuns.jsx'
import { classeNivel, fmtNivel } from '../lib/util.js'
import { apiTreinos } from '../lib/apiTreinos.js'
import '../treinos.css'

const FILTROS = [
  { id: 'todos', nome: 'Todos' },
  { id: 'novo', nome: 'Novos' },
  { id: 'andamento', nome: 'Em andamento' },
  { id: 'concluido', nome: 'Concluídos' },
]

export function rotuloEstado(estado) {
  if (estado === 'concluido') return { rotulo: 'concluído', classe: 'chip--green' }
  if (estado === 'andamento') return { rotulo: 'em andamento', classe: 'chip--amber' }
  return { rotulo: 'novo', classe: '' }
}

export function duracaoTreino(t) {
  if (t.duracaoDias) return `${t.duracaoDias} ${t.duracaoDias === 1 ? 'dia' : 'dias'}`
  const h = Math.floor(t.tempoTotalMin / 60)
  const m = t.tempoTotalMin % 60
  return h ? `${h}h${m ? String(m).padStart(2, '0') : ''}` : `${m} min`
}

/**
 * /treinos — lista dos Treinos Especiais (content/treinos/*.json).
 * Cada treino é um módulo com começo/meio/fim: etapas de tipos diferentes, nota e recompensa no fim.
 */
export default function Treinos() {
  const [dados, setDados] = useState(null)
  const [erro, setErro] = useState(null)
  const [filtro, setFiltro] = useState('todos')

  const carregar = () => {
    setErro(null)
    apiTreinos
      .listar()
      .then(setDados)
      .catch((e) => setErro(e.message || 'falha ao carregar'))
  }
  useEffect(carregar, [])

  const treinos = dados ? dados.treinos || [] : []
  const geral = useMemo(() => {
    const g = { total: treinos.length, concluidos: 0, andamento: 0, somaNota: 0, comNota: 0 }
    for (const t of treinos) {
      const p = t.progresso || {}
      if (p.estado === 'concluido') g.concluidos += 1
      else if (p.estado === 'andamento') g.andamento += 1
      if (typeof p.notaFinal === 'number') {
        g.somaNota += p.notaFinal
        g.comNota += 1
      }
    }
    return g
  }, [treinos])

  if (erro) return <Erro texto={erro} onRetry={carregar} />
  if (!dados) return <Carregando />

  const lista = treinos.filter((t) => filtro === 'todos' || (t.progresso || {}).estado === filtro)
  const emAndamento = treinos.find((t) => (t.progresso || {}).estado === 'andamento')

  return (
    <div>
      <div className="eyebrow">§27 · Temporadas</div>
      <div className="trn-topo">
        <h1>Treinos Especiais</h1>
      </div>
      <p className="muted small" style={{ marginTop: 6 }}>
        Um módulo com começo, meio e fim: leitura, desafio no terminal, rodada cronometrada, simulado de entrevista, mini-projeto e a etapa de ensinar. Cada
        etapa tem uma entrega — e a nota vira revisão SM-2 nos termos. Para importar um treino novo, jogue o JSON em <code>content/treinos/</code> e recarregue
        (o prompt pronto para a IA está em <code>content/treinos/PROMPT-MASTER.md</code>).
      </p>

      <div className="card card--2" style={{ marginTop: 12 }}>
        <div className="stats">
          <div className="stat">
            <div className="stat__v green">{geral.concluidos}</div>
            <div className="stat__l">concluídos de {geral.total}</div>
          </div>
          <div className="stat">
            <div className="stat__v amber">{geral.andamento}</div>
            <div className="stat__l">em andamento</div>
          </div>
          <div className="stat">
            <div className={`stat__v ${classeNivel(geral.comNota ? geral.somaNota / geral.comNota : null)}`}>
              {fmtNivel(geral.comNota ? geral.somaNota / geral.comNota : null)}
            </div>
            <div className="stat__l">nota média</div>
          </div>
        </div>
        {emAndamento && (
          <div className="acoes">
            <Link to={`/treino/${emAndamento.id}`} className="btn btn--lg btn--primary">
              Continuar · {emAndamento.titulo}
            </Link>
          </div>
        )}
      </div>

      <div className="filtros" style={{ marginTop: 14 }}>
        <span className="toggle" role="group" aria-label="Status">
          {FILTROS.map((f) => (
            <button key={f.id} className={filtro === f.id ? 'active' : ''} onClick={() => setFiltro(f.id)}>
              {f.nome}
            </button>
          ))}
        </span>
      </div>

      <div className="trn-grid">
        {lista.map((t) => {
          const p = t.progresso || {}
          const st = rotuloEstado(p.estado)
          return (
            <Link key={t.id} to={`/treino/${t.id}`} className="trn-card">
              <div className="trn-card__topo">
                <span className={`chip mono ${classeNivel(t.nivel)}`} title={`nível alvo ${t.nivel}`}>
                  nv {t.nivel}
                </span>
                <span className="trn-card__titulo">{t.titulo}</span>
                <span className={`chip ${st.classe}`}>{st.rotulo}</span>
              </div>
              {t.subtitulo && <div className="trn-card__sub">{t.subtitulo}</div>}
              <div className="trn-card__meta">
                <span className="chip chip--peri">{duracaoTreino(t)}</span>
                <span className="chip">{t.etapas} etapas</span>
                {t.tipos.slice(0, 3).map((x) => (
                  <span key={x} className="chip">
                    {x}
                  </span>
                ))}
              </div>
              <div className="trn-card__rodape">
                <Barra valor={p.concluidas || 0} max={p.total || t.etapas || 1} cor={p.estado === 'concluido' ? 'green' : 'peri'} />
                <span className="trn-dim mono">
                  {p.concluidas || 0}/{p.total || t.etapas}
                  {typeof p.notaFinal === 'number' ? ` · ${fmtNivel(p.notaFinal)}` : ''}
                </span>
              </div>
            </Link>
          )
        })}
      </div>

      {!treinos.length && (
        <div className="vazio">
          Nenhum treino em <code>content/treinos/</code>. Veja o README da pasta para o formato.
        </div>
      )}
      {!lista.length && treinos.length > 0 && <div className="vazio">Nada com esse filtro.</div>}

      {dados.erros && dados.erros.length > 0 && (
        <div className="trn-erro">
          <b>Avisos do conteúdo:</b>
          <ul className="trn-lista">
            {dados.erros.slice(0, 8).map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
