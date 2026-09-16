import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Barra, Carregando, Erro, Texto } from '../components/Comuns.jsx'
import { classeNivel, fmtNivel, NIVEIS } from '../lib/util.js'
import { apiTreinos } from '../lib/apiTreinos.js'
import { duracaoTreino, rotuloEstado } from './Treinos.jsx'
import '../treinos.css'

const NOME_TIPO = {
  aquecimento: 'aquecimento',
  leitura: 'leitura',
  desafio: 'desafio',
  cronometrado: 'cronometrado',
  simulado: 'simulado',
  'mao-na-massa': 'mão na massa',
  ensinar: 'ensinar',
  retrospectiva: 'retrospectiva',
}

function mmss(seg) {
  const s = Math.max(0, Math.round(seg))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/** botões 0–5 na escala do Rafael */
function Nota({ valor, onChange, label = 'Sua nota' }) {
  return (
    <div className="trn-secao">
      <div className="trn-secao__label">{label} (0–5)</div>
      <div className="trn-notas">
        {NIVEIS.map((n) => (
          <button key={n.n} type="button" className={`trn-nota ${valor === n.n ? 'on' : ''}`} onClick={() => onChange(n.n)} aria-pressed={valor === n.n}>
            {n.n}
            <small>{n.curto}</small>
          </button>
        ))}
      </div>
    </div>
  )
}

function Secao({ label, children }) {
  if (!children) return null
  return (
    <div className="trn-secao">
      <div className="trn-secao__label">{label}</div>
      {children}
    </div>
  )
}

function Itens({ itens, passos = false }) {
  if (!itens || !itens.length) return null
  return (
    <ul className={`trn-lista ${passos ? 'trn-lista--passos' : ''}`}>
      {itens.map((x, i) => (
        <li key={i}>{x}</li>
      ))}
    </ul>
  )
}

function Marcar({ itens, marcados, onToggle, chave = (i) => i }) {
  return (
    <div>
      {itens.map((item, i) => {
        const k = chave(i, item)
        const on = marcados.includes(k)
        return (
          <label key={k} className={`trn-check ${on ? 'on' : ''}`}>
            <input type="checkbox" checked={on} onChange={() => onToggle(k)} />
            <span>{typeof item === 'string' ? item : item.rotulo}</span>
          </label>
        )
      })}
    </div>
  )
}

// ---- etapas por tipo -------------------------------------------------------

function EtapaAquecimento({ etapa, concluida, enviando, onResponder }) {
  const c = etapa.corpo
  const [nota, setNota] = useState(null)
  return (
    <div>
      <Secao label="O que fazer">
        <p>
          Abra o modo <b>{c.modo}</b> com {c.quantidade} termos e volte aqui quando terminar. O SM-2 de cada termo já é gravado lá dentro — esta etapa só marca
          que você passou por ela.
        </p>
      </Secao>
      {c.meta && <Secao label="Meta">{<p>{c.meta}</p>}</Secao>}
      <div className="trn-acoes">
        <a className="btn btn--primary" href={c.link} target="_blank" rel="noreferrer">
          Abrir {c.modo} ({c.quantidade})
        </a>
        <Link className="btn btn--ghost" to={c.link}>
          Ir sem sair do app
        </Link>
      </div>
      {!concluida && (
        <>
          <Nota valor={nota} onChange={setNota} label="Como foi (opcional)" />
          <div className="trn-acoes">
            <button className="btn btn--primary" disabled={enviando} onClick={() => onResponder({ nota })}>
              Concluir etapa
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function EtapaLeitura({ etapa, concluida, enviando, onResponder }) {
  const c = etapa.corpo
  return (
    <div>
      <Texto>{c.markdown}</Texto>
      {c.perguntas && c.perguntas.length > 0 && (
        <Secao label="Responda de cabeça antes de seguir">
          <Itens itens={c.perguntas} />
        </Secao>
      )}
      {(c.fonte || c.link) && (
        <p className="trn-dim" style={{ marginTop: 10 }}>
          Fonte: {c.fonte || 'link'}
          {c.link && (
            <>
              {' · '}
              <a href={c.link} target="_blank" rel="noreferrer">
                abrir
              </a>
            </>
          )}
        </p>
      )}
      {!concluida && (
        <div className="trn-acoes">
          <button className="btn btn--primary" disabled={enviando} onClick={() => onResponder({})}>
            Li e entendi
          </button>
        </div>
      )}
    </div>
  )
}

function EntregaDesafio({ ex, valor, setValor, marcados, setMarcados }) {
  const e = ex.entrega
  if (e.tipo === 'escolha') {
    return (
      <div>
        {e.opcoes.map((o, i) => {
          const on = marcados.includes(i)
          return (
            <label key={i} className={`trn-check ${on ? 'on' : ''}`}>
              <input
                type={e.multipla ? 'checkbox' : 'radio'}
                name="escolha"
                checked={on}
                onChange={() => setMarcados(e.multipla ? (on ? marcados.filter((x) => x !== i) : [...marcados, i]) : [i])}
              />
              <span>{o}</span>
            </label>
          )
        })}
      </div>
    )
  }
  if (e.tipo === 'checklist') {
    return <Marcar itens={e.itens} marcados={marcados} onToggle={(i) => setMarcados(marcados.includes(i) ? marcados.filter((x) => x !== i) : [...marcados, i])} />
  }
  if (e.tipo === 'numero') {
    return (
      <input
        className="input mono"
        inputMode="decimal"
        placeholder={e.unidade ? `número em ${e.unidade}` : 'número'}
        value={valor}
        onChange={(ev) => setValor(ev.target.value)}
      />
    )
  }
  return (
    <textarea
      className={`input input--lg ${e.tipo === 'saida' ? 'mono' : ''}`}
      rows={e.tipo === 'saida' ? 8 : 10}
      placeholder={e.rotulo}
      value={valor}
      onChange={(ev) => setValor(ev.target.value)}
    />
  )
}

function EtapaDesafio({ etapa, estado, gabarito, concluida, enviando, onResponder, onRevelar, onDica }) {
  const ex = etapa.corpo.exercicio
  const [valor, setValor] = useState((estado && estado.rascunho) || '')
  const [marcados, setMarcados] = useState([])
  const [nota, setNota] = useState(null)
  const [errado, setErrado] = useState(null)
  const dicasUsadas = (estado && estado.dicasUsadas) || 0
  const revelou = Boolean(estado && estado.revelou) || Boolean(gabarito)
  const auto = ex.entrega.tipo === 'saida' || ex.entrega.tipo === 'numero' || ex.entrega.tipo === 'escolha'
  const precisaNota = !auto && ex.entrega.tipo !== 'checklist'

  const enviar = async () => {
    setErrado(null)
    const corpo =
      ex.entrega.tipo === 'escolha' || ex.entrega.tipo === 'checklist'
        ? { resposta: marcados, marcados }
        : { resposta: valor }
    if (precisaNota) corpo.nota = nota
    const r = await onResponder(corpo)
    if (r && r.correto === false) setErrado(r.detalhe || 'Ainda não é isso. Tente de novo.')
  }

  return (
    <div>
      <div className="trn-card__meta">
        <span className="chip chip--peri">{ex.ambiente}</span>
        <span className="chip">{ex.entrega.tipo}</span>
        {ex.postmortem && <span className="chip chip--rose">failure lab</span>}
      </div>
      <Secao label="Enunciado">
        <Texto>{ex.enunciado}</Texto>
      </Secao>
      {ex.passos.length > 0 && (
        <Secao label="Passos">
          <Itens itens={ex.passos} passos />
        </Secao>
      )}
      {dicasUsadas > 0 && (
        <Secao label={`Dicas usadas (${dicasUsadas})`}>
          <Itens itens={ex.dicas.slice(0, dicasUsadas)} />
        </Secao>
      )}
      {!concluida && (
        <>
          <Secao label={ex.entrega.rotulo || 'Sua entrega'}>
            <EntregaDesafio ex={ex} valor={valor} setValor={setValor} marcados={marcados} setMarcados={setMarcados} />
          </Secao>
          {precisaNota && (revelou || ex.entrega.tipo === 'texto') && <Nota valor={nota} onChange={setNota} />}
          {errado && <p className="trn-erro">{errado}</p>}
          <div className="trn-acoes">
            <button className="btn btn--primary" disabled={enviando || (precisaNota && nota == null)} onClick={enviar}>
              {auto ? 'Verificar' : 'Concluir etapa'}
            </button>
            {ex.dicas.length > dicasUsadas && (
              <button className="btn btn--ghost" disabled={enviando} onClick={() => onDica(dicasUsadas + 1)}>
                Dica {dicasUsadas + 1} (custa nota)
              </button>
            )}
            {!revelou && (
              <button className="btn btn--ghost" disabled={enviando} onClick={onRevelar}>
                Ver solução
              </button>
            )}
          </div>
        </>
      )}
      {gabarito && gabarito.solucao && (
        <Secao label="Solução">
          <Texto>{gabarito.solucao}</Texto>
        </Secao>
      )}
      {gabarito && gabarito.criterios && gabarito.criterios.length > 0 && (
        <Secao label="Critérios">
          <Itens itens={gabarito.criterios} />
        </Secao>
      )}
    </div>
  )
}

function EtapaCronometrado({ etapa, gabarito, concluida, enviando, onResponder, onRevelar }) {
  const c = etapa.corpo
  const [fase, setFase] = useState('parado') // parado | rodando | conferindo
  const [i, setI] = useState(0)
  const [restante, setRestante] = useState(c.minutos * 60)
  const [acertos, setAcertos] = useState([])
  const inicio = useRef(null)

  useEffect(() => {
    if (fase !== 'rodando') return undefined
    const t = setInterval(() => setRestante((r) => Math.max(0, r - 1)), 1000)
    return () => clearInterval(t)
  }, [fase])

  const respostas = useMemo(() => {
    const m = {}
    if (gabarito && gabarito.respostas) for (const r of gabarito.respostas) m[r.id] = r.resposta
    return m
  }, [gabarito])

  const conferir = async () => {
    setFase('conferindo')
    if (!gabarito) await onRevelar()
  }

  if (concluida || fase === 'conferindo') {
    return (
      <div>
        <Secao label="Marque o que você acertou">
          {c.perguntas.map((p) => {
            const on = acertos.includes(p.id)
            return (
              <div key={p.id} className="trn-pergunta">
                <p className="trn-pergunta__txt">{p.pergunta}</p>
                {respostas[p.id] && (
                  <div className="trn-gabarito">
                    <p>{respostas[p.id]}</p>
                  </div>
                )}
                {!concluida && (
                  <label className={`trn-check ${on ? 'on' : ''}`} style={{ marginTop: 8 }}>
                    <input type="checkbox" checked={on} onChange={() => setAcertos(on ? acertos.filter((x) => x !== p.id) : [...acertos, p.id])} />
                    <span>Acertei esta</span>
                  </label>
                )}
              </div>
            )
          })}
        </Secao>
        {!concluida && (
          <div className="trn-acoes">
            <button
              className="btn btn--primary"
              disabled={enviando}
              onClick={() => onResponder({ acertos, segundos: inicio.current ? Math.round((Date.now() - inicio.current) / 1000) : null })}
            >
              Concluir · {acertos.length} de {c.perguntas.length}
            </button>
          </div>
        )}
      </div>
    )
  }

  if (fase === 'parado') {
    return (
      <div>
        <Secao label="Regras">
          <p>
            {c.perguntas.length} perguntas em <b>{c.minutos} minutos</b>. Sem consultar nada. {c.criterio ? `Critério: ${c.criterio}` : ''}
          </p>
        </Secao>
        <div className="trn-acoes">
          <button
            className="btn btn--primary btn--lg"
            onClick={() => {
              inicio.current = Date.now()
              setFase('rodando')
            }}
          >
            Começar o cronômetro
          </button>
        </div>
      </div>
    )
  }

  const p = c.perguntas[i]
  return (
    <div>
      <div className={`trn-relogio ${restante === 0 ? 'acabou' : ''}`}>{mmss(restante)}</div>
      <p className="trn-dim" style={{ marginTop: 8 }}>
        Pergunta {i + 1} de {c.perguntas.length} · responda em voz alta ou no papel
      </p>
      <div className="trn-pergunta" style={{ marginTop: 8 }}>
        <p className="trn-pergunta__txt">{p.pergunta}</p>
      </div>
      <div className="trn-acoes">
        {i + 1 < c.perguntas.length ? (
          <button className="btn btn--primary" onClick={() => setI(i + 1)}>
            Próxima
          </button>
        ) : (
          <button className="btn btn--primary" onClick={conferir}>
            Ver respostas e conferir
          </button>
        )}
        <button className="btn btn--ghost" onClick={conferir}>
          Desistir e conferir
        </button>
      </div>
    </div>
  )
}

function EtapaSimulado({ etapa, gabarito, concluida, enviando, onResponder, onRevelar }) {
  const c = etapa.corpo
  const [i, setI] = useState(0)
  const [notas, setNotas] = useState({})
  const [resposta, setResposta] = useState('')
  const gab = useMemo(() => {
    const m = {}
    if (gabarito && gabarito.perguntas) for (const g of gabarito.perguntas) m[g.id] = g
    return m
  }, [gabarito])

  const p = c.perguntas[i]
  const g = gab[p.id]
  const faltam = c.perguntas.filter((x) => notas[x.id] == null).length

  if (concluida) {
    return (
      <div>
        <Secao label="Perguntas">
          {c.perguntas.map((x) => (
            <div key={x.id} className="trn-pergunta">
              <p className="trn-pergunta__txt">{x.pergunta}</p>
              {gab[x.id] && gab[x.id].respostaModelo && (
                <div className="trn-gabarito">
                  <Texto>{gab[x.id].respostaModelo}</Texto>
                </div>
              )}
            </div>
          ))}
        </Secao>
      </div>
    )
  }

  return (
    <div>
      <Secao label="Critérios de avaliação">
        <Itens itens={c.criterios} />
      </Secao>
      <p className="trn-dim" style={{ marginTop: 10 }}>
        Pergunta {i + 1} de {c.perguntas.length} · até {c.minutosPorPergunta} min · responda <b>em voz alta</b> e grave
      </p>
      <div className="trn-pergunta" style={{ marginTop: 8 }}>
        <span className={`chip ${p.idioma === 'en' ? 'chip--amber' : 'chip--peri'}`}>{p.idioma === 'en' ? 'EN' : 'PT'}</span>
        <p className="trn-pergunta__txt" style={{ marginTop: 8 }}>
          {p.pergunta}
        </p>
        {p.contexto && <p className="trn-pergunta__ctx">{p.contexto}</p>}
      </div>

      {!g && (
        <div className="trn-acoes">
          <button className="btn btn--ghost" disabled={enviando} onClick={onRevelar}>
            Já respondi — ver o gabarito
          </button>
        </div>
      )}

      {g && (
        <div className="trn-gabarito" style={{ marginTop: 12 }}>
          <div className="trn-secao__label">Pontos esperados</div>
          <Itens itens={g.pontosEsperados} />
          {g.respostaModelo && (
            <>
              <div className="trn-secao__label" style={{ marginTop: 10 }}>
                Resposta modelo
              </div>
              <Texto>{g.respostaModelo}</Texto>
            </>
          )}
          {g.seguimento && <p className="trn-pergunta__ctx">Seguimento do entrevistador: {g.seguimento}</p>}
        </div>
      )}

      <Nota valor={notas[p.id] == null ? null : notas[p.id]} onChange={(n) => setNotas({ ...notas, [p.id]: n })} label={`Nota da pergunta ${i + 1}`} />

      <div className="trn-acoes">
        {i > 0 && (
          <button className="btn btn--ghost" onClick={() => setI(i - 1)}>
            Anterior
          </button>
        )}
        {i + 1 < c.perguntas.length && (
          <button className="btn btn--primary" onClick={() => setI(i + 1)}>
            Próxima
          </button>
        )}
      </div>

      <Secao label="Anotações do simulado (opcional)">
        <textarea className="input input--lg" rows={4} placeholder="O que travou, o que você esqueceu de dizer…" value={resposta} onChange={(e) => setResposta(e.target.value)} />
      </Secao>
      <div className="trn-acoes">
        <button className="btn btn--primary" disabled={enviando || faltam > 0} onClick={() => onResponder({ notas, resposta })}>
          {faltam > 0 ? `Faltam ${faltam} nota(s)` : 'Concluir simulado'}
        </button>
      </div>
    </div>
  )
}

function EtapaMaoNaMassa({ etapa, estado, concluida, enviando, onResponder }) {
  const c = etapa.corpo
  const [marcados, setMarcados] = useState((estado && estado.dados && estado.dados.marcados) || [])
  const [resposta, setResposta] = useState('')
  return (
    <div>
      {c.contexto && (
        <Secao label="Contexto">
          <Texto>{c.contexto}</Texto>
        </Secao>
      )}
      <div className="trn-card__meta">
        {c.tempoCaixa ? <span className="chip chip--amber">time-box {c.tempoCaixa} min</span> : null}
        {c.stack.map((s) => (
          <span key={s} className="chip">
            {s}
          </span>
        ))}
      </div>
      <Secao label="Passos">
        <Itens itens={c.passos} passos />
      </Secao>
      {c.entregavel && (
        <Secao label="Entregável">
          <p>{c.entregavel}</p>
        </Secao>
      )}
      <Secao label="Critério de pronto (é isso que vira a nota)">
        <Marcar itens={c.criterioPronto} marcados={marcados} onToggle={(i) => setMarcados(marcados.includes(i) ? marcados.filter((x) => x !== i) : [...marcados, i])} />
      </Secao>
      {!concluida && (
        <>
          <Secao label="O que você mediu / onde ficou (opcional)">
            <textarea className="input input--lg" rows={4} value={resposta} onChange={(e) => setResposta(e.target.value)} placeholder="Números, caminho da pasta, o que faltou…" />
          </Secao>
          <div className="trn-acoes">
            <button className="btn btn--primary" disabled={enviando} onClick={() => onResponder({ marcados, resposta })}>
              Concluir · {marcados.length} de {c.criterioPronto.length}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function EtapaEnsinar({ etapa, estado, concluida, enviando, onResponder }) {
  const c = etapa.corpo
  const [texto, setTexto] = useState((estado && estado.rascunho) || '')
  const [nota, setNota] = useState(null)
  const minimo = c.minimoChars || 300
  return (
    <div>
      <Secao label="Para quem">
        <p>{c.publico}</p>
      </Secao>
      <div className="trn-card__meta">
        <span className="chip chip--peri">{c.formato}</span>
        <span className="chip">{c.duracaoMin} min</span>
      </div>
      {c.roteiro.length > 0 && (
        <Secao label="Roteiro sugerido">
          <Itens itens={c.roteiro} passos />
        </Secao>
      )}
      <Secao label="Critérios">
        <Itens itens={c.criterios} />
      </Secao>
      {!concluida && (
        <>
          <Secao label={c.formato === 'texto' ? 'Cole a explicação' : 'Cole o roteiro ou a transcrição'}>
            <textarea className="input input--lg" rows={10} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={`mínimo ~${minimo} caracteres`} />
            <p className="trn-dim">
              {texto.trim().length}/{minimo}
            </p>
          </Secao>
          <Nota valor={nota} onChange={setNota} />
          <div className="trn-acoes">
            <button className="btn btn--primary" disabled={enviando || nota == null || texto.trim().length < minimo} onClick={() => onResponder({ nota, resposta: texto })}>
              Concluir etapa
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function EtapaRetrospectiva({ etapa, concluida, enviando, onResponder }) {
  const c = etapa.corpo
  const [respostas, setRespostas] = useState({})
  const [nota, setNota] = useState(null)
  const texto = c.perguntas.map((p, i) => `${p}\n${respostas[i] || ''}`).join('\n\n')
  const preenchidas = c.perguntas.filter((_, i) => (respostas[i] || '').trim().length > 10).length
  return (
    <div>
      {c.perguntas.map((p, i) => (
        <div key={i} className="trn-secao">
          <div className="trn-secao__label">Pergunta {i + 1}</div>
          <p style={{ margin: '0 0 6px' }}>{p}</p>
          {!concluida && (
            <textarea className="input" rows={3} value={respostas[i] || ''} onChange={(e) => setRespostas({ ...respostas, [i]: e.target.value })} />
          )}
        </div>
      ))}
      {c.proximoPasso && (
        <Secao label="Próximo passo">
          <p>{c.proximoPasso}</p>
        </Secao>
      )}
      {!concluida && (
        <>
          <Nota valor={nota} onChange={setNota} label="Nota que fecha o treino" />
          <div className="trn-acoes">
            <button className="btn btn--primary" disabled={enviando || nota == null || preenchidas < c.perguntas.length} onClick={() => onResponder({ nota, resposta: texto })}>
              {preenchidas < c.perguntas.length ? `Responda as ${c.perguntas.length} perguntas` : 'Fechar o treino'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

const POR_TIPO = {
  aquecimento: EtapaAquecimento,
  leitura: EtapaLeitura,
  desafio: EtapaDesafio,
  cronometrado: EtapaCronometrado,
  simulado: EtapaSimulado,
  'mao-na-massa': EtapaMaoNaMassa,
  ensinar: EtapaEnsinar,
  retrospectiva: EtapaRetrospectiva,
}

// ---- página ----------------------------------------------------------------

/**
 * /treino/:id — a trilha do Treino Especial: uma etapa de cada vez, com o visual do seu tipo,
 * botão de concluir, nota e a recompensa no fim.
 */
export default function Treino() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const [dados, setDados] = useState(null)
  const [erro, setErro] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [msg, setMsg] = useState(null)

  const carregar = useCallback(
    (silencioso) => {
      if (!silencioso) setErro(null)
      return apiTreinos
        .obter(id)
        .then((d) => {
          setDados(d)
          return d
        })
        .catch((e) => {
          setErro(e.message || 'falha ao carregar')
          return null
        })
    },
    [id],
  )
  useEffect(() => {
    carregar()
  }, [carregar])

  const treino = dados && dados.treino
  const estados = (dados && dados.estados) || {}
  const gabaritos = (dados && dados.gabaritos) || {}
  const progresso = (dados && dados.progresso) || {}

  const selId = params.get('etapa') || progresso.etapaAtual || progresso.proximaEtapa || (treino && treino.etapas[0] && treino.etapas[0].id)
  const etapa = treino ? treino.etapas.find((e) => e.id === selId) || treino.etapas[0] : null
  const estado = etapa ? estados[etapa.id] || null : null
  const concluida = Boolean(estado && estado.estado === 'concluida')

  const selecionar = (etapaId) => {
    setMsg(null)
    setParams(etapaId ? { etapa: etapaId } : {}, { replace: true })
    if (etapaId) apiTreinos.abrirEtapa(id, etapaId).catch(() => {})
  }

  const onResponder = async (corpo) => {
    if (!etapa) return null
    setEnviando(true)
    setMsg(null)
    try {
      const r = await apiTreinos.responder(id, etapa.id, corpo)
      await carregar(true)
      if (r.correto === false) {
        setEnviando(false)
        return r
      }
      if (r.recompensa) setMsg({ tipo: 'fim', texto: r.recompensa })
      else if (r.proximaEtapa) selecionar(r.proximaEtapa)
      setEnviando(false)
      return r
    } catch (e) {
      setMsg({ tipo: 'erro', texto: e.message })
      setEnviando(false)
      return null
    }
  }

  const onRevelar = async () => {
    if (!etapa) return
    setEnviando(true)
    try {
      await apiTreinos.revelar(id, etapa.id)
      await carregar(true)
    } catch (e) {
      setMsg({ tipo: 'erro', texto: e.message })
    }
    setEnviando(false)
  }

  const onDica = async (n) => {
    if (!etapa) return
    try {
      await apiTreinos.dica(id, etapa.id, n)
      await carregar(true)
    } catch (e) {
      setMsg({ tipo: 'erro', texto: e.message })
    }
  }

  const reabrir = async () => {
    if (!etapa) return
    await apiTreinos.reabrirEtapa(id, etapa.id).catch(() => {})
    carregar(true)
  }

  if (erro) return <Erro texto={erro} onRetry={carregar} />
  if (!dados || !treino) return <Carregando />

  const st = rotuloEstado(progresso.estado)
  const Corpo = etapa ? POR_TIPO[etapa.tipo] : null
  const fim = progresso.estado === 'concluido'

  return (
    <div>
      <Link to="/treinos" className="trn-dim">
        ← Treinos
      </Link>
      <div className="trn-topo">
        <h1>{treino.titulo}</h1>
        <span className={`chip ${st.classe}`}>{st.rotulo}</span>
      </div>
      {treino.subtitulo && <p className="muted small">{treino.subtitulo}</p>}

      <div className="card card--2" style={{ marginTop: 12 }}>
        <div className="trn-card__meta">
          <span className={`chip mono ${classeNivel(treino.nivel)}`}>nv {treino.nivel}</span>
          <span className="chip chip--peri">{duracaoTreino(treino)}</span>
          <span className="chip">{treino.etapas.length} etapas</span>
          {treino.tags.map((t) => (
            <span key={t} className="chip">
              {t}
            </span>
          ))}
        </div>
        <Secao label="Objetivo">
          <p>{treino.objetivo}</p>
        </Secao>
        {treino.preRequisitos.length > 0 && (
          <Secao label="Pré-requisitos">
            <Itens itens={treino.preRequisitos} />
          </Secao>
        )}
        <div className="trn-card__rodape">
          <Barra valor={progresso.concluidas || 0} max={progresso.total || treino.etapas.length} cor={fim ? 'green' : 'peri'} grande />
          <span className="trn-dim mono">
            {progresso.concluidas || 0}/{progresso.total || treino.etapas.length}
            {typeof progresso.notaFinal === 'number' ? ` · nota ${fmtNivel(progresso.notaFinal)}` : ''}
          </span>
        </div>
      </div>

      <div className="trn-trilha">
        {treino.etapas.map((e, i) => {
          const s = estados[e.id]
          const feita = s && s.estado === 'concluida'
          return (
            <button key={e.id} className={`trn-passo ${e.id === selId ? 'atual' : ''} ${feita ? 'feita' : ''}`} onClick={() => selecionar(e.id)}>
              <span className="trn-passo__num">{feita ? '✓' : i + 1}</span>
              <span className="trn-passo__corpo">
                <span className="trn-passo__titulo">{e.titulo}</span>
                <span className="trn-passo__meta">
                  {e.dia ? `dia ${e.dia} · ` : ''}
                  {NOME_TIPO[e.tipo] || e.tipo} · {e.tempoMin} min{e.opcional ? ' · opcional' : ''}
                </span>
              </span>
              {s && typeof s.nota === 'number' && <span className={`trn-passo__nota ${classeNivel(s.nota)}`}>{s.nota}</span>}
            </button>
          )
        })}
      </div>

      {etapa && Corpo && (
        <div className="trn-etapa">
          <div className="trn-card__meta">
            <span className="chip chip--peri">{NOME_TIPO[etapa.tipo] || etapa.tipo}</span>
            <span className="chip">{etapa.tempoMin} min</span>
            {etapa.dia ? <span className="chip">dia {etapa.dia}</span> : null}
            {etapa.termos.slice(0, 3).map((t) => (
              <Link key={`${t.deckId}/${t.termoId}`} to={`/deck/${t.deckId}`} className="chip">
                {t.termo}
              </Link>
            ))}
          </div>
          <h2>{etapa.titulo}</h2>
          {etapa.resumo && <p className="muted small">{etapa.resumo}</p>}

          <Corpo
            etapa={etapa}
            estado={estado}
            gabarito={gabaritos[etapa.id] || null}
            concluida={concluida}
            enviando={enviando}
            onResponder={onResponder}
            onRevelar={onRevelar}
            onDica={onDica}
          />

          {concluida && (
            <div className="trn-acoes">
              <span className={`chip mono ${classeNivel(estado.nota)}`}>nota {estado.nota == null ? '–' : estado.nota}</span>
              <button className="btn btn--ghost btn--sm" onClick={reabrir}>
                Refazer esta etapa
              </button>
            </div>
          )}
          {msg && msg.tipo === 'erro' && <p className="trn-erro">{msg.texto}</p>}
        </div>
      )}

      {fim && (
        <div className="trn-recompensa">
          <div className="trn-secao__label">Recompensa</div>
          <p>{treino.recompensa}</p>
          <p className="trn-dim">
            Nota final: <b>{fmtNivel(progresso.notaFinal)}</b> · concluído em {(progresso.concluidoEm || '').slice(0, 10)}
          </p>
          <div className="trn-acoes">
            <Link className="btn btn--primary" to="/treinos">
              Ver os outros treinos
            </Link>
            <button
              className="btn btn--ghost"
              onClick={async () => {
                await apiTreinos.reabrirTreino(id).catch(() => {})
                carregar(true)
              }}
            >
              Recomeçar a temporada
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
