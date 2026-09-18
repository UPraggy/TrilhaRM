import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import { useStore } from '../store.jsx'
import { Barra, Carregando, Erro, Esqueleto, Vazio } from '../components/Comuns.jsx'
import {
  IcoCartas,
  IcoChama,
  IcoChevron,
  IcoCurso,
  IcoGiro,
  IcoRelogio,
  IcoRetomar,
  IcoSeta,
  IcoTerminal,
} from '../components/Icones.jsx'
import { classeNivel, fmtNivel, MODOS_LIVRES, pct } from '../lib/util.js'

/* ------------------------------------------------------------------ *
 * tempo estimado de uma lição: palavras do texto + 5 min por atividade
 * ------------------------------------------------------------------ */
const NAO_E_TEXTO = new Set(['id', 'tipo', 't', 'deckId', 'termoId', 'alvo', 'moduloId', 'existe', 'arquivo', 'lang', 'idioma', 'ordem', 'classe'])

function contarPalavras(no) {
  if (no == null) return 0
  if (typeof no === 'string') return no.trim() ? no.trim().split(/\s+/).length : 0
  if (Array.isArray(no)) return no.reduce((a, x) => a + contarPalavras(x), 0)
  if (typeof no === 'object') {
    let n = 0
    for (const [k, v] of Object.entries(no)) if (!NAO_E_TEXTO.has(k)) n += contarPalavras(v)
    return n
  }
  return 0
}

function minutosDaLicao(curso, licaoId) {
  const licao = (curso.modulos || []).flatMap((m) => m.licoes || []).find((l) => l.id === licaoId)
  if (!licao) return null
  const leitura = contarPalavras(licao.blocos) / 180
  return Math.max(2, Math.min(45, Math.round(leitura + (licao.atividades || []).length * 5)))
}

function Minutos({ min }) {
  if (min == null) return <Esqueleto className="skel--chip" />
  return (
    <span className="chip chip--peri">
      <IcoRelogio width={13} height={13} /> ~{min} min
    </span>
  )
}

/* ------------------------------------------------------------------ *
 * deck (dentro da fase)
 * ------------------------------------------------------------------ */
function DeckCard({ deck, res }) {
  const media = res && res.vistos ? res.somaNivel / res.vistos : null
  const cobertura = res ? res.total - res.nuncaVistos : 0
  return (
    <Link to={`/deck/${deck.id}`} className="card card--link deck">
      <div className="deck__top">
        <div style={{ flex: '1 1 auto', minWidth: 0 }}>
          <div className="deck__title">{deck.titulo}</div>
          {deck.descricao && <div className="deck__desc">{deck.descricao}</div>}
        </div>
        <div className={`deck__nivel ${classeNivel(media)}`} title="nível médio (0–5)">
          {fmtNivel(media)}
        </div>
      </div>
      <Barra valor={cobertura} max={deck.totalTermos} cor={media != null && media >= 3 ? 'green' : ''} />
      <div className="deck__meta" style={{ marginTop: 8 }}>
        <span className="chip">{deck.totalTermos} termos</span>
        {res && res.vencidos > 0 && <span className="chip chip--amber">{res.vencidos} p/ revisar</span>}
        {res && res.nuncaVistos > 0 && <span className="chip">{res.nuncaVistos} novos</span>}
        {res && res.total > 0 && <span className="chip chip--peri">{pct(res.n3, res.total)}% ≥3</span>}
        {deck.exemplo && <span className="chip chip--rose">exemplo</span>}
      </div>
    </Link>
  )
}

/* ------------------------------------------------------------------ *
 * camada (Decorar / Praticar / Aprender / Treinar)
 * ------------------------------------------------------------------ */
function Camada({ Ico, nome, linha, valor, dica, para, onClick }) {
  const corpo = (
    <>
      <span className="camada__topo">
        <Ico width={18} height={18} />
        <b className="camada__nome">{nome}</b>
      </span>
      <span className="camada__linha">{linha}</span>
      <span className="camada__valor">{valor === null ? <Esqueleto className="skel--linha" style={{ width: '70%' }} /> : valor}</span>
      {dica && <span className="camada__dica dim">{dica}</span>}
    </>
  )
  if (onClick)
    return (
      <button type="button" className="camada" onClick={onClick}>
        {corpo}
      </button>
    )
  return (
    <Link to={para} className="camada">
      {corpo}
    </Link>
  )
}

/* ------------------------------------------------------------------ *
 * Home
 * ------------------------------------------------------------------ */
export default function Home() {
  const {
    decks,
    trilhas,
    resumo,
    progresso,
    carregando,
    erro,
    carregar,
    errosConteudo,
    praticas,
    resumoPraticas,
    cursos,
    treinos,
    resumoCursos,
    resumoTreinos,
    faseAtual,
  } = useStore()

  const [abertas, setAbertas] = useState(null)
  const [estimativas, setEstimativas] = useState({})
  const decorarRef = useRef(null)

  // a fase atual já vem aberta; as outras fechadas
  useEffect(() => {
    if (abertas === null && faseAtual != null) setAbertas(new Set([faseAtual]))
  }, [abertas, faseAtual])

  const alternarFase = useCallback((numero, aberto) => {
    setAbertas((s) => {
      const n = new Set(s || [])
      if (aberto) n.add(numero)
      else n.delete(numero)
      return n
    })
  }, [])

  const est = progresso.praticas || {}
  const s = progresso.streak || {}
  const minimoDia = s.minimoDia || 10
  const feitasHoje = s.avaliacoesHoje || 0
  const faltamHoje = Math.max(0, minimoDia - feitasHoje)
  const vistosTotal = resumo.total - resumo.nuncaVistos

  /* ---------------- o que está em andamento ---------------- */
  const continuar = useMemo(() => {
    const itens = []
    for (const c of cursos || []) {
      const p = c.progresso || {}
      if (p.continuar && p.concluidas > 0 && p.pct < 100)
        itens.push({
          chave: `licao:${c.id}/${p.continuar.id}`,
          tipo: 'licao',
          rotulo: 'Lição',
          Ico: IcoCurso,
          titulo: p.continuar.titulo,
          contexto: `${c.titulo} · ${p.concluidas}/${c.totalLicoes} lições`,
          para: `/curso/${c.id}/licao/${p.continuar.id}`,
          buscar: { cursoId: c.id, licaoId: p.continuar.id },
        })
    }
    for (const t of treinos || []) {
      const p = t.progresso || {}
      if (p.estado !== 'andamento') continue
      const etapaId = p.etapaAtual || p.proximaEtapa
      itens.push({
        chave: `treino:${t.id}/${etapaId || '-'}`,
        tipo: 'treino',
        rotulo: 'Treino',
        Ico: IcoChama,
        titulo: t.titulo,
        contexto: `etapa ${Math.min((p.concluidas || 0) + 1, p.total || t.etapas)} de ${p.total || t.etapas}`,
        para: `/treino/${t.id}`,
        buscar: etapaId ? { treinoId: t.id, etapaId } : null,
      })
    }
    for (const p of praticas)
      for (const ex of p.exercicios) {
        const e = est[`${p.deckId}/${ex.id}`]
        if (!e || e.estado !== 'andamento') continue
        itens.push({
          chave: `pratica:${p.deckId}/${ex.id}`,
          tipo: 'pratica',
          rotulo: 'Exercício',
          Ico: IcoTerminal,
          titulo: ex.titulo,
          contexto: p.deckTitulo,
          para: `/pratica/${p.deckId}/${ex.id}`,
          min: ex.tempoMin,
        })
      }
    return itens.slice(0, 6)
  }, [cursos, treinos, praticas, est])

  // busca o tempo estimado do que a lista não traz (lição: palavras · treino: etapa)
  const pedidos = continuar
    .filter((i) => i.buscar)
    .map((i) => i.chave)
    .join('|')
  useEffect(() => {
    const faltando = continuar.filter((i) => i.buscar && estimativas[i.chave] === undefined)
    if (!faltando.length) return
    let vivo = true
    Promise.all(
      faltando.map(async (i) => {
        try {
          if (i.tipo === 'licao') {
            const curso = await api.curso(i.buscar.cursoId)
            return [i.chave, minutosDaLicao(curso, i.buscar.licaoId)]
          }
          const r = await api.treino(i.buscar.treinoId)
          const etapa = ((r.treino && r.treino.etapas) || []).find((e) => e.id === i.buscar.etapaId)
          return [i.chave, etapa ? etapa.tempoMin : null]
        } catch {
          return [i.chave, null]
        }
      }),
    ).then((pares) => {
      if (vivo) setEstimativas((m) => ({ ...m, ...Object.fromEntries(pares) }))
    })
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidos])

  /* ---------------- a ação do dia ---------------- */
  const acao = useMemo(() => {
    if (resumo.vencidos > 0)
      return {
        rotulo: `Revisar ${resumo.vencidos} ${resumo.vencidos === 1 ? 'termo' : 'termos'}`,
        para: '/estudar/misto?fonte=revisao',
        Ico: IcoGiro,
        porque: `Vencidos no SM-2. São ~${Math.max(1, Math.round(resumo.vencidos * 0.4))} min e já fecham a ofensiva.`,
      }
    const emAndamento = continuar[0]
    if (emAndamento)
      return {
        rotulo: `Continuar · ${emAndamento.titulo}`,
        para: emAndamento.para,
        Ico: IcoRetomar,
        porque: `${emAndamento.rotulo} em andamento — ${emAndamento.contexto}.`,
      }
    if (resumo.nuncaVistos > 0)
      return {
        rotulo: `Aprender ${Math.min(resumo.nuncaVistos, 30)} termos novos`,
        para: '/estudar/misto?fonte=tudo',
        Ico: IcoCartas,
        porque: `Sobram ${resumo.nuncaVistos} termos que você ainda não viu — a sessão puxa os novos primeiro.`,
      }
    const cursoNovo = (cursos || []).find((c) => c.progresso && c.progresso.continuar && c.progresso.pct < 100)
    if (cursoNovo)
      return {
        rotulo: `Começar · ${cursoNovo.progresso.continuar.titulo}`,
        para: `/curso/${cursoNovo.id}/licao/${cursoNovo.progresso.continuar.id}`,
        Ico: IcoCurso,
        porque: `Tudo em dia. A próxima lição de "${cursoNovo.titulo}" está esperando.`,
      }
    const treinoNovo = (treinos || []).find((t) => (t.progresso || {}).estado !== 'concluido')
    if (treinoNovo)
      return {
        rotulo: `Abrir treino · ${treinoNovo.titulo}`,
        para: `/treino/${treinoNovo.id}`,
        Ico: IcoChama,
        porque: 'Tudo em dia. Uma temporada com começo, meio e fim.',
      }
    for (const p of praticas)
      for (const ex of p.exercicios)
        if (!est[`${p.deckId}/${ex.id}`])
          return {
            rotulo: `Fazer um exercício · ${ex.titulo}`,
            para: `/pratica/${p.deckId}/${ex.id}`,
            Ico: IcoTerminal,
            porque: `Tudo em dia. Exercício de ${p.deckTitulo}, ~${ex.tempoMin} min fora do app.`,
          }
    return {
      rotulo: 'Misturar tudo',
      para: '/estudar/misto?fonte=tudo',
      Ico: IcoGiro,
      porque: 'Nada vencido e nada pendente. Uma rodada livre mantém a ofensiva viva.',
    }
  }, [resumo, continuar, cursos, treinos, praticas, est])

  const irParaDecorar = useCallback(() => {
    if (faseAtual != null) alternarFase(faseAtual, true)
    const alvo = decorarRef.current
    if (!alvo) return
    const suave = !window.matchMedia || !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    alvo.scrollIntoView({ behavior: suave ? 'smooth' : 'auto', block: 'start' })
  }, [faseAtual, alternarFase])

  if (carregando && !decks.length) return <Carregando texto="Carregando a trilha…" />
  if (erro) return <Erro texto={erro} onRetry={carregar} />

  const segmentos = Array.from({ length: minimoDia }, (_, i) => i < feitasHoje)

  return (
    <div className="home">
      {/* ---------- 1. a ação do dia ---------- */}
      <section className="hoje card card--2" aria-labelledby="hoje-t">
        <div className="hoje__eyebrow">
          <span className="eyebrow">Hoje</span>
          <span className="dim small mono">{resumo.hoje}</span>
        </div>
        <h1 id="hoje-t" className="hoje__t">
          {resumo.vencidos > 0 ? (
            <>
              <span className="amber">{resumo.vencidos}</span> {resumo.vencidos === 1 ? 'termo vencido' : 'termos vencidos'}
            </>
          ) : resumo.total === 0 ? (
            'Sem decks ainda'
          ) : (
            'Nada vencido hoje'
          )}
        </h1>
        <p className="hoje__porque muted small">{acao.porque}</p>

        <div className="ofens">
          <div className="bar bar--seg" role="img" aria-label={`${feitasHoje} de ${minimoDia} avaliações hoje`}>
            {segmentos.map((cheio, i) => (
              <i key={i} className={cheio ? 'done' : ''} />
            ))}
          </div>
          <p className="ofens__txt small">
            {s.hojeContou ? (
              <>
                <span className="green">Ofensiva garantida hoje</span> · {feitasHoje} avaliações · {s.atual || 0}{' '}
                {s.atual === 1 ? 'dia' : 'dias'} seguidos
              </>
            ) : (
              <>
                Faltam <b className="amber">{faltamHoje}</b> {faltamHoje === 1 ? 'avaliação' : 'avaliações'} para o dia contar ·{' '}
                {s.atual || 0} {s.atual === 1 ? 'dia' : 'dias'} de ofensiva
              </>
            )}
          </p>
        </div>

        <Link to={acao.para} className="btn btn--primary btn--lg btn--block hoje__cta">
          <acao.Ico />
          <span className="hoje__cta-txt">{acao.rotulo}</span>
        </Link>
        {acao.para !== '/estudar/misto?fonte=tudo' && resumo.total > 0 && (
          <div className="hoje__alt">
            <Link to="/estudar/misto?fonte=tudo" className="btn btn--sm btn--ghost">
              Misturar tudo <IcoSeta width={16} height={16} />
            </Link>
          </div>
        )}
      </section>

      {/* ---------- 2. continuar de onde parei ---------- */}
      {(cursos === null || treinos === null || continuar.length > 0) && (
        <section className="section section--tight" aria-labelledby="cont-t">
          <div className="section__head">
            <span className="section__num">§</span>
            <h2 id="cont-t">Continuar de onde parei</h2>
          </div>
          {cursos === null || treinos === null ? (
            <div className="fita" aria-hidden="true">
              {[0, 1].map((i) => (
                <div className="retomar" key={i}>
                  <Esqueleto className="skel--linha" style={{ width: '40%' }} />
                  <Esqueleto className="skel--linha" style={{ width: '85%' }} />
                  <Esqueleto className="skel--chip" />
                </div>
              ))}
            </div>
          ) : (
            <div className="fita">
              {continuar.map((i) => (
                <Link key={i.chave} to={i.para} className="retomar">
                  <span className="retomar__topo">
                    <i.Ico width={16} height={16} />
                    <span className="eyebrow">{i.rotulo}</span>
                  </span>
                  <span className="retomar__t">{i.titulo}</span>
                  <span className="retomar__ctx dim small">{i.contexto}</span>
                  <span className="retomar__pe">
                    <Minutos min={i.min != null ? i.min : estimativas[i.chave]} />
                    <IcoSeta width={16} height={16} />
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ---------- 3. as quatro camadas ---------- */}
      <section className="section section--tight" aria-labelledby="camadas-t">
        <div className="section__head">
          <span className="section__num">§</span>
          <h2 id="camadas-t">As quatro camadas</h2>
          <span className="dim small nota-secao">o mesmo termo, quatro profundidades</span>
        </div>
        <div className="camadas">
          <Camada
            Ico={IcoCartas}
            nome="Decorar"
            linha="Decks e modos: flashcards, quiz, digitar, associar, V/F, explique."
            valor={`${vistosTotal}/${resumo.total} termos vistos`}
            dica={resumo.vencidos ? `${resumo.vencidos} para revisar` : `${resumo.nuncaVistos} novos`}
            onClick={irParaDecorar}
          />
          <Camada
            Ico={IcoTerminal}
            nome="Praticar"
            linha="Exercício real fora do app; volte e registre a resposta."
            valor={`${resumoPraticas.geral.feitas}/${resumoPraticas.geral.total} exercícios`}
            dica={resumoPraticas.geral.andamento ? `${resumoPraticas.geral.andamento} em andamento` : 'terminal, psql, Docker, papel'}
            para="/praticas"
          />
          <Camada
            Ico={IcoCurso}
            nome="Aprender"
            linha="Aulas em Markdown com atividades corrigidas no meio do texto."
            valor={resumoCursos === null ? null : resumoCursos.total ? `${resumoCursos.feitas}/${resumoCursos.licoes} lições` : 'nenhum curso ainda'}
            dica={resumoCursos && resumoCursos.total ? `${resumoCursos.total} ${resumoCursos.total === 1 ? 'curso' : 'cursos'} · ${resumoCursos.atividades} atividades` : 'solte um .md em content/cursos'}
            para="/cursos"
          />
          <Camada
            Ico={IcoChama}
            nome="Treinar"
            linha="Temporadas com etapas: leitura, desafio, simulado, ensinar."
            valor={resumoTreinos === null ? null : resumoTreinos.total ? `${resumoTreinos.concluidos}/${resumoTreinos.total} temporadas` : 'nenhum treino ainda'}
            dica={resumoTreinos && resumoTreinos.total ? `${resumoTreinos.etapasFeitas}/${resumoTreinos.etapas} etapas feitas` : 'solte um .json em content/treinos'}
            para="/treinos"
          />
        </div>
      </section>

      {errosConteudo.length > 0 && (
        <div className="card aviso" style={{ marginTop: 12 }}>
          <b>Avisos de conteúdo</b> ({errosConteudo.length}):
          <ul className="aviso__lista">
            {errosConteudo.slice(0, 8).map((e, i) => (
              <li key={i}>
                <code>{e}</code>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ---------- 4. decorar: fases recolhíveis ---------- */}
      <section className="section" ref={decorarRef} aria-labelledby="fases-t">
        <div className="section__head">
          <span className="section__num">§</span>
          <h2 id="fases-t">Decorar · fases da trilha</h2>
          {faseAtual != null && <span className="chip chip--amber">agora na F{faseAtual}</span>}
        </div>

        {trilhas.fases.map((fase) => {
          const ds = fase.decks.map((id) => decks.find((d) => d.id === id)).filter(Boolean)
          if (!ds.length) return null
          let total = 0
          let n3 = 0
          let vencidos = 0
          for (const d of ds) {
            const r = resumo.porDeck[d.id]
            if (!r) continue
            total += r.total
            n3 += r.n3
            vencidos += r.vencidos
          }
          const aberta = abertas ? abertas.has(fase.numero) : fase.numero === faseAtual
          return (
            <details
              key={fase.numero}
              className="fase-acc"
              open={aberta}
              onToggle={(e) => alternarFase(fase.numero, e.currentTarget.open)}
            >
              <summary className="fase-acc__head">
                <span className="fase__num">F{fase.numero}</span>
                <span className="fase-acc__txt">
                  <b className="fase-acc__t">{fase.titulo}</b>
                  <span className="fase-acc__meta dim small">
                    {ds.length} {ds.length === 1 ? 'deck' : 'decks'} · {total} termos
                    {vencidos > 0 ? ` · ${vencidos} p/ revisar` : ''}
                  </span>
                </span>
                <span className="fase-acc__pct mono small">{pct(n3, total)}%</span>
                <IcoChevron className="fase-acc__seta" width={18} height={18} aria-hidden="true" />
              </summary>
              <div className="fase-acc__corpo">
                <Barra valor={n3} max={total} cor="peri" />
                {fase.descricao && (
                  <p className="muted small" style={{ marginTop: 8 }}>
                    {fase.descricao}
                  </p>
                )}
                <div className="grid grid--2" style={{ marginTop: 10 }}>
                  {ds.map((d) => (
                    <DeckCard key={d.id} deck={d} res={resumo.porDeck[d.id]} />
                  ))}
                </div>
              </div>
            </details>
          )
        })}

        {decks.length === 0 && (
          <Vazio titulo="Nenhum deck ainda">
            Solte um JSON em <code>content/decks/</code> e volte para esta tela — o servidor recarrega sozinho.
          </Vazio>
        )}
      </section>

      {/* ---------- 5. modos ---------- */}
      <section className="section" aria-labelledby="modos-t">
        <div className="section__head">
          <span className="section__num">§</span>
          <h2 id="modos-t">Modos de estudo</h2>
          <span className="dim small nota-secao">(todos os decks)</span>
        </div>
        <div className="modos">
          {MODOS_LIVRES.map((m, i) => (
            <Link key={m.id} to={`/estudar/${m.id}?fonte=tudo`} className="modo">
              <span className="modo__num">{String(i + 1).padStart(2, '0')}</span>
              <span className="modo__nome">{m.nome}</span>
              <span className="modo__desc">{m.desc}</span>
            </Link>
          ))}
          <Link to="/praticas" className="modo">
            <span className="modo__num">{String(MODOS_LIVRES.length + 1).padStart(2, '0')}</span>
            <span className="modo__nome">Praticar</span>
            <span className="modo__desc">Exercício real fora do app. Volte e registre: o app corrige ou você se avalia.</span>
          </Link>
        </div>
      </section>
    </div>
  )
}
