// A LIÇÃO: a sessão de 8-12 itens de um nó, em tela cheia, um item por tela.
// O plano vem de GET /api/licao/:moduloId/:n (server/licao.js); os componentes de modo são os de
// src/modes/. Ao fechar, POST /api/licao/:moduloId/:n/concluir devolve XP e o próximo nó.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api.js'
import { useStore } from '../store.jsx'
import { Carregando, Confirmar, Erro } from '../components/Comuns.jsx'
import Blocos from '../components/Blocos.jsx'
import { IcoCheck, IcoSeta, IcoX } from '../components/Icones.jsx'
import { nomeAmbiente } from '../lib/util.js'

import Flashcards from '../modes/Flashcards.jsx'
import Quiz from '../modes/Quiz.jsx'
import Digitar from '../modes/Digitar.jsx'
import VF from '../modes/VF.jsx'
import Explique from '../modes/Explique.jsx'
import SintomaCausa from '../modes/SintomaCausa.jsx'
import Lacuna from '../modes/Lacuna.jsx'
import Ordenar from '../modes/Ordenar.jsx'
import Conexoes from '../modes/Conexoes.jsx'
import Confundiveis from '../modes/Confundiveis.jsx'
import RecallLivre from '../modes/RecallLivre.jsx'
import { useT } from '../i18n/index.jsx'

/** um bloco de leitura do curso, dentro da sessão */
function Leitura({ item, onConcluir }) {
  const { t } = useT()
  return (
    <div>
      <div className="recall__topo">
        <span className="chip">{t('leitura')} · {item.cursoTitulo}</span>
        {item.concluida && <span className="dim small">{t('já lida')}</span>}
      </div>
      <div className="card leitura">
        <h2 className="leitura__titulo">{item.titulo}</h2>
        <Blocos blocos={item.blocos} />
        <div className="acoes">
          <button className="btn btn--primary btn--block" onClick={() => onConcluir([{ tipo: 'leitura', ok: true }])} autoFocus>
            {t('Li — continuar')}
          </button>
        </div>
        <p className="dim small">
          {t('O curso inteiro está em')} <Link to={`/curso/${item.cursoId}`}>{item.cursoTitulo}</Link>.
        </p>
      </div>
    </div>
  )
}

/** a missão: o exercício que se faz FORA do app. A lição propõe; a entrega acontece no laboratório. */
function Missao({ item, onConcluir }) {
  const { t } = useT()
  return (
    <div>
      <div className="recall__topo">
        <span className="chip chip--amber">{t('missão · fora do app')}</span>
        <span className="dim small mono">~{item.tempoMin} min · {nomeAmbiente(item.ambiente)}</span>
      </div>
      <div className="card">
        <div className="eyebrow">{t('Para fazer no terminal, não aqui')}</div>
        <h2 className="leitura__titulo">{item.titulo}</h2>
        {item.concluida ? (
          <div className="feedback ok">
            <b className="green">{t('Você já entregou esta.')}</b> {t('Nota')} {item.nota}. {t('Dá para reabrir e tentar de novo no laboratório.')}
          </div>
        ) : (
          <p className="dim small">
            {t('Exercícios levam de 20 a 50 minutos — por isso eles não entram no meio da sessão. Abra agora se tiver tempo, ou marque para depois e siga a lição.')}
          </p>
        )}
        <div className="acoes acoes--col">
          <Link to={`/pratica/${item.deckId}/${item.exId}`} className="btn btn--primary btn--block">
            {t('Abrir o exercício')}
            <IcoSeta width={18} height={18} />
          </Link>
          <button className="btn btn--ghost btn--block" onClick={() => onConcluir([{ tipo: 'missao', ok: item.concluida, nota: item.concluida ? item.nota : undefined }])}>
            {item.concluida ? t('Continuar') : t('Deixar para depois — continuar a lição')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Licao() {
  const { moduloId, n } = useParams()
  const navegar = useNavigate()
  const { termos, avaliar, recarregarEstrutura, mostrarAviso } = useStore()
  const { t } = useT()

  const [licao, setLicao] = useState(null)
  const [erro, setErro] = useState(null)
  const [i, setI] = useState(0)
  const [respostas, setRespostas] = useState([])
  const [saindo, setSaindo] = useState(false)
  const [fechando, setFechando] = useState(false)
  const respostasRef = useRef(respostas)
  respostasRef.current = respostas

  useEffect(() => {
    let vivo = true
    setLicao(null)
    setErro(null)
    setI(0)
    setRespostas([])
    api
      .licao(moduloId, n)
      .then((l) => vivo && setLicao(l))
      .catch((e) => vivo && setErro(e.message))
    return () => {
      vivo = false
    }
  }, [moduloId, n])

  const pool = useMemo(() => (licao ? termos.filter((x) => x.deckId === licao.modulo.deckId) : []), [licao, termos])
  const item = licao ? licao.itens[i] : null
  const total = licao ? licao.itens.length : 0

  const fechar = useCallback(
    async (itens) => {
      setFechando(true)
      try {
        const r = await api.licaoConcluir(moduloId, n, itens)
        await recarregarEstrutura()
        navegar(`/resultado/${moduloId}/${n}`, { state: { resultado: r, modulo: licao.modulo } })
      } catch (e) {
        setFechando(false)
        mostrarAviso(`${t('Não fechou a lição:')} ${e.message}`, 4000)
      }
    },
    [moduloId, n, navegar, recarregarEstrutura, licao, mostrarAviso],
  )

  /** um item terminou: grava a avaliação SM-2 (quando for termo) e anda para o próximo */
  const concluirItem = useCallback(
    async (resultados) => {
      const r = Array.isArray(resultados) ? resultados[0] || {} : {}
      const atual = licao.itens[i]
      const registro = { tipo: atual.tipo === 'termo' ? 'termo' : atual.tipo === 'leitura' ? 'leitura' : atual.tipo === 'missao' ? 'exercicio' : 'termo', ref: atual.termoId || atual.licaoId || atual.exId || 'recall' }
      if (typeof r.nota === 'number') registro.nota = r.nota
      else registro.ok = r.ok !== false

      // termo: a nota vira avaliação SM-2 de verdade (é ela que conta para a ofensiva)
      if (atual.tipo === 'termo' && typeof r.nota === 'number' && r.item) {
        try {
          await avaliar({ deckId: r.item.deckId, termoId: r.item.id, nota: r.nota, modo: atual.modo, resposta: r.resposta })
        } catch {
          /* o aviso já apareceu no store; a sessão continua para não perder o resto */
        }
      }

      const novas = [...respostasRef.current, registro]
      setRespostas(novas)
      if (i + 1 < total) setI(i + 1)
      else fechar(novas)
    },
    [licao, i, total, avaliar, fechar],
  )

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !saindo) setSaindo(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [saindo])

  if (erro) return <Erro texto={erro} onRetry={() => navegar(0)} />
  if (!licao) return <Carregando texto={t('Montando a lição…')} />

  const pct = total ? Math.round((i / total) * 100) : 0

  function renderItem() {
    if (item.tipo === 'leitura') return <Leitura item={item} onConcluir={concluirItem} />
    if (item.tipo === 'missao') return <Missao item={item} onConcluir={concluirItem} />
    if (item.tipo === 'recall') return <RecallLivre termos={item.termos} onConcluir={concluirItem} />

    const termo = pool.find((x) => x.id === item.termoId)
    if (!termo) {
      return (
        <div className="card">
          <p className="dim">{t('Termo não encontrado neste módulo.')}</p>
          <button className="btn btn--primary btn--block" onClick={() => concluirItem([{ ok: false }])}>
            {t('Pular')}
          </button>
        </div>
      )
    }
    const comuns = { item: termo, pool, onConcluir: concluirItem }
    switch (item.modo) {
      case 'quiz':
        return <Quiz {...comuns} />
      case 'quiz-inv':
        return <Quiz {...comuns} invertido />
      case 'digitar':
        return <Digitar {...comuns} />
      case 'vf':
        return <VF {...comuns} />
      case 'explique':
        return <Explique {...comuns} />
      case 'sintoma-causa':
        return <SintomaCausa {...comuns} />
      case 'lacuna':
        return <Lacuna {...comuns} lacuna={item.lacuna} />
      case 'ordenar':
        return <Ordenar {...comuns} sequencia={item.sequencia || []} />
      case 'conexoes':
        return <Conexoes {...comuns} />
      case 'confundiveis':
        return <Confundiveis {...comuns} />
      default:
        return <Flashcards {...comuns} />
    }
  }

  return (
    <div className="licao">
      <header className="licao__topo">
        <button className="iconbtn" onClick={() => setSaindo(true)} aria-label={t('Sair da lição')}>
          <IcoX />
        </button>
        <div className="licao__progresso">
          <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${t('Item')} ${i + 1} ${t('de')} ${total}`}>
            <span style={{ width: `${pct}%` }} />
          </div>
        </div>
        <span className="dim mono small licao__contador">
          {i + 1}/{total}
        </span>
      </header>

      <p className="licao__kicker dim small">
        {licao.modulo.titulo} · {licao.no.titulo}
        {item && item.tipo === 'termo' && item.vencido && <span className="chip chip--amber chip--xs" style={{ marginLeft: 8 }}>{t('revisão')}</span>}
      </p>

      <div className="licao__palco">{fechando ? <Carregando texto={t('Fechando a lição…')} cartoes={1} /> : renderItem()}</div>

      {saindo && (
        <Confirmar
          titulo={t('Sair da lição?')}
          texto={
            respostas.length
              ? `${t('Você respondeu')} ${respostas.length} ${t('de')} ${total}. ${t('As avaliações dos termos já foram gravadas, mas o nó não fecha e você não ganha o XP.')}`
              : t('Nada foi respondido ainda.')
          }
          confirmar={t('Sair')}
          perigo
          onSim={() => navegar(`/modulo/${moduloId}`)}
          onNao={() => setSaindo(false)}
        />
      )}
    </div>
  )
}
