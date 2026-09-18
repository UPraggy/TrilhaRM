import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { Bloco, EstadoTermo } from '../components/Comuns.jsx'
import { IcoBusca } from '../components/Icones.jsx'
import { normalizar } from '../lib/texto.js'
import { chaveTermo, NIVEIS } from '../lib/util.js'

export default function Glossario() {
  const { termos, decks, estadoDe } = useStore()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState(params.get('q') || '')
  const [deckF, setDeckF] = useState(params.get('deck') || '')
  const [tagF, setTagF] = useState(params.get('tag') || '')
  const [nivelF, setNivelF] = useState(params.get('nivel') || '') // '', 'novo', '0'..'5'
  const [aberto, setAberto] = useState(params.get('t') || null)

  useEffect(() => {
    const p = {}
    if (q) p.q = q
    if (deckF) p.deck = deckF
    if (tagF) p.tag = tagF
    if (nivelF) p.nivel = nivelF
    if (aberto) p.t = aberto
    setParams(p, { replace: true })
  }, [q, deckF, tagF, nivelF, aberto, setParams])

  const tags = useMemo(() => {
    const m = new Map()
    for (const t of termos) for (const tg of t.tags) m.set(tg, (m.get(tg) || 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t)
  }, [termos])

  const porChave = useMemo(() => new Map(termos.map((t) => [chaveTermo(t), t])), [termos])
  const porId = useMemo(() => {
    const m = new Map()
    for (const t of termos) if (!m.has(t.id)) m.set(t.id, t)
    return m
  }, [termos])

  const filtrados = useMemo(() => {
    const nq = normalizar(q)
    return termos.filter((t) => {
      if (deckF && t.deckId !== deckF) return false
      if (tagF && !t.tags.includes(tagF)) return false
      if (nivelF) {
        const e = estadoDe(t)
        if (nivelF === 'novo') {
          if (e) return false
        } else if (!e || Math.floor(e.nivel) !== Number(nivelF)) return false
      }
      if (!nq) return true
      return (
        normalizar(t.termo).includes(nq) ||
        normalizar(t.termoEN).includes(nq) ||
        normalizar(t.definicao).includes(nq) ||
        normalizar(t.profundidade).includes(nq) ||
        t.tags.some((tg) => normalizar(tg).includes(nq))
      )
    })
  }, [termos, q, deckF, tagF, nivelF, estadoDe])

  const resolverRelacionado = (t, relId) => {
    // relacionado pode ser "termoId" (mesmo deck) ou "deckId/termoId"
    if (relId.includes('/')) return porChave.get(relId) || null
    return porChave.get(`${t.deckId}/${relId}`) || porId.get(relId) || null
  }

  const abrir = (t) => {
    const k = chaveTermo(t)
    setAberto((a) => (a === k ? null : k))
  }

  useEffect(() => {
    if (!aberto) return
    const el = document.getElementById(`gl-${aberto.replace('/', '__')}`)
    if (el) el.scrollIntoView({ block: 'nearest' })
  }, [aberto])

  return (
    <div>
      <div className="busca">
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <div style={{ position: 'relative', flex: '1 1 auto', minWidth: 0 }}>
            <IcoBusca style={{ position: 'absolute', left: 12, top: 12, color: 'var(--fg-3)', width: 20, height: 20 }} />
            <input
              className="input"
              style={{ paddingLeft: 40 }}
              type="search"
              placeholder="Buscar termo, definição, tag…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              autoFocus={!aberto}
              aria-label="Buscar no glossário"
            />
          </div>
          <span className="dim small mono nowrap">
            {filtrados.length}/{termos.length}
          </span>
        </div>
        <div className="filtros">
          <select className="input btn--mini" value={deckF} onChange={(e) => setDeckF(e.target.value)} aria-label="Filtrar por deck">
            <option value="">todos os decks</option>
            {decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.titulo}
              </option>
            ))}
          </select>
          <select className="input btn--mini" value={nivelF} onChange={(e) => setNivelF(e.target.value)} aria-label="Filtrar por nível">
            <option value="">qualquer nível</option>
            <option value="novo">nunca vistos</option>
            {NIVEIS.map((n) => (
              <option key={n.n} value={String(n.n)}>
                nível {n.n} · {n.rotulo}
              </option>
            ))}
          </select>
          {tagF && (
            <button className="chip active" onClick={() => setTagF('')}>
              #{tagF} ×
            </button>
          )}
        </div>
        {!tagF && tags.length > 0 && (
          <div className="filtros filtros--fita mt-1">
            {tags.slice(0, 14).map((tg) => (
              <button key={tg} className="chip" onClick={() => setTagF(tg)}>
                #{tg}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="stack-sm mt-3">
        {filtrados.map((t) => {
          const k = chaveTermo(t)
          const ab = aberto === k
          return (
            <div key={k} id={`gl-${k.replace('/', '__')}`} className="card card--flat gl-item">
              <button className="gl-item__head" onClick={() => abrir(t)} aria-expanded={ab}>
                <span className="gl-item__termo">
                  {t.termo}
                  {t.termoEN && t.termoEN !== t.termo && <small>{t.termoEN}</small>}
                </span>
                <span className="chip dim" style={{ display: ab ? 'none' : undefined }}>
                  {t.deckTitulo}
                </span>
                <EstadoTermo termo={t} />
              </button>
              {ab && (
                <div className="gl-item__body">
                  <div className="row mt-3">
                    <Link to={`/deck/${t.deckId}`} className="chip chip--peri">
                      {t.deckTitulo}
                    </Link>
                    {t.tags.map((tg) => (
                      <button key={tg} className="chip" onClick={() => setTagF(tg)}>
                        #{tg}
                      </button>
                    ))}
                    <span className="chip dim">alvo nv {t.nivelAlvo}</span>
                  </div>
                  <Bloco label="Definição">{t.definicao}</Bloco>
                  <Bloco label="Profundidade">{t.profundidade}</Bloco>
                  <Bloco label="Exemplo" pre>
                    {t.exemplo}
                  </Bloco>
                  {t.perguntaEntrevista && (
                    <Bloco label="Pergunta de entrevista">
                      {t.perguntaEntrevista}
                      {t.perguntaEntrevistaEN && <span className="dim"> — {t.perguntaEntrevistaEN}</span>}
                    </Bloco>
                  )}
                  {t.relacionados.length > 0 && (
                    <div className="bloco">
                      <div className="bloco__label">Relacionados</div>
                      <div className="rel">
                        {t.relacionados.map((rid) => {
                          const alvo = resolverRelacionado(t, rid)
                          if (!alvo)
                            return (
                              <span key={rid} className="chip dim" title="termo não encontrado nos decks">
                                {rid}
                              </span>
                            )
                          return (
                            <a
                              key={rid}
                              className="chip chip--peri"
                              href={`#gl-${chaveTermo(alvo).replace('/', '__')}`}
                              onClick={(e) => {
                                e.preventDefault()
                                setQ('')
                                setDeckF('')
                                setTagF('')
                                setNivelF('')
                                setAberto(chaveTermo(alvo))
                              }}
                            >
                              {alvo.termo}
                            </a>
                          )
                        })}
                      </div>
                    </div>
                  )}
                  <div className="acoes">
                    <Link to={`/estudar/flashcards?fonte=termo:${encodeURIComponent(k)}`} className="btn btn--sm">
                      Flashcard
                    </Link>
                    {t.perguntaEntrevista && (
                      <Link to={`/estudar/explique?fonte=termo:${encodeURIComponent(k)}`} className="btn btn--sm">
                        Explique
                      </Link>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
        {filtrados.length === 0 && <div className="vazio">Nada encontrado.</div>}
      </div>
    </div>
  )
}
