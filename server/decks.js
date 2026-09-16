// Leitura dos decks e trilhas em content/. Recarrega se o mtime de qualquer arquivo mudar.
import fs from 'node:fs'
import path from 'node:path'

const cache = {
  decks: [],
  trilhas: null,
  assinatura: '',
  erros: [],
}

function assinaturaDir(dirDecks, arqTrilhas) {
  const partes = []
  try {
    for (const nome of fs.readdirSync(dirDecks)) {
      if (!nome.endsWith('.json')) continue
      const st = fs.statSync(path.join(dirDecks, nome))
      partes.push(`${nome}:${st.mtimeMs}:${st.size}`)
    }
  } catch {
    /* pasta pode não existir ainda */
  }
  try {
    const st = fs.statSync(arqTrilhas)
    partes.push(`trilhas:${st.mtimeMs}:${st.size}`)
  } catch {
    partes.push('trilhas:none')
  }
  return partes.sort().join('|')
}

function validarDeck(d, arquivo) {
  const problemas = []
  if (!d || typeof d !== 'object') return ['não é um objeto']
  if (!d.id) problemas.push('sem id')
  if (!d.titulo) problemas.push('sem titulo')
  if (!Array.isArray(d.termos)) problemas.push('termos não é array')
  else {
    const ids = new Set()
    d.termos.forEach((t, i) => {
      if (!t.id) problemas.push(`termo[${i}] sem id`)
      else if (ids.has(t.id)) problemas.push(`termo id duplicado: ${t.id}`)
      ids.add(t.id)
      if (!t.termo) problemas.push(`termo[${i}] sem "termo"`)
      if (!t.definicao) problemas.push(`termo[${i}] (${t.id}) sem definicao`)
    })
  }
  return problemas.map((p) => `${arquivo}: ${p}`)
}

function normalizarDeck(d, arquivo) {
  return {
    id: String(d.id),
    titulo: d.titulo,
    fase: Number.isFinite(Number(d.fase)) ? Number(d.fase) : 99,
    trilha: d.trilha || '',
    ordem: Number.isFinite(Number(d.ordem)) ? Number(d.ordem) : 999,
    descricao: d.descricao || '',
    exemplo: Boolean(d.exemplo),
    arquivo,
    termos: (d.termos || []).map((t) => ({
      id: String(t.id),
      termo: t.termo,
      termoEN: t.termoEN || '',
      definicao: t.definicao || '',
      profundidade: t.profundidade || '',
      exemplo: t.exemplo || '',
      perguntaEntrevista: t.perguntaEntrevista || '',
      perguntaEntrevistaEN: t.perguntaEntrevistaEN || '',
      relacionados: Array.isArray(t.relacionados) ? t.relacionados : [],
      tags: Array.isArray(t.tags) ? t.tags : [],
      nivelAlvo: Number.isFinite(Number(t.nivelAlvo)) ? Number(t.nivelAlvo) : 3,
    })),
  }
}

export function criarRepositorio(raizConteudo) {
  const dirDecks = path.join(raizConteudo, 'decks')
  const arqTrilhas = path.join(raizConteudo, 'trilhas.json')

  function recarregarSePreciso() {
    const ass = assinaturaDir(dirDecks, arqTrilhas)
    if (ass === cache.assinatura) return false
    const decks = []
    const erros = []
    const idsVistos = new Set()
    let nomes = []
    try {
      nomes = fs.readdirSync(dirDecks).filter((n) => n.endsWith('.json')).sort()
    } catch {
      nomes = []
    }
    for (const nome of nomes) {
      const arq = path.join(dirDecks, nome)
      try {
        const bruto = JSON.parse(fs.readFileSync(arq, 'utf8'))
        const probs = validarDeck(bruto, nome)
        if (probs.length) {
          erros.push(...probs)
          if (!bruto.id || !Array.isArray(bruto.termos)) continue
        }
        if (idsVistos.has(String(bruto.id))) {
          erros.push(`${nome}: id de deck duplicado (${bruto.id}) - ignorado`)
          continue
        }
        idsVistos.add(String(bruto.id))
        decks.push(normalizarDeck(bruto, nome))
      } catch (e) {
        erros.push(`${nome}: JSON inválido - ${e.message}`)
      }
    }
    decks.sort((a, b) => a.fase - b.fase || a.ordem - b.ordem || a.titulo.localeCompare(b.titulo))

    let trilhas = null
    try {
      const t = JSON.parse(fs.readFileSync(arqTrilhas, 'utf8'))
      if (t && Array.isArray(t.fases)) trilhas = t
      else erros.push('trilhas.json: esperado { fases: [...] }')
    } catch (e) {
      if (e.code !== 'ENOENT') erros.push(`trilhas.json: ${e.message}`)
    }

    cache.decks = decks
    cache.trilhas = trilhas
    cache.erros = erros
    cache.assinatura = ass
    return true
  }

  /** trilhas: do arquivo se existir, senão agrupadas por `fase` dos decks */
  function trilhas() {
    recarregarSePreciso()
    const decks = cache.decks
    if (cache.trilhas) {
      const usados = new Set()
      const fases = cache.trilhas.fases.map((f) => {
        const ids = (f.decks || []).filter((id) => decks.some((d) => d.id === id))
        ids.forEach((id) => usados.add(id))
        return { numero: f.numero, titulo: f.titulo || `Fase ${f.numero}`, descricao: f.descricao || '', decks: ids }
      })
      // decks que existem mas não estão em nenhuma fase declarada
      const soltos = decks.filter((d) => !usados.has(d.id))
      if (soltos.length) {
        const porFase = new Map()
        for (const d of soltos) {
          if (!porFase.has(d.fase)) porFase.set(d.fase, [])
          porFase.get(d.fase).push(d.id)
        }
        for (const [num, ids] of porFase) {
          const existente = fases.find((f) => Number(f.numero) === num)
          if (existente) existente.decks.push(...ids)
          else fases.push({ numero: num, titulo: `Fase ${num}`, descricao: '', decks: ids })
        }
      }
      fases.sort((a, b) => Number(a.numero) - Number(b.numero))
      return { fases, origem: 'trilhas.json' }
    }
    const porFase = new Map()
    for (const d of decks) {
      if (!porFase.has(d.fase)) porFase.set(d.fase, { numero: d.fase, titulo: d.trilha ? `${d.trilha}` : `Fase ${d.fase}`, descricao: '', decks: [] })
      porFase.get(d.fase).decks.push(d.id)
    }
    const fases = [...porFase.values()].sort((a, b) => a.numero - b.numero)
    // se a mesma fase junta trilhas diferentes, o título vira "Fase N"
    for (const f of fases) {
      const trilhasDaFase = new Set(decks.filter((d) => f.decks.includes(d.id)).map((d) => d.trilha))
      if (trilhasDaFase.size > 1) f.titulo = `Fase ${f.numero}`
      if (f.numero === 0) f.titulo = f.titulo || 'Exemplo'
    }
    return { fases, origem: 'auto' }
  }

  return {
    recarregarSePreciso,
    listar() {
      recarregarSePreciso()
      return cache.decks
    },
    obter(id) {
      recarregarSePreciso()
      return cache.decks.find((d) => d.id === id) || null
    },
    trilhas,
    erros() {
      recarregarSePreciso()
      return cache.erros
    },
  }
}
