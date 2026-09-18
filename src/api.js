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
  // V2: trilha -> modulo -> no (o caminho estilo Duolingo)
  estrutura: () => req('/api/estrutura'),
  modulo: (id) => req(`/api/modulos/${encodeURIComponent(id)}`),
  // lição: a sessão de um nó
  licao: (moduloId, n) => req(`/api/licao/${encodeURIComponent(moduloId)}/${encodeURIComponent(n)}`),
  licaoConcluir: (moduloId, n, itens) =>
    req(`/api/licao/${encodeURIComponent(moduloId)}/${encodeURIComponent(n)}/concluir`, { method: 'POST', body: JSON.stringify({ itens }) }),
  licaoHistorico: (moduloId, n) => req(`/api/licao/${encodeURIComponent(moduloId)}/${encodeURIComponent(n)}/historico`),
  // diário de erros
  diario: (moduloId) => req(`/api/diario${moduloId ? `?modulo=${encodeURIComponent(moduloId)}` : ''}`),
  diarioAnotar: (corpo) => req('/api/diario', { method: 'POST', body: JSON.stringify(corpo) }),
  diarioAtualizar: (id, campos) => req(`/api/diario/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(campos) }),
  diarioRemover: (id) => req(`/api/diario/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  // entrevista simulada
  entrevista: (moduloId) => req(`/api/entrevista/${encodeURIComponent(moduloId)}`),
  entrevistaIniciar: (moduloId) => req(`/api/entrevista/${encodeURIComponent(moduloId)}/iniciar`, { method: 'POST', body: '{}' }),
  entrevistaResponder: (moduloId, resposta) => req(`/api/entrevista/${encodeURIComponent(moduloId)}/responder`, { method: 'POST', body: JSON.stringify({ resposta }) }),
  entrevistaEncerrar: (moduloId) => req(`/api/entrevista/${encodeURIComponent(moduloId)}/encerrar`, { method: 'POST', body: '{}' }),
  entrevistaDescartar: (moduloId) => req(`/api/entrevista/${encodeURIComponent(moduloId)}`, { method: 'DELETE' }),
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
  // ⚠️ prefixo `curso` obrigatório: sem ele estas chaves colidiam com as da LIÇÃO da V2 no mesmo
  // objeto literal, e a última declarada vencia em silêncio (a lição fechava na rota do curso e dava 404).
  cursoLicaoConcluir: (id, licaoId, concluida = true) =>
    req(`/api/cursos/${encodeURIComponent(id)}/licao/${encodeURIComponent(licaoId)}/concluir`, { method: 'POST', body: JSON.stringify({ concluida }) }),
  cursoLicaoVisto: (id, licaoId) => req(`/api/cursos/${encodeURIComponent(id)}/licao/${encodeURIComponent(licaoId)}/visto`, { method: 'POST', body: '{}' }),
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
  // bot do Telegram
  telegramConfig: () => req('/api/telegram'),
  telegramSalvar: (patch) => req('/api/telegram', { method: 'PUT', body: JSON.stringify(patch) }),
  telegramIniciar: () => req('/api/telegram/iniciar', { method: 'POST', body: '{}' }),
  telegramParar: () => req('/api/telegram/parar', { method: 'POST', body: '{}' }),
  telegramTeste: () => req('/api/telegram/teste', { method: 'POST', body: '{}' }),
  // treinos especiais (content/treinos)
  treinos: () => req('/api/treinos'),
  treino: (id) => req(`/api/treinos/${encodeURIComponent(id)}`),
  treinoIniciar: (id) => req(`/api/treinos/${encodeURIComponent(id)}/iniciar`, { method: 'POST', body: '{}' }),
  treinoReabrir: (id) => req(`/api/treinos/${encodeURIComponent(id)}/reabrir`, { method: 'POST', body: '{}' }),
  treinoEtapaAbrir: (id, etapaId) => req(`/api/treinos/${encodeURIComponent(id)}/etapa/${encodeURIComponent(etapaId)}/abrir`, { method: 'POST', body: '{}' }),
  treinoEtapaRascunho: (id, etapaId, texto) =>
    req(`/api/treinos/${encodeURIComponent(id)}/etapa/${encodeURIComponent(etapaId)}/rascunho`, { method: 'PUT', body: JSON.stringify({ texto }) }),
  treinoEtapaDica: (id, etapaId, n) =>
    req(`/api/treinos/${encodeURIComponent(id)}/etapa/${encodeURIComponent(etapaId)}/dica`, { method: 'POST', body: JSON.stringify({ n }) }),
  treinoEtapaRevelar: (id, etapaId) => req(`/api/treinos/${encodeURIComponent(id)}/etapa/${encodeURIComponent(etapaId)}/revelar`, { method: 'POST', body: '{}' }),
  treinoEtapaResponder: (id, etapaId, corpo) =>
    req(`/api/treinos/${encodeURIComponent(id)}/etapa/${encodeURIComponent(etapaId)}/responder`, { method: 'POST', body: JSON.stringify(corpo) }),
  treinoEtapaReabrir: (id, etapaId) => req(`/api/treinos/${encodeURIComponent(id)}/etapa/${encodeURIComponent(etapaId)}/reabrir`, { method: 'POST', body: '{}' }),
}

export const { obterConfig, salvarConfig, listarModelos, avaliarComMentor } = api
