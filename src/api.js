// Cliente da API. Em dev o Vite faz proxy de /api → 8790; em prod o Express serve tudo junto.

async function req(url, opts) {
  const r = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(opts && opts.headers) },
    ...opts,
  })
  const texto = await r.text()
  let dados = null
  try {
    dados = texto ? JSON.parse(texto) : null
  } catch {
    dados = { erro: texto }
  }
  if (!r.ok) {
    const e = new Error((dados && (dados.mensagem || dados.erro)) || `HTTP ${r.status}`)
    e.status = r.status
    e.codigo = dados && dados.erro ? dados.erro : null
    e.dados = dados
    throw e
  }
  return dados
}

export const api = {
  decks: () => req('/api/decks'),
  deck: (id) => req(`/api/decks/${encodeURIComponent(id)}`),
  termos: () => req('/api/termos'),
  trilhas: () => req('/api/trilhas'),
  progresso: () => req('/api/progresso'),
  revisao: () => req('/api/progresso/revisao'),
  avaliar: (corpo) => req('/api/progresso/avaliar', { method: 'POST', body: JSON.stringify(corpo) }),
  reset: () => req('/api/progresso/reset', { method: 'POST', body: '{}' }),
  // mentor IA (OpenRouter)
  obterConfig: () => req('/api/config'),
  salvarConfig: (patch) => req('/api/config', { method: 'PUT', body: JSON.stringify(patch) }),
  listarModelos: () => req('/api/mentor/modelos'),
  avaliarComMentor: (corpo) => req('/api/mentor/avaliar', { method: 'POST', body: JSON.stringify(corpo) }),
  // práticas (exercícios resolvidos fora do app)
  praticas: () => req('/api/praticas'),
  pratica: (deckId, exId) => req(`/api/praticas/${encodeURIComponent(deckId)}/${encodeURIComponent(exId)}`),
  praticaIniciar: (deckId, exId) => req(`/api/praticas/${encodeURIComponent(deckId)}/${encodeURIComponent(exId)}/iniciar`, { method: 'POST', body: '{}' }),
  praticaRascunho: (deckId, exId, texto) =>
    req(`/api/praticas/${encodeURIComponent(deckId)}/${encodeURIComponent(exId)}/rascunho`, { method: 'PUT', body: JSON.stringify({ texto }) }),
  praticaDica: (deckId, exId, n) => req(`/api/praticas/${encodeURIComponent(deckId)}/${encodeURIComponent(exId)}/dica`, { method: 'POST', body: JSON.stringify({ n }) }),
  praticaRevelar: (deckId, exId) => req(`/api/praticas/${encodeURIComponent(deckId)}/${encodeURIComponent(exId)}/revelar`, { method: 'POST', body: '{}' }),
  praticaReabrir: (deckId, exId) => req(`/api/praticas/${encodeURIComponent(deckId)}/${encodeURIComponent(exId)}/reabrir`, { method: 'POST', body: '{}' }),
  praticaResponder: (deckId, exId, corpo) =>
    req(`/api/praticas/${encodeURIComponent(deckId)}/${encodeURIComponent(exId)}/responder`, { method: 'POST', body: JSON.stringify(corpo) }),
  praticaMentor: (deckId, exId, resposta) =>
    req(`/api/praticas/${encodeURIComponent(deckId)}/${encodeURIComponent(exId)}/mentor`, { method: 'POST', body: JSON.stringify({ resposta }) }),
  // cursos (lições em Markdown em content/cursos)
  cursos: () => req('/api/cursos'),
  curso: (id) => req(`/api/cursos/${encodeURIComponent(id)}`),
  licaoConcluir: (id, licaoId, concluida = true) =>
    req(`/api/cursos/${encodeURIComponent(id)}/licao/${encodeURIComponent(licaoId)}/concluir`, { method: 'POST', body: JSON.stringify({ concluida }) }),
  licaoVisto: (id, licaoId) => req(`/api/cursos/${encodeURIComponent(id)}/licao/${encodeURIComponent(licaoId)}/visto`, { method: 'POST', body: '{}' }),
  // atividades embutidas nas lições - mesmo fluxo (e mesma correção) das práticas
  cursoAtividade: (id, atvId) => req(`/api/cursos/${encodeURIComponent(id)}/atividade/${encodeURIComponent(atvId)}`),
  cursoAtividadeIniciar: (id, atvId) => req(`/api/cursos/${encodeURIComponent(id)}/atividade/${encodeURIComponent(atvId)}/iniciar`, { method: 'POST', body: '{}' }),
  cursoAtividadeRascunho: (id, atvId, texto) =>
    req(`/api/cursos/${encodeURIComponent(id)}/atividade/${encodeURIComponent(atvId)}/rascunho`, { method: 'PUT', body: JSON.stringify({ texto }) }),
  cursoAtividadeDica: (id, atvId, n) =>
    req(`/api/cursos/${encodeURIComponent(id)}/atividade/${encodeURIComponent(atvId)}/dica`, { method: 'POST', body: JSON.stringify({ n }) }),
  cursoAtividadeRevelar: (id, atvId) => req(`/api/cursos/${encodeURIComponent(id)}/atividade/${encodeURIComponent(atvId)}/revelar`, { method: 'POST', body: '{}' }),
  cursoAtividadeReabrir: (id, atvId) => req(`/api/cursos/${encodeURIComponent(id)}/atividade/${encodeURIComponent(atvId)}/reabrir`, { method: 'POST', body: '{}' }),
  cursoAtividadeResponder: (id, atvId, corpo) =>
    req(`/api/cursos/${encodeURIComponent(id)}/atividade/${encodeURIComponent(atvId)}/responder`, { method: 'POST', body: JSON.stringify(corpo) }),
  cursoAtividadeMentor: (id, atvId, resposta) =>
    req(`/api/cursos/${encodeURIComponent(id)}/atividade/${encodeURIComponent(atvId)}/mentor`, { method: 'POST', body: JSON.stringify({ resposta }) }),
}

export const { obterConfig, salvarConfig, listarModelos, avaliarComMentor } = api
