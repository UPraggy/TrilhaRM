import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api.js'
import { useStore } from '../store.jsx'
import { Bloco, Carregando, Confirmar, Erro, MentorFeedback, Texto } from '../components/Comuns.jsx'
import Nivel, { LegendaNiveis } from '../components/Nivel.jsx'
import { IcoCheck, IcoFaisca } from '../components/Icones.jsx'
import { TIPOS_ENTREGA, classeNivel, fmtDataCurta, fmtNivel, nomeAmbiente, statusPratica } from '../lib/util.js'

function minutosDesde(iso) {
  if (!iso) return null
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
}
function fmtDuracao(min) {
  if (min == null) return ''
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const d = Math.floor(h / 24)
  if (d >= 1) return `${d} d ${h % 24} h`
  return `${h} h ${min % 60} min`
}

/**
 * /pratica/:deckId/:exId — um exercício prático. Fluxo:
 *   ler enunciado → "Comecei" → resolver FORA do app → voltar e entregar (saída/número/escolha corrigem sozinhos;
 *   texto/checklist: você se avalia; texto pode ir ao mentor IA) → nota vira SM-2 no termo principal.
 */
export default function Pratica() {
  const { deckId, exId } = useParams()
  const { praticas, mostrarAviso, atualizarPratica, aplicarConclusaoPratica } = useStore()
  const chave = `${deckId}/${exId}`

  const [ex, setEx] = useState(null)
  const [estado, setEstado] = useState(null)
  const [solucao, setSolucao] = useState(null)
  const [erro, setErro] = useState(null)

  // entrega
  const [texto, setTexto] = useState('')
  const [numero, setNumero] = useState('')
  const [marcados, setMarcados] = useState([])
  const [dicasVistas, setDicasVistas] = useState([])
  const [feedback, setFeedback] = useState(null) // { tipo:'errado'|'certo'|'erro', texto }
  const [resultado, setResultado] = useState(null) // retorno do /responder
  const [mentor, setMentor] = useState(null) // { estado:'rodando'|'ok'|'erro', dados }
  const [confirmando, setConfirmando] = useState(null) // 'revelar' | 'reabrir'
  const [ajustando, setAjustando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [, tick] = useState(0)
  const rascunhoTimer = useRef(null)
  const rascunhoInicial = useRef('')

  const carregar = useCallback(() => {
    setErro(null)
    api
      .pratica(deckId, exId)
      .then((r) => {
        setEx(r)
        setEstado(r.estado)
        setSolucao(r.solucao || null)
        const rasc = (r.estado && r.estado.rascunho) || ''
        rascunhoInicial.current = rasc
        setTexto(rasc)
        if (r.estado && r.estado.dicasUsadas > 0 && r.dicas) setDicasVistas(r.dicas.slice(0, r.estado.dicasUsadas))
      })
      .catch((e) => setErro(e.message))
  }, [deckId, exId])

  useEffect(() => {
    setEx(null)
    setEstado(null)
    setSolucao(null)
    setTexto('')
    setNumero('')
    setMarcados([])
    setDicasVistas([])
    setFeedback(null)
    setResultado(null)
    setMentor(null)
    setAjustando(false)
    carregar()
  }, [carregar])

  // relógio "há X min" a cada 30 s
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30000)
    return () => clearInterval(t)
  }, [])

  const aplicarEstado = (s) => {
    if (!s) return
    setEstado(s)
    atualizarPratica(chave, s)
  }

  // rascunho: salva 1,2 s depois de parar de digitar (só para texto/saída, e só se mudou)
  useEffect(() => {
    if (!ex || !estado || estado.estado === 'concluida') return
    if (!(ex.entrega.tipo === 'texto' || ex.entrega.tipo === 'saida')) return
    if (texto === rascunhoInicial.current) return
    clearTimeout(rascunhoTimer.current)
    rascunhoTimer.current = setTimeout(() => {
      api
        .praticaRascunho(deckId, exId, texto)
        .then((r) => {
          rascunhoInicial.current = texto
          aplicarEstado(r.estado)
        })
        .catch(() => {})
    }, 1200)
    return () => clearTimeout(rascunhoTimer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto, ex, estado && estado.estado])

  const iniciar = async () => {
    try {
      const r = await api.praticaIniciar(deckId, exId)
      aplicarEstado(r.estado)
      mostrarAviso('Bom trabalho. Volte quando terminar — o rascunho fica salvo.')
    } catch (e) {
      mostrarAviso(`Não gravou: ${e.message}`, 4000)
    }
  }

  const verDica = async () => {
    const n = dicasVistas.length + 1
    try {
      const r = await api.praticaDica(deckId, exId, n)
      setDicasVistas(r.dicas)
      aplicarEstado(r.estado)
    } catch (e) {
      mostrarAviso(`Não consegui: ${e.message}`, 4000)
    }
  }

  const revelar = async () => {
    setConfirmando(null)
    try {
      const r = await api.praticaRevelar(deckId, exId)
      setSolucao(r.solucao)
      aplicarEstado(r.estado)
    } catch (e) {
      mostrarAviso(`Não consegui: ${e.message}`, 4000)
    }
  }

  const reabrir = async () => {
    setConfirmando(null)
    try {
      const r = await api.praticaReabrir(deckId, exId)
      aplicarEstado(r.estado)
      setResultado(null)
      setFeedback(null)
      setMentor(null)
      setSolucao(null)
      setDicasVistas([])
      setTexto('')
      setNumero('')
      setMarcados([])
      rascunhoInicial.current = ''
    } catch (e) {
      mostrarAviso(`Não consegui: ${e.message}`, 4000)
    }
  }

  const responder = async (corpo) => {
    setEnviando(true)
    setFeedback(null)
    try {
      const r = await api.praticaResponder(deckId, exId, corpo)
      if (!r.correto) {
        aplicarEstado(r.estado)
        setFeedback({ tipo: 'errado', texto: r.detalhe ? `Não bateu (${r.detalhe}).` : 'Não bateu com o gabarito. Confira e tente de novo.' })
        return
      }
      setResultado(r)
      setSolucao(r.solucao || solucao)
      aplicarConclusaoPratica(r)
      setEstado(r.pratica)
      setAjustando(false)
      setFeedback({ tipo: 'certo', texto: `Registrado com nota ${r.nota}.` })
    } catch (e) {
      setFeedback({ tipo: 'erro', texto: `Não gravou: ${e.message}` })
    } finally {
      setEnviando(false)
    }
  }

  const pedirMentor = async () => {
    if (!texto.trim()) return mostrarAviso('Escreva a entrega antes de chamar o mentor.')
    setMentor({ estado: 'rodando' })
    try {
      const r = await api.praticaMentor(deckId, exId, texto)
      setMentor({ estado: 'ok', dados: r })
    } catch (e) {
      setMentor({ estado: 'erro', dados: { codigo: e.codigo, mensagem: e.message } })
    }
  }

  // próximo exercício do mesmo deck (para o rodapé)
  const proximo = useMemo(() => {
    const p = praticas.find((x) => x.deckId === deckId)
    if (!p) return null
    const i = p.exercicios.findIndex((e) => e.id === exId)
    return i >= 0 && i + 1 < p.exercicios.length ? p.exercicios[i + 1] : null
  }, [praticas, deckId, exId])

  if (erro) return <Erro texto={erro} onRetry={carregar} />
  if (!ex) return <Carregando />

  const st = statusPratica(estado)
  const concluida = estado && estado.estado === 'concluida'
  const emAndamento = estado && estado.estado === 'andamento'
  const tipo = ex.entrega.tipo
  const podeEntregar = concluida ? false : true
  const revelou = Boolean(estado && estado.revelou)
  const minDesde = emAndamento ? minutosDesde(estado.iniciadaEm) : null

  return (
    <div>
      <div className="eyebrow">
        <Link to="/praticas" className="muted">
          Praticar
        </Link>{' '}
        / <Link to={`/deck/${deckId}`} className="muted">{(praticas.find((p) => p.deckId === deckId) || {}).deckTitulo || deckId}</Link>
      </div>
      <h1 className="mt-1">{ex.titulo}</h1>
      <div className="ctx mt-2">
        <span className={`chip mono ${classeNivel(ex.nivel)}`} title="nível alvo">
          nível {ex.nivel}
        </span>
        <span className="chip">{nomeAmbiente(ex.ambiente)}</span>
        <span className="chip">{(TIPOS_ENTREGA[tipo] || {}).nome || tipo}</span>
        <span className="chip">~{ex.tempoMin} min</span>
        {ex.postmortem && <span className="chip chip--rose">failure lab · postmortem</span>}
        <span className={`chip ${st.classe} ${st.id === 'concluida' ? 'mono' : ''}`} className="ml-auto">
          {st.rotulo}
        </span>
      </div>
      {ex.termos.length > 0 && (
        <p className="small muted mt-1">
          Termos:{' '}
          {ex.termos.map((t, i) => (
            <span key={`${t.deckId}/${t.termoId}`}>
              <Link to={`/glossario?q=${encodeURIComponent(t.termo)}`}>{t.termo}</Link>
              {i === 0 && <span className="dim"> (principal)</span>}
              {i < ex.termos.length - 1 ? ' · ' : ''}
            </span>
          ))}
        </p>
      )}

      {/* ---- enunciado ---- */}
      <div className="card mt-4">
        <div className="eyebrow">Enunciado</div>
        <Texto className="enunciado">{ex.enunciado}</Texto>
        {ex.passos.length > 0 && (
          <div className="bloco">
            <div className="bloco__label">Passos</div>
            <ol className="passos">
              {ex.passos.map((p, i) => (
                <li key={i}>
                  <Texto>{p}</Texto>
                </li>
              ))}
            </ol>
          </div>
        )}
        {ex.postmortem && (
          <div className="bloco">
            <div className="bloco__label">Formato do postmortem</div>
            <p className="small">sintoma → evidência (números) → causa → correção → o que muda no processo</p>
          </div>
        )}

        {!estado || estado.estado === 'nova' ? (
          <div className="acoes">
            <button className="btn btn--primary btn--lg" onClick={iniciar}>
              <IcoFaisca /> Comecei — vou resolver fora do app
            </button>
          </div>
        ) : (
          <p className="dim small mt-4">
            {concluida
              ? `Concluída em ${fmtDataCurta(estado.concluidaEm)} · ${estado.historico.length} ${estado.historico.length === 1 ? 'entrega' : 'entregas'}`
              : `Em andamento há ${fmtDuracao(minDesde)} (começou ${fmtDataCurta(estado.iniciadaEm)})`}
            {estado.tentativasErradas ? ` · ${estado.tentativasErradas} ${estado.tentativasErradas === 1 ? 'tentativa errada' : 'tentativas erradas'}` : ''}
            {estado.dicasUsadas ? ` · ${estado.dicasUsadas} ${estado.dicasUsadas === 1 ? 'dica' : 'dicas'}` : ''}
            {revelou && !concluida ? (ex.auto ? ' · solução revelada (nota máx. 1 se acertar agora)' : ' · gabarito aberto') : ''}
          </p>
        )}
      </div>

      {/* ---- dicas ---- */}
      {ex.dicas.length > 0 && !concluida && (
        <div className="card card--flat">
          <div className="row row--between">
            <div className="eyebrow">Dicas ({dicasVistas.length}/{ex.dicas.length})</div>
            {dicasVistas.length < ex.dicas.length && (
              <button className="btn btn--sm btn--ghost" onClick={verDica}>
                Ver dica {dicasVistas.length + 1}
                {ex.auto && dicasVistas.length === 0 ? ' (nota máx. 3)' : ''}
              </button>
            )}
          </div>
          {dicasVistas.map((d, i) => (
            <div key={i} className="bloco mt-2">
              <div className="bloco__label">Dica {i + 1}</div>
              <Texto>{d}</Texto>
            </div>
          ))}
        </div>
      )}

      {/* ---- entrega ---- */}
      {!concluida && (
        <div className="card">
          <div className="eyebrow">Entrega · {ex.entrega.rotulo}</div>

          {(tipo === 'saida' || tipo === 'texto') && (
            <textarea
              className={`textarea ${tipo === 'saida' ? 'mono' : ''}`}
              style={{ marginTop: 10, minHeight: tipo === 'texto' ? 220 : 140 }}
              placeholder={tipo === 'saida' ? 'Cole aqui exatamente o que saiu no terminal…' : 'Cole o código, os números medidos, o postmortem…'}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              aria-label="Sua entrega"
            />
          )}
          {tipo === 'numero' && (
            <div className="campo__linha mt-3">
              <input
                className="input input--lg mono"
                inputMode="decimal"
                placeholder="0"
                value={numero}
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
                    onClick={() => setMarcados(ex.entrega.multipla ? (sel ? marcados.filter((x) => x !== i) : [...marcados, i]) : [i])}
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
                    <input type="checkbox" checked={sel} onChange={() => setMarcados(sel ? marcados.filter((x) => x !== i) : [...marcados, i])} />
                    <span>{it}</span>
                  </label>
                )
              })}
              <p className="dim small mt-2">
                Nota = proporção marcada × 5 → agora {Math.round((marcados.length / ex.entrega.itens.length) * 5)}.
              </p>
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
                <IcoCheck /> Concluir com {Math.round((marcados.length / ex.entrega.itens.length) * 5)}
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
            {ex.auto && !solucao && (
              <button className="btn btn--ghost" onClick={() => setConfirmando('revelar')}>
                Não consegui — ver solução
              </button>
            )}
          </div>
          {tipo === 'texto' && texto.trim().length > 0 && texto.trim().length < (ex.entrega.minimoChars || 80) && !solucao && (
            <p className="dim small mt-2">
              {texto.trim().length}/{ex.entrega.minimoChars || 80} caracteres — entrega curta demais para comparar com o gabarito.
            </p>
          )}
          {texto !== rascunhoInicial.current && (tipo === 'texto' || tipo === 'saida') && <p className="dim small mt-1">salvando rascunho…</p>}
        </div>
      )}

      {mentor && (
        <div className="card card--flat">
          <div className="eyebrow">Mentor IA</div>
          {mentor.estado === 'rodando' && <p className="mentor__lendo mt-2">Lendo a entrega e comparando com os critérios…</p>}
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
          {mentor.estado === 'ok' && <MentorFeedback dados={mentor.dados} onUsarNota={!concluida && tipo === 'texto' && solucao ? (n) => responder({ resposta: texto, nota: n }) : null} />}
        </div>
      )}

      {/* ---- gabarito + auto-avaliação (texto) ---- */}
      {solucao && (
        <div className="card">
          <div className="eyebrow">{concluida ? 'Gabarito' : 'Gabarito · agora se avalie'}</div>
          <Bloco label="Solução">
            <Texto>{solucao}</Texto>
          </Bloco>
          {ex.criterios.length > 0 && (
            <div className="bloco">
              <div className="bloco__label">Critérios de uma boa entrega</div>
              <ul className="criterios">
                {ex.criterios.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          )}
          {!concluida && (tipo === 'texto' || ex.auto) && (
            <div className="bloco">
              <div className="bloco__label">{ex.auto ? 'Viu a solução. Que nota você se dá pelo que fez até aqui?' : 'Comparando a sua entrega com o gabarito, que nota você se dá?'}</div>
              <Nivel onEscolher={(n) => responder({ resposta: tipo === 'texto' ? texto : texto || numero || JSON.stringify(marcados), nota: n })} disabled={enviando} />
              <LegendaNiveis />
            </div>
          )}
        </div>
      )}

      {/* ---- concluída ---- */}
      {concluida && (
        <div className="card card--2">
          <div className="row row--between">
            <div>
              <div className="eyebrow">Resultado</div>
              <div className="row" style={{ marginTop: 6, alignItems: 'baseline' }}>
                <span className={`fim__n ${classeNivel(estado.ultimaNota)}`} style={{ fontSize: '2.2rem' }}>
                  {fmtNivel(estado.ultimaNota)}
                </span>
                <span className="muted small">
                  nota atual{estado.melhorNota != null && estado.melhorNota !== estado.ultimaNota ? ` · melhor ${estado.melhorNota}` : ''} · gravada no termo{' '}
                  <b>{ex.termos[0] ? ex.termos[0].termo : '—'}</b>
                </span>
              </div>
            </div>
            <div className="acoes mt-0">
              <button className="btn btn--sm" onClick={() => setAjustando((v) => !v)}>
                Ajustar nota
              </button>
              <button className="btn btn--sm btn--ghost" onClick={() => setConfirmando('reabrir')}>
                Tentar de novo
              </button>
            </div>
          </div>
          {ajustando && (
            <div className="bloco">
              <div className="bloco__label">Nova nota (0–5)</div>
              <Nivel selecionado={estado.ultimaNota} onEscolher={(n) => responder({ resposta: (estado.historico.at(-1) || {}).resposta || '', nota: n })} disabled={enviando} />
            </div>
          )}
          {resultado && resultado.termo && (
            <p className="dim small" style={{ margin: '10px 0 0' }}>
              Termo <b>{ex.termos[0].termo}</b> agora em nível {fmtNivel(resultado.termo.estado.nivel)} · próxima revisão {fmtDataCurta(resultado.termo.estado.proximaRevisao)} · ofensiva{' '}
              {resultado.streak.atual} {resultado.streak.atual === 1 ? 'dia' : 'dias'}
            </p>
          )}
          {estado.historico.length > 0 && (
            <div className="bloco">
              <div className="bloco__label">Entregas ({estado.historico.length})</div>
              {estado.historico
                .slice()
                .reverse()
                .slice(0, 3)
                .map((h, i) => (
                  <div key={i} className="bloco mt-2">
                    <div className="dim small mono">
                      {fmtDataCurta(h.dia)} · nota {h.nota} · {h.auto ? 'corrigida pelo app' : 'auto-avaliação'}
                    </div>
                    {h.resposta && !h.auto && (
                      <p className="small pre-wrap rolavel">
                        {h.resposta}
                      </p>
                    )}
                    {h.avaliacaoIA && <MentorFeedback dados={h.avaliacaoIA} compacto />}
                  </div>
                ))}
            </div>
          )}
          <div className="acoes">
            {proximo ? (
              <Link to={`/pratica/${deckId}/${proximo.id}`} className="btn btn--primary">
                Próximo: {proximo.titulo}
              </Link>
            ) : (
              <Link to="/praticas" className="btn btn--primary">
                Outros exercícios
              </Link>
            )}
            <Link to={`/deck/${deckId}`} className="btn btn--ghost">
              Deck
            </Link>
          </div>
        </div>
      )}

      {confirmando === 'revelar' && (
        <Confirmar
          titulo="Ver a solução agora?"
          texto="Se acertar depois disso, a nota automática fica em 1 (reconheço). Você ainda pode se dar outra nota depois de comparar."
          confirmar="Ver solução"
          onNao={() => setConfirmando(null)}
          onSim={revelar}
        />
      )}
      {confirmando === 'reabrir' && (
        <Confirmar
          titulo="Tentar de novo?"
          texto="Zera tentativas e dicas deste exercício. O histórico de entregas e a nota no termo continuam."
          confirmar="Reabrir"
          onNao={() => setConfirmando(null)}
          onSim={reabrir}
        />
      )}
    </div>
  )
}
