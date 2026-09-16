// Cliente das rotas de Treino Especial.
// Fica num arquivo próprio porque src/api.js está sendo mexido em outra frente — as mesmas funções
// estão prontas para colar lá (ver INTEGRACAO-TREINOS.md). Se/quando forem para o api.js, basta
// trocar o import das páginas por `import { api } from '../api.js'`.

async function req(url, opts) {
  const r = await fetch(url, { headers: { 'Content-Type': 'application/json', ...(opts && opts.headers) }, ...opts })
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
    e.dados = dados
    throw e
  }
  return dados
}

const p = (id) => encodeURIComponent(id)

export const apiTreinos = {
  listar: () => req('/api/treinos'),
  obter: (id) => req(`/api/treinos/${p(id)}`),
  iniciar: (id) => req(`/api/treinos/${p(id)}/iniciar`, { method: 'POST', body: '{}' }),
  reabrirTreino: (id) => req(`/api/treinos/${p(id)}/reabrir`, { method: 'POST', body: '{}' }),
  abrirEtapa: (id, etapaId) => req(`/api/treinos/${p(id)}/etapa/${p(etapaId)}/abrir`, { method: 'POST', body: '{}' }),
  rascunho: (id, etapaId, texto) => req(`/api/treinos/${p(id)}/etapa/${p(etapaId)}/rascunho`, { method: 'PUT', body: JSON.stringify({ texto }) }),
  dica: (id, etapaId, n) => req(`/api/treinos/${p(id)}/etapa/${p(etapaId)}/dica`, { method: 'POST', body: JSON.stringify({ n }) }),
  revelar: (id, etapaId) => req(`/api/treinos/${p(id)}/etapa/${p(etapaId)}/revelar`, { method: 'POST', body: '{}' }),
  responder: (id, etapaId, corpo) => req(`/api/treinos/${p(id)}/etapa/${p(etapaId)}/responder`, { method: 'POST', body: JSON.stringify(corpo) }),
  reabrirEtapa: (id, etapaId) => req(`/api/treinos/${p(id)}/etapa/${p(etapaId)}/reabrir`, { method: 'POST', body: '{}' }),
}

export default apiTreinos
