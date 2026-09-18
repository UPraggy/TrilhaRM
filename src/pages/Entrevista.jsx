// Entrevista simulada: 3 a 5 rodadas em que o mentor pergunta EM CIMA da resposta anterior, e no fim
// avalia a conversa inteira. Tela cheia, como a lição. Backend: server/entrevista.js.
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api.js'
import { useStore } from '../store.jsx'
import { Carregando, Confirmar } from '../components/Comuns.jsx'
import { IcoX } from '../components/Icones.jsx'
import Coroas from '../components/Coroas.jsx'

export default function Entrevista() {
  const { moduloId } = useParams()
  const navegar = useNavigate()
  const { mostrarAviso } = useStore()

  const [dados, setDados] = useState(null)
  const [sessao, setSessao] = useState(null)
  const [rodada, setRodada] = useState(0)
  const [podeEncerrar, setPodeEncerrar] = useState(false)
  const [texto, setTexto] = useState('')
  const [pensando, setPensando] = useState(false)
  const [avaliacao, setAvaliacao] = useState(null)
  const [aviso, setAviso] = useState(null)
  const [saindo, setSaindo] = useState(false)
  const fimRef = useRef(null)

  useEffect(() => {
    api
      .entrevista(moduloId)
      .then((r) => {
        setDados(r)
        if (r.atual) {
          setSessao(r.atual)
          const n = r.atual.turnos.filter((t) => t.papel === 'candidato').length
          setRodada(n)
          setPodeEncerrar(n >= (r.minRodadas || 3))
        }
      })
      .catch((e) => mostrarAviso(e.message, 4000))
  }, [moduloId, mostrarAviso])

  useEffect(() => {
    if (fimRef.current) fimRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [sessao, avaliacao])

  const comecar = async () => {
    setPensando(true)
    try {
      const r = await api.entrevistaIniciar(moduloId)
      setSessao(r.sessao)
      setRodada(0)
      setPodeEncerrar(false)
      setAvaliacao(null)
    } catch (e) {
      mostrarAviso(e.message, 5000)
    } finally {
      setPensando(false)
    }
  }

  const responder = async (e) => {
    e.preventDefault()
    if (!texto.trim() || pensando) return
    setPensando(true)
    setAviso(null)
    try {
      const r = await api.entrevistaResponder(moduloId, texto)
      setSessao(r.sessao)
      setRodada(r.rodada)
      setPodeEncerrar(Boolean(r.podeEncerrar || r.fim))
      setTexto('')
      if (r.aviso) setAviso(r.aviso)
    } catch (err) {
      mostrarAviso(err.message, 5000)
    } finally {
      setPensando(false)
    }
  }

  const encerrar = async () => {
    setPensando(true)
    try {
      const r = await api.entrevistaEncerrar(moduloId)
      setAvaliacao(r.avaliacao || { semIA: true })
      if (r.aviso) setAviso(r.aviso)
      setSessao(r.sessao)
    } catch (e) {
      mostrarAviso(e.message, 5000)
    } finally {
      setPensando(false)
    }
  }

  if (!dados) return <Carregando texto="Abrindo a entrevista…" />

  const turnos = sessao ? sessao.turnos : []
  const esperandoResposta = turnos.length > 0 && turnos[turnos.length - 1].papel === 'entrevistador'

  return (
    <div className="licao entrevista">
      <header className="licao__topo">
        <button className="iconbtn" onClick={() => (sessao && !avaliacao ? setSaindo(true) : navegar(`/modulo/${moduloId}`))} aria-label="Sair da entrevista">
          <IcoX />
        </button>
        <div className="licao__progresso">
          <div className="progress" role="progressbar" aria-valuenow={rodada} aria-valuemin={0} aria-valuemax={dados.maxRodadas}>
            <span style={{ width: `${Math.round((rodada / dados.maxRodadas) * 100)}%` }} />
          </div>
        </div>
        <span className="dim mono small licao__contador">
          {rodada}/{dados.maxRodadas}
        </span>
      </header>

      <p className="licao__kicker dim small">
        Entrevista simulada {sessao ? `· ${sessao.moduloTitulo}` : ''} {sessao && sessao.idioma === 'en' && <span className="chip chip--xs">EN</span>}
      </p>

      <div className="licao__palco">
        {!sessao ? (
          <div className="card">
            <h2 className="leitura__titulo">Entrevista simulada</h2>
            <p>
              De 3 a 5 rodadas. Cada pergunta nasce da sua resposta anterior — é assim que uma entrevista
              de verdade descobre quem respondeu por cima. No fim, o mentor avalia a <b>conversa inteira</b>,
              não uma resposta isolada.
            </p>
            <ul className="lista">
              <li>Responda como falaria em voz alta: frases curtas, um exemplo concreto, um número.</li>
              <li>Não tem certo e errado por rodada — a nota sai do conjunto.</li>
              <li>Sem chave do OpenRouter, as perguntas saem do próprio conteúdo do módulo.</li>
            </ul>
            {dados.historico && dados.historico.length > 0 && (
              <p className="dim small">
                Você já fez {dados.historico.length} {dados.historico.length === 1 ? 'entrevista' : 'entrevistas'} deste módulo.
                {dados.historico[dados.historico.length - 1].avaliacao && (
                  <> Última avaliação: nível {dados.historico[dados.historico.length - 1].avaliacao.nivelSugerido ?? '–'}.</>
                )}
              </p>
            )}
            <div className="acoes">
              <button className="btn btn--primary btn--block" onClick={comecar} disabled={pensando} autoFocus>
                {pensando ? 'Começando…' : 'Começar'}
              </button>
            </div>
          </div>
        ) : (
          <>
            <ol className="entrevista__conversa">
              {turnos.map((t, i) => (
                <li key={i} className={`entrevista__turno entrevista__turno--${t.papel}`}>
                  <span className="eyebrow">{t.papel === 'entrevistador' ? 'Entrevistador' : 'Você'}</span>
                  <p>{t.texto}</p>
                  {t.offline && <span className="dim small">(pergunta do conteúdo — o mentor não respondeu)</span>}
                </li>
              ))}
              <li ref={fimRef} />
            </ol>

            {aviso && <p className="dim small entrevista__aviso">{aviso}</p>}

            {avaliacao ? (
              <div className="card entrevista__avaliacao">
                <div className="eyebrow">Avaliação da conversa</div>
                {avaliacao.semIA ? (
                  <p className="dim">
                    A entrevista ficou guardada no histórico, mas o mentor não conseguiu avaliar agora.
                    Confira a chave do OpenRouter em <Link to="/config">Ajustes</Link>.
                  </p>
                ) : (
                  <>
                    {avaliacao.classificacao && <p className="lead">{avaliacao.classificacao}</p>}
                    {avaliacao.nivelSugerido != null && (
                      <p>
                        <Coroas n={avaliacao.nivelSugerido} /> <span className="dim small">nível sugerido pelo mentor</span>
                      </p>
                    )}
                    {avaliacao.feedback && <p>{avaliacao.feedback}</p>}
                    {avaliacao.certo.length > 0 && (
                      <>
                        <div className="eyebrow">Acertou</div>
                        <ul className="lista">{avaliacao.certo.map((x, i) => <li key={i}>{x}</li>)}</ul>
                      </>
                    )}
                    {avaliacao.faltou.length > 0 && (
                      <>
                        <div className="eyebrow">Faltou</div>
                        <ul className="lista">{avaliacao.faltou.map((x, i) => <li key={i}>{x}</li>)}</ul>
                      </>
                    )}
                    {avaliacao.correcaoIngles && avaliacao.correcaoIngles.length > 0 && (
                      <>
                        <div className="eyebrow">Inglês</div>
                        <ul className="lista">{avaliacao.correcaoIngles.map((x, i) => <li key={i}>{x}</li>)}</ul>
                      </>
                    )}
                    {avaliacao.proximoPasso && (
                      <p className="entrevista__proximo">
                        <b>Próximo passo:</b> {avaliacao.proximoPasso}
                      </p>
                    )}
                  </>
                )}
                <div className="acoes acoes--col">
                  <button className="btn btn--primary btn--block" onClick={comecar}>
                    Outra entrevista
                  </button>
                  <Link to="/perfil/erros" className="btn btn--ghost btn--block">
                    Anotar o que faltou no diário
                  </Link>
                  <Link to={`/modulo/${moduloId}`} className="btn btn--ghost btn--block">
                    Voltar ao módulo
                  </Link>
                </div>
              </div>
            ) : (
              <form className="card entrevista__form" onSubmit={responder}>
                <textarea
                  className="textarea"
                  rows={6}
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  placeholder={sessao.idioma === 'en' ? 'Answer as you would out loud…' : 'Responda como falaria em voz alta…'}
                  disabled={pensando || !esperandoResposta}
                  aria-label="Sua resposta"
                />
                <div className="acoes acoes--col">
                  <button className="btn btn--primary btn--block" type="submit" disabled={pensando || !texto.trim() || !esperandoResposta}>
                    {pensando ? 'O entrevistador está pensando…' : 'Responder'}
                  </button>
                  {podeEncerrar && (
                    <button className="btn btn--ghost btn--block" type="button" onClick={encerrar} disabled={pensando}>
                      Encerrar e receber a avaliação
                    </button>
                  )}
                </div>
              </form>
            )}
          </>
        )}
      </div>

      {saindo && (
        <Confirmar
          titulo="Sair da entrevista?"
          texto="A conversa fica guardada e você pode voltar nela depois. Sem encerrar, não há avaliação."
          confirmar="Sair"
          perigo
          onSim={() => navegar(`/modulo/${moduloId}`)}
          onNao={() => setSaindo(false)}
        />
      )}
    </div>
  )
}
