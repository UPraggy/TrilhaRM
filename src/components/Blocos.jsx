// Renderiza os blocos que a API dos cursos devolve (server/markdown.js → mdParaBlocos).
// Nenhuma lib de markdown no browser: o parse já aconteceu no servidor.
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import { MentorFeedback } from './Comuns.jsx'
import Nivel, { LegendaNiveis } from './Nivel.jsx'
import { IcoCheck, IcoFaisca } from './Icones.jsx'
import { TIPOS_ENTREGA, classeNivel, fmtNivel, nomeAmbiente, statusPratica } from '../lib/util.js'
import '../cursos.css'

const ROTULO_CALLOUT = { objetivo: 'Objetivo', nota: 'Nota', alerta: 'Atenção', exemplo: 'Exemplo' }

/** nós inline: txt · code · b · i · link · wiki */
export function Inline({ nos }) {
  return (nos || []).map((n, i) => {
    if (!n) return null
    if (n.t === 'code') return <code key={i}>{n.v}</code>
    if (n.t === 'b') return <b key={i}>{n.v}</b>
    if (n.t === 'i') return <i key={i}>{n.v}</i>
    if (n.t === 'link') {
      const externo = /^https?:/i.test(n.href || '')
      if (!externo && (n.href || '').startsWith('/'))
        return (
          <Link key={i} to={n.href} title={n.titulo || undefined}>
            {n.v}
          </Link>
        )
      return (
        <a key={i} href={n.href} target="_blank" rel="noreferrer noopener" title={n.titulo || undefined}>
          {n.v}
        </a>
      )
    }
    if (n.t === 'wiki') {
      if (n.existe === false)
        return (
          <span key={i} className="blk-wiki blk-wiki--quebrado" title={`termo "${n.alvo}" não existe em nenhum deck`}>
            {n.v}
          </span>
        )
      return (
        <Link key={i} className="blk-wiki" to={`/glossario?q=${encodeURIComponent(n.termo || n.v)}`} title={`${n.deckId}/${n.termoId}`}>
          {n.v}
        </Link>
      )
    }
    return <span key={i}>{n.v}</span>
  })
}

/**
 * @param blocos  array vindo da API
 * @param atividades  mapa id → atividade (só a lição precisa; o resto pode omitir)
 * @param aoMudarAtividade(atividade)  avisa a página quando uma atividade é concluída
 */
export default function Blocos({ blocos, atividades, cursoId, aoMudarAtividade }) {
  return (
    <div className="blocos">
      {(blocos || []).map((b, i) => (
        <BlocoUm key={i} b={b} atividades={atividades} cursoId={cursoId} aoMudarAtividade={aoMudarAtividade} />
      ))}
    </div>
  )
}

function BlocoUm({ b, atividades, cursoId, aoMudarAtividade }) {
  if (!b) return null
  switch (b.tipo) {
    case 'h2':
      return (
        <h2 className="blk-h2" id={b.id}>
          <Inline nos={b.inline} />
        </h2>
      )
    case 'h3':
      return (
        <h3 className="blk-h3" id={b.id}>
          <Inline nos={b.inline} />
        </h3>
      )
    case 'p':
      return (
        <p>
          <Inline nos={b.inline} />
        </p>
      )
    case 'lista': {
      const Tag = b.ordenada ? 'ol' : 'ul'
      return (
        <Tag className="blk-lista">
          {(b.itens || []).map((it, i) => (
            <li key={i} className={it.nivel ? `n${it.nivel}` : ''}>
              <Inline nos={it.inline} />
            </li>
          ))}
        </Tag>
      )
    }
    case 'codigo':
      return (
        <div>
          {b.lang && <span className="blk-cod__lang">{b.lang}</span>}
          <pre className="blk-cod">{b.codigo}</pre>
        </div>
      )
    case 'tabela':
      return (
        <div className="blk-tab">
          <table>
            <thead>
              <tr>
                {(b.cabecalho || []).map((c, i) => (
                  <th key={i} style={{ textAlign: (b.alinhamento || [])[i] || 'left' }}>
                    <Inline nos={c} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(b.linhas || []).map((l, i) => (
                <tr key={i}>
                  {(l || []).map((c, j) => (
                    <td key={j} style={{ textAlign: (b.alinhamento || [])[j] || 'left' }}>
                      <Inline nos={c} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    case 'citacao':
      return (
        <blockquote className="blk-cita">
          {(b.paragrafos || []).map((p, i) => (
            <p key={i}>
              <Inline nos={p} />
            </p>
          ))}
        </blockquote>
      )
    case 'callout':
      return (
        <aside className={`blk-callout blk-callout--${b.variante}`}>
          <div className="blk-callout__t">{b.titulo || ROTULO_CALLOUT[b.variante] || 'Nota'}</div>
          <Blocos blocos={b.blocos} atividades={atividades} cursoId={cursoId} aoMudarAtividade={aoMudarAtividade} />
        </aside>
      )
    case 'atividade': {
      const a = (atividades || {})[b.atividadeId]
      if (!a)
        return (
          <div className="blk-callout blk-callout--alerta">
            <div className="blk-callout__t">Atividade</div>
            <p className="small">Atividade "{b.atividadeId}" não veio da API.</p>
          </div>
        )
      return <Atividade atividade={a} cursoId={cursoId} aoMudar={aoMudarAtividade} />
    }
    case 'hr':
      return <hr className="blk-hr" />
    default:
      return null
  }
}

/**
 * Atividade embutida na lição. Mesmo fluxo das práticas (e as MESMAS rotas de correção/SM-2 no
 * servidor): resolver fora do app → entregar → nota vira avaliação no termo principal.
 */
export function Atividade({ atividade, cursoId, aoMudar }) {
  const [ex, setEx] = useState(atividade)
  const [estado, setEstado] = useState(atividade.estado || null)
  const [solucao, setSolucao] = useState(atividade.solucaoBlocos || null)
  const [texto, setTexto] = useState((atividade.estado && atividade.estado.rascunho) || '')
  const [numero, setNumero] = useState('')
  const [marcados, setMarcados] = useState([])
  const [dicasVistas, setDicasVistas] = useState((atividade.dicas || []).slice(0, (atividade.estado && atividade.estado.dicasUsadas) || 0))
  const [feedback, setFeedback] = useState(null)
  const [mentor, setMentor] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [ajustando, setAjustando] = useState(false)
  const iniciou = useRef(Boolean(atividade.estado))
  const rascunhoRef = useRef((atividade.estado && atividade.estado.rascunho) || '')
  const timerRef = useRef(null)

  // Só re-sincroniza quando é OUTRA atividade no mesmo slot. Sem o guarda, o setAtividades do pai
  // (disparado por aoMudar) devolveria a versão sem gabarito e apagaria a solução recém-revelada.
  const idRef = useRef(atividade.id)
  useEffect(() => {
    if (idRef.current === atividade.id) return
    idRef.current = atividade.id
    setEx(atividade)
    setEstado(atividade.estado || null)
    setSolucao(atividade.solucaoBlocos || null)
    setTexto((atividade.estado && atividade.estado.rascunho) || '')
    setNumero('')
    setMarcados([])
    setFeedback(null)
    setMentor(null)
  }, [atividade])

  const tipo = ex.entrega.tipo
  const concluida = Boolean(estado && estado.estado === 'concluida')
  const st = statusPratica(estado)

  const aplicar = (s, solucaoNova) => {
    if (!s) return
    setEstado(s)
    if (aoMudar) aoMudar({ ...ex, estado: s, solucaoBlocos: solucaoNova || solucao || ex.solucaoBlocos || null })
  }

  // marca "em andamento" no primeiro toque na entrega (sem botão cerimonial)
  const tocar = () => {
    if (iniciou.current) return
    iniciou.current = true
    api.cursoAtividadeIniciar(cursoId, ex.id).then((r) => aplicar(r.estado)).catch(() => {})
  }

  // rascunho: salva 1,2 s depois de parar de digitar
  useEffect(() => {
    if (concluida || !(tipo === 'texto' || tipo === 'saida')) return
    if (texto === rascunhoRef.current) return
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      api
        .cursoAtividadeRascunho(cursoId, ex.id, texto)
        .then((r) => {
          rascunhoRef.current = texto
          aplicar(r.estado)
        })
        .catch(() => {})
    }, 1200)
    return () => clearTimeout(timerRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto, concluida, tipo])

  const verDica = async () => {
    tocar()
    try {
      const r = await api.cursoAtividadeDica(cursoId, ex.id, dicasVistas.length + 1)
      setDicasVistas(r.dicas)
      aplicar(r.estado)
    } catch (e) {
      setFeedback({ tipo: 'erro', texto: e.message })
    }
  }

  const revelar = async () => {
    try {
      const r = await api.cursoAtividadeRevelar(cursoId, ex.id)
      setSolucao(r.solucaoBlocos)
      aplicar(r.estado)
    } catch (e) {
      setFeedback({ tipo: 'erro', texto: e.message })
    }
  }

  const reabrir = async () => {
    try {
      const r = await api.cursoAtividadeReabrir(cursoId, ex.id)
      aplicar(r.estado)
      setSolucao(null)
      setFeedback(null)
      setMentor(null)
      setDicasVistas([])
      setTexto('')
      setNumero('')
      setMarcados([])
      rascunhoRef.current = ''
    } catch (e) {
      setFeedback({ tipo: 'erro', texto: e.message })
    }
  }

  const responder = async (corpo) => {
    setEnviando(true)
    setFeedback(null)
    try {
      const r = await api.cursoAtividadeResponder(cursoId, ex.id, corpo)
      if (!r.correto) {
        aplicar(r.estado)
        setFeedback({ tipo: 'errado', texto: r.detalhe ? `Não bateu (${r.detalhe}).` : 'Não bateu com o gabarito. Confira e tente de novo.' })
        return
      }
      if (r.solucaoBlocos) setSolucao(r.solucaoBlocos)
      aplicar(r.pratica)
      setAjustando(false)
      setFeedback({ tipo: 'certo', texto: `Registrado com nota ${r.nota}${r.termo ? ` no termo ${ex.termos[0].termo}` : ''}.` })
    } catch (e) {
      setFeedback({ tipo: 'erro', texto: `Não gravou: ${e.message}` })
    } finally {
      setEnviando(false)
    }
  }

  const pedirMentor = async () => {
    if (!texto.trim()) return
    setMentor({ estado: 'rodando' })
    try {
      const r = await api.cursoAtividadeMentor(cursoId, ex.id, texto)
      setMentor({ estado: 'ok', dados: r })
    } catch (e) {
      setMentor({ estado: 'erro', dados: { codigo: e.codigo, mensagem: e.message } })
    }
  }

  const notaChecklistAgora = tipo === 'checklist' && ex.entrega.itens ? Math.round((marcados.length / ex.entrega.itens.length) * 5) : 0

  return (
    <section className={`atv ${concluida ? 'atv--feita' : ''}`}>
      <div className="atv__head">
        <span className={`chip mono ${classeNivel(ex.nivel)}`}>nv {ex.nivel}</span>
        <span className="atv__t">{ex.titulo}</span>
        <span className={`chip ${st.classe} ${st.id === 'concluida' ? 'mono' : ''}`}>{st.rotulo}</span>
      </div>
      <div className="atv__meta">
        <span className="chip">atividade</span>
        <span className="chip">{nomeAmbiente(ex.ambiente)}</span>
        <span className="chip">{(TIPOS_ENTREGA[tipo] || {}).curto || tipo}</span>
        <span className="chip">~{ex.tempoMin} min</span>
        {ex.postmortem && <span className="chip chip--rose">failure lab</span>}
      </div>

      <div className="atv__corpo">
        <Blocos blocos={ex.enunciadoBlocos} cursoId={cursoId} />
      </div>

      {ex.passos && ex.passos.length > 0 && (
        <div className="atv__entrega">
          <div className="atv__label">Passos</div>
          <ol className="blk-lista">
            {ex.passos.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ol>
        </div>
      )}

      {!concluida && (
        <div className="atv__entrega">
          <div className="atv__label">Entrega · {ex.entrega.rotulo}</div>

          {(tipo === 'saida' || tipo === 'texto') && (
            <textarea
              className={`textarea ${tipo === 'saida' ? 'mono' : ''}`}
              style={{ minHeight: tipo === 'texto' ? 180 : 120 }}
              placeholder={tipo === 'saida' ? 'Cole aqui exatamente o que saiu no terminal…' : 'Cole o código, os números medidos, o raciocínio…'}
              value={texto}
              onFocus={tocar}
              onChange={(e) => setTexto(e.target.value)}
              aria-label={`Entrega da atividade ${ex.titulo}`}
            />
          )}
          {tipo === 'numero' && (
            <div className="atv__num">
              <input
                className="input input--lg mono"
                inputMode="decimal"
                placeholder="0"
                value={numero}
                onFocus={tocar}
                onChange={(e) => setNumero(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && numero.trim() && responder({ resposta: numero })}
                aria-label="Número"
              />
              {ex.entrega.unidade && <span className="muted">{ex.entrega.unidade}</span>}
            </div>
          )}
          {tipo === 'escolha' && (
            <div className="opcoes">
              {ex.entrega.opcoes.map((op, i) => {
                const sel = marcados.includes(i)
                return (
                  <button
                    key={i}
                    className={`opcao ${sel ? 'sel' : ''}`}
                    onClick={() => {
                      tocar()
                      setMarcados(ex.entrega.multipla ? (sel ? marcados.filter((x) => x !== i) : [...marcados, i]) : [i])
                    }}
                    aria-pressed={sel}
                  >
                    <span className="opcao__k">{String.fromCharCode(65 + i)}</span>
                    <span>{op}</span>
                  </button>
                )
              })}
            </div>
          )}
          {tipo === 'checklist' && (
            <div className="checklist">
              {ex.entrega.itens.map((it, i) => {
                const sel = marcados.includes(i)
                return (
                  <label key={i} className={`check ${sel ? 'sel' : ''}`}>
                    <input
                      type="checkbox"
                      checked={sel}
                      onChange={() => {
                        tocar()
                        setMarcados(sel ? marcados.filter((x) => x !== i) : [...marcados, i])
                      }}
                    />
                    <span>{it}</span>
                  </label>
                )
              })}
              <p className="dim small mt-2">
                Nota = proporção marcada × 5 → agora {notaChecklistAgora}.
              </p>
            </div>
          )}

          {dicasVistas.length > 0 && (
            <div className="mt-3">
              {dicasVistas.map((d, i) => (
                <p key={i} className="small muted" style={{ margin: '4px 0' }}>
                  <b>Dica {i + 1}:</b> {d}
                </p>
              ))}
            </div>
          )}

          {feedback && <div className={`feedback ${feedback.tipo === 'certo' ? 'ok' : 'bad'}`}>{feedback.texto}</div>}

          <div className="acoes">
            {ex.auto && (
              <button
                className="btn btn--primary"
                disabled={enviando || (tipo === 'saida' && !texto.trim()) || (tipo === 'numero' && !numero.trim()) || (tipo === 'escolha' && !marcados.length)}
                onClick={() => responder({ resposta: tipo === 'saida' ? texto : tipo === 'numero' ? numero : marcados })}
              >
                <IcoCheck /> Verificar
              </button>
            )}
            {tipo === 'checklist' && (
              <button className="btn btn--primary" disabled={enviando} onClick={() => responder({ marcados })}>
                <IcoCheck /> Concluir com {notaChecklistAgora}
              </button>
            )}
            {tipo === 'texto' && !solucao && (
              <button className="btn btn--primary" disabled={texto.trim().length < Math.min(ex.entrega.minimoChars || 80, 40)} onClick={revelar}>
                Comparar com o gabarito
              </button>
            )}
            {tipo === 'texto' && (
              <button className="btn" disabled={!texto.trim() || (mentor && mentor.estado === 'rodando')} onClick={pedirMentor}>
                <IcoFaisca /> {mentor && mentor.estado === 'rodando' ? 'Mentor lendo…' : 'Pedir ao mentor'}
              </button>
            )}
            {ex.dicas && dicasVistas.length < ex.dicas.length && (
              <button className="btn btn--sm btn--ghost" onClick={verDica}>
                Ver dica {dicasVistas.length + 1}
                {ex.auto && dicasVistas.length === 0 ? ' (nota máx. 3)' : ''}
              </button>
            )}
            {ex.auto && !solucao && (
              <button className="btn btn--sm btn--ghost" onClick={revelar}>
                Ver solução (nota máx. 1)
              </button>
            )}
          </div>
        </div>
      )}

      {mentor && (
        <div className="atv__entrega">
          <div className="atv__label">Mentor IA</div>
          {mentor.estado === 'rodando' && <p className="small muted">Lendo a entrega e comparando com os critérios…</p>}
          {mentor.estado === 'erro' && (
            <div className="feedback bad">
              {mentor.dados.codigo === 'sem_key' ? (
                <>
                  Sem key do OpenRouter. <Link to="/config">Configure em Config</Link>.
                </>
              ) : (
                `${mentor.dados.codigo ? `${mentor.dados.codigo}: ` : ''}${mentor.dados.mensagem}`
              )}
            </div>
          )}
          {mentor.estado === 'ok' && (
            <MentorFeedback dados={mentor.dados} compacto onUsarNota={!concluida && tipo === 'texto' && solucao ? (n) => responder({ resposta: texto, nota: n }) : null} />
          )}
        </div>
      )}

      {solucao && (
        <div className="atv__entrega">
          <div className="atv__label">{concluida ? 'Gabarito' : 'Gabarito · agora se avalie'}</div>
          <Blocos blocos={solucao} cursoId={cursoId} />
          {ex.criterios && ex.criterios.length > 0 && (
            <>
              <div className="atv__label mt-4">
                Critérios de uma boa entrega
              </div>
              <ul className="criterios">
                {ex.criterios.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </>
          )}
          {!concluida && (
            <div className="mt-4">
              <div className="atv__label">{ex.auto ? 'Viu a solução. Que nota você se dá?' : 'Comparando a sua entrega com o gabarito, que nota você se dá?'}</div>
              <Nivel onEscolher={(n) => responder({ resposta: texto || numero || JSON.stringify(marcados), nota: n })} disabled={enviando} />
              <LegendaNiveis />
            </div>
          )}
        </div>
      )}

      {concluida && (
        <div className="atv__entrega">
          <div className="row row--between">
            <p className="small muted" style={{ margin: 0 }}>
              Nota <span className={`atv__nota ${classeNivel(estado.ultimaNota)}`}>{fmtNivel(estado.ultimaNota)}</span> · gravada no termo{' '}
              <b>{ex.termos[0] ? ex.termos[0].termo : '—'}</b>
            </p>
            <div className="acoes mt-0">
              <button className="btn btn--sm" onClick={() => setAjustando((v) => !v)}>
                Ajustar nota
              </button>
              <button className="btn btn--sm btn--ghost" onClick={reabrir}>
                Tentar de novo
              </button>
            </div>
          </div>
          {ajustando && (
            <div className="mt-3">
              <Nivel selecionado={estado.ultimaNota} onEscolher={(n) => responder({ resposta: (estado.historico || []).at(-1)?.resposta || '', nota: n })} disabled={enviando} />
            </div>
          )}
        </div>
      )}
    </section>
  )
}
