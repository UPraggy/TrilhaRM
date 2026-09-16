import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { Carregando } from '../components/Comuns.jsx'
import { IcoX } from '../components/Icones.jsx'
import Flashcards from '../modes/Flashcards.jsx'
import Quiz from '../modes/Quiz.jsx'
import Digitar from '../modes/Digitar.jsx'
import Associar from '../modes/Associar.jsx'
import VF from '../modes/VF.jsx'
import Explique from '../modes/Explique.jsx'
import { filtrarVencidos, montarPlano, ordenarParaEstudo } from '../lib/sessao.js'
import { chaveTermo, nomeModo, MODOS } from '../lib/util.js'

const LIMITE_SESSAO = 30

/**
 * /estudar/:modo?fonte=deck:ID | revisao | tudo | termo:deck/id  [&so=vencidos] [&n=30]
 * Monta a fila, roda um modo por passo e grava cada avaliação na API.
 */
export default function Estudo() {
  const { modo } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { termos, progresso, hoje, avaliar, carregando } = useStore()

  const fonte = params.get('fonte') || 'tudo'
  const soVencidos = params.get('so') === 'vencidos' || fonte === 'revisao'
  const limite = Number(params.get('n')) || LIMITE_SESSAO
  const modoValido = MODOS.some((m) => m.id === modo)

  // fila congelada no início da sessão (não muda quando o progresso muda)
  const [plano, setPlano] = useState(null)
  const [passo, setPasso] = useState(0)
  const [resultados, setResultados] = useState([])
  const [pulados, setPulados] = useState(0)
  const chaveSessao = `${modo}|${fonte}|${soVencidos}|${limite}`
  const chaveMontada = useRef(null)

  const pool = useMemo(() => termos, [termos])

  useEffect(() => {
    if (!termos.length || chaveMontada.current === chaveSessao) return
    let base = termos
    if (fonte.startsWith('deck:')) base = termos.filter((t) => t.deckId === fonte.slice(5))
    else if (fonte.startsWith('termo:')) {
      const k = decodeURIComponent(fonte.slice(6))
      base = termos.filter((t) => chaveTermo(t) === k)
    }
    let selecionados
    if (soVencidos) selecionados = filtrarVencidos(base, progresso, hoje, { incluirNovos: fonte === 'revisao' ? false : false })
    else selecionados = base
    selecionados = ordenarParaEstudo(selecionados, progresso, hoje).slice(0, limite)
    setPlano(montarPlano(selecionados, modo, pool))
    setPasso(0)
    setResultados([])
    setPulados(0)
    chaveMontada.current = chaveSessao
  }, [termos, chaveSessao, fonte, soVencidos, limite, modo, pool, progresso, hoje])

  const gravar = useCallback(
    (lista) => {
      for (const r of lista) {
        avaliar({ deckId: r.item.deckId, termoId: r.item.id, nota: r.nota, modo: plano[passo].modo, resposta: r.resposta }).catch(() => {})
      }
      setResultados((rs) => [...rs, ...lista.map((r) => ({ chave: chaveTermo(r.item), termo: r.item.termo, nota: r.nota }))])
      setPasso((p) => p + 1)
    },
    [avaliar, plano, passo],
  )

  const pular = useCallback(() => {
    setPulados((n) => n + 1)
    setPasso((p) => p + 1)
  }, [])
  const voltar = useCallback(() => setPasso((p) => Math.max(0, p - 1)), [])

  if (!modoValido) {
    return (
      <div className="vazio">
        Modo <code>{modo}</code> não existe. <Link to="/">Voltar</Link>
      </div>
    )
  }
  if (carregando && !termos.length) return <Carregando />
  if (!plano) return <Carregando texto="Montando a sessão…" />

  const titulo = fonte === 'revisao' ? 'Revisão do dia' : fonte === 'tudo' ? 'Todos os decks' : fonte.startsWith('deck:') ? termos.find((t) => t.deckId === fonte.slice(5))?.deckTitulo || fonte.slice(5) : 'Termo'

  if (plano.length === 0) {
    return (
      <div className="fim card">
        <div className="eyebrow">{titulo}</div>
        <h2 style={{ marginTop: 8 }}>{soVencidos ? 'Nada vencido aqui.' : 'Nenhum termo para estudar.'}</h2>
        <p className="muted" style={{ marginTop: 8 }}>
          {soVencidos ? 'Volte amanhã ou estude o conjunto todo.' : 'Confira se há decks em content/decks/.'}
        </p>
        <div className="acoes" style={{ justifyContent: 'center' }}>
          {soVencidos && fonte !== 'revisao' && (
            <Link to={`/estudar/${modo}?fonte=${fonte}`} className="btn btn--primary">
              Estudar tudo do deck
            </Link>
          )}
          {fonte === 'revisao' && (
            <Link to="/estudar/misto?fonte=tudo" className="btn btn--primary">
              Misturar tudo
            </Link>
          )}
          <Link to="/" className="btn btn--ghost">
            Início
          </Link>
        </div>
      </div>
    )
  }

  const totalItens = plano.reduce((a, p) => a + p.itens.length, 0)
  const feitosItens = plano.slice(0, passo).reduce((a, p) => a + p.itens.length, 0)

  if (passo >= plano.length) {
    const avaliados = resultados.length
    const media = avaliados ? resultados.reduce((a, r) => a + r.nota, 0) / avaliados : 0
    const fortes = resultados.filter((r) => r.nota >= 3).length
    return (
      <div className="fim card">
        <div className="eyebrow">{titulo} · sessão concluída</div>
        <div className="fim__n" style={{ marginTop: 10 }}>
          {avaliados}
        </div>
        <p className="muted">{avaliados === 1 ? 'avaliação gravada' : 'avaliações gravadas'}{pulados ? ` · ${pulados} pulados` : ''}</p>
        <div className="stats" style={{ marginTop: 14, textAlign: 'left' }}>
          <div className="stat">
            <div className="stat__v">{media.toFixed(1)}</div>
            <div className="stat__l">nota média</div>
          </div>
          <div className="stat">
            <div className="stat__v green">{fortes}</div>
            <div className="stat__l">com nota ≥ 3</div>
          </div>
          <div className="stat">
            <div className="stat__v rose">{avaliados - fortes}</div>
            <div className="stat__l">abaixo de 3</div>
          </div>
          <div className="stat">
            <div className="stat__v amber">{progresso.streak?.atual || 0}</div>
            <div className="stat__l">dias de ofensiva</div>
          </div>
        </div>
        {avaliados - fortes > 0 && (
          <div className="card card--flat" style={{ marginTop: 14, textAlign: 'left' }}>
            <div className="eyebrow">Para voltar</div>
            <div className="rel" style={{ marginTop: 6 }}>
              {resultados
                .filter((r) => r.nota < 3)
                .map((r) => (
                  <span key={r.chave} className="chip chip--rose">
                    {r.termo} · {r.nota}
                  </span>
                ))}
            </div>
          </div>
        )}
        <div className="acoes" style={{ justifyContent: 'center' }}>
          <button
            className="btn btn--primary"
            onClick={() => {
              chaveMontada.current = null
              setPlano(null)
            }}
          >
            Outra rodada
          </button>
          <Link to="/" className="btn btn--ghost">
            Início
          </Link>
        </div>
      </div>
    )
  }

  const atual = plano[passo]
  const item = atual.itens[0]
  const comum = { item, pool, onConcluir: gravar }

  let tela
  switch (atual.modo) {
    case 'quiz':
      tela = <Quiz key={passo} {...comum} />
      break
    case 'quiz-inv':
      tela = <Quiz key={passo} {...comum} invertido />
      break
    case 'digitar':
      tela = <Digitar key={passo} {...comum} />
      break
    case 'associar':
      tela = <Associar key={passo} itens={atual.itens} onConcluir={gravar} />
      break
    case 'vf':
      tela = <VF key={passo} {...comum} />
      break
    case 'explique':
      tela = <Explique key={passo} {...comum} />
      break
    default:
      tela = <Flashcards key={passo} {...comum} onPular={pular} onVoltar={passo > 0 ? voltar : null} />
  }

  return (
    <div>
      <div className="estudo__top">
        <button className="btn btn--ghost estudo__sair" onClick={() => navigate(-1)} aria-label="Sair da sessão" title="Sair">
          <IcoX />
        </button>
        <div style={{ flex: 1 }}>
          <div className="row row--between small" style={{ marginBottom: 4 }}>
            <span className="muted">
              {titulo} · <span className="peri">{nomeModo(atual.modo)}</span>
            </span>
            <span className="estudo__count">
              {feitosItens + 1}
              {atual.itens.length > 1 ? `–${feitosItens + atual.itens.length}` : ''}/{totalItens}
            </span>
          </div>
          <div className="bar">
            <i style={{ width: `${(feitosItens / totalItens) * 100}%` }} />
          </div>
        </div>
      </div>
      {tela}
    </div>
  )
}
