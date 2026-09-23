import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Nivel from '../components/Nivel.jsx'
import { Bloco, Contexto, MentorFeedback } from '../components/Comuns.jsx'
import { IcoFaisca } from '../components/Icones.jsx'
import { api } from '../api.js'
import { useStore } from '../store.jsx'
import { fmtDataCurta } from '../lib/util.js'

/**
 * Modo "Mentor": pergunta de entrevista (PT/EN), textarea para a resposta (guardada no progresso),
 * depois revela a profundidade e o usuário se dá nota 0–5.
 */
export default function Explique({ item, onConcluir }) {
  const { estadoDe } = useStore()
  const [lingua, setLingua] = useState(() => {
    try {
      return localStorage.getItem('trilharm.lingua') || 'pt'
    } catch {
      return 'pt'
    }
  })
  const [texto, setTexto] = useState('')
  const [revelado, setRevelado] = useState(false)
  const [mentor, setMentor] = useState(null) // { estado:'rodando'|'ok'|'erro', dados }
  const anteriores = (estadoDe(item) || {}).respostasExplique || []

  useEffect(() => {
    setTexto('')
    setRevelado(false)
    setMentor(null)
  }, [item])

  const pedirMentor = async () => {
    if (!texto.trim()) return
    setMentor({ estado: 'rodando' })
    try {
      const r = await api.avaliarComMentor({ deckId: item.deckId, termoId: item.id, resposta: texto, idioma: lingua })
      setMentor({ estado: 'ok', dados: r })
    } catch (e) {
      setMentor({ estado: 'erro', dados: { codigo: e.codigo, mensagem: e.message } })
    }
  }

  const trocarLingua = (l) => {
    setLingua(l)
    try {
      localStorage.setItem('trilharm.lingua', l)
    } catch {
      /* sem storage */
    }
  }

  const pergunta = lingua === 'en' && item.perguntaEntrevistaEN ? item.perguntaEntrevistaEN : item.perguntaEntrevista

  return (
    <div>
      <Contexto
        termo={item}
        extra={
          <span className="toggle ml-auto" role="group" aria-label="Idioma da pergunta">
            <button className={lingua === 'pt' ? 'active' : ''} onClick={() => trocarLingua('pt')}>
              PT
            </button>
            <button className={lingua === 'en' ? 'active' : ''} onClick={() => trocarLingua('en')} disabled={!item.perguntaEntrevistaEN}>
              EN
            </button>
          </span>
        }
      />
      <div className="card">
        <div className="eyebrow">Pergunta de entrevista · {item.termo}</div>
        <p className="pergunta mt-2">
          {pergunta}
        </p>
        <textarea
          className="textarea mt-4"
          placeholder={lingua === 'en' ? 'Answer as you would in the interview…' : 'Responda como responderia na entrevista…'}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          disabled={revelado}
          aria-label="Sua resposta"
        />
        {!revelado && (
          <div className="acoes">
            <button className="btn btn--primary btn--block" onClick={() => setRevelado(true)}>
              {texto.trim() ? 'Comparar com a profundidade' : 'Não sei — mostrar a resposta'}
            </button>
          </div>
        )}
        {revelado && (
          <>
            <Bloco label="Definição">{item.definicao}</Bloco>
            <Bloco label="Profundidade">{item.profundidade}</Bloco>
            <Bloco label="Exemplo" pre>
              {item.exemplo}
            </Bloco>
            {texto.trim() && (
              <div className="acoes mt-4">
                <button className="btn" onClick={pedirMentor} disabled={mentor && mentor.estado === 'rodando'}>
                  <IcoFaisca /> {mentor && mentor.estado === 'rodando' ? 'Mentor lendo…' : 'Avaliar com o mentor (IA)'}
                </button>
              </div>
            )}
            {mentor && mentor.estado === 'rodando' && <p className="mentor__lendo mt-3">Comparando sua resposta com o gabarito…</p>}
            {mentor && mentor.estado === 'erro' && (
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
            {mentor && mentor.estado === 'ok' && <MentorFeedback dados={mentor.dados} onUsarNota={(n) => onConcluir([{ item, nota: n, resposta: texto }])} />}
            <div className="bloco">
              <div className="bloco__label">Comparando com o que você escreveu, que nota você se dá?</div>
              <Nivel onEscolher={(n) => onConcluir([{ item, nota: n, resposta: texto }])} />
            </div>
          </>
        )}
      </div>
      {anteriores.length > 0 && (
        <div className="card card--flat mt-4">
          <div className="eyebrow">Respostas anteriores ({anteriores.length})</div>
          {anteriores
            .slice()
            .reverse()
            .slice(0, 3)
            .map((r, i) => (
              <div key={i} className="bloco mt-2">
                <div className="dim small mono">
                  {fmtDataCurta(r.dia)} · nota {r.nota}
                </div>
                <p className="small pre-wrap">
                  {r.texto}
                </p>
                {r.avaliacaoIA && <MentorFeedback dados={r.avaliacaoIA} compacto />}
              </div>
            ))}
        </div>
      )}
    </div>
  )
}
