// Exercícios práticos (content/praticas/*.json): leitura com recarga por mtime, validação e correção.
// Esquema documentado em content/praticas/README.md.
import fs from 'node:fs'
import path from 'node:path'

export const TIPOS = ['saida', 'numero', 'escolha', 'texto', 'checklist']
export const AMBIENTES = ['node', 'bash', 'postgres', 'redis', 'docker', 'nginx', 'browser', 'papel', 'celular', 'git', 'http']
export const TIPOS_AUTO = new Set(['saida', 'numero', 'escolha'])

const cache = { lista: [], assinatura: '', erros: [] }

function assinaturaDir(dir) {
  const partes = []
  try {
    for (const nome of fs.readdirSync(dir)) {
      if (!nome.endsWith('.json')) continue
      const st = fs.statSync(path.join(dir, nome))
      partes.push(`${nome}:${st.mtimeMs}:${st.size}`)
    }
  } catch {
    /* pasta pode não existir */
  }
  return partes.sort().join('|')
}

function str(v, max = 20000) {
  return typeof v === 'string' ? v.slice(0, max) : ''
}
function listaStr(v, max) {
  return Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).slice(0, max) : []
}

/** normaliza saída de comando para comparar: CRLF→LF, trim por linha, colapsa espaços, ignora case */
export function normalizarSaida(s, forte = true) {
  let t = String(s || '').replace(/\r\n?/g, '\n')
  t = t
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l, i, arr) => !(l === '' && (i === 0 || i === arr.length - 1 || arr[i - 1] === '')))
    .join('\n')
    .trim()
  return forte ? t.toLowerCase() : t
}

/** normaliza o objeto `entrega` (esquema de content/praticas/README.md). Exportada: os cursos reusam. */
export function normalizarEntrega(e, ex, arquivo, problemas) {
  const tipo = TIPOS.includes(e && e.tipo) ? e.tipo : null
  if (!tipo) {
    problemas.push(`${arquivo}: exercicio ${ex.id}: entrega.tipo inválido (${e && e.tipo})`)
    return { tipo: 'texto', rotulo: 'Sua resposta', minimoChars: 80 }
  }
  const out = { tipo, rotulo: str(e.rotulo, 200) }
  if (tipo === 'saida') {
    out.normalizar = e.normalizar !== false
    const alvos = []
    if (typeof e.esperado === 'string') alvos.push(e.esperado)
    if (Array.isArray(e.esperadoQualquer)) alvos.push(...e.esperadoQualquer.filter((x) => typeof x === 'string'))
    if (!alvos.length) problemas.push(`${arquivo}: exercicio ${ex.id}: entrega saida sem "esperado"`)
    out.esperados = alvos
    out.rotulo ||= 'Cole a saída'
  } else if (tipo === 'numero') {
    const n = Number(e.esperado)
    if (!Number.isFinite(n) && !(Number.isFinite(Number(e.min)) && Number.isFinite(Number(e.max)))) problemas.push(`${arquivo}: exercicio ${ex.id}: entrega numero sem "esperado" nem min/max`)
    out.esperado = Number.isFinite(n) ? n : null
    out.tolerancia = Number.isFinite(Number(e.tolerancia)) ? Math.max(0, Number(e.tolerancia)) : 0
    out.min = Number.isFinite(Number(e.min)) ? Number(e.min) : null
    out.max = Number.isFinite(Number(e.max)) ? Number(e.max) : null
    out.unidade = str(e.unidade, 20)
    out.rotulo ||= 'Digite o número'
  } else if (tipo === 'escolha') {
    out.opcoes = listaStr(e.opcoes, 8)
    let corretas = Array.isArray(e.corretas) ? e.corretas : Number.isInteger(e.correta) ? [e.correta] : []
    corretas = [...new Set(corretas.map(Number).filter((i) => Number.isInteger(i) && i >= 0 && i < out.opcoes.length))].sort((a, b) => a - b)
    if (out.opcoes.length < 2) problemas.push(`${arquivo}: exercicio ${ex.id}: entrega escolha precisa de >= 2 opcoes`)
    if (!corretas.length) problemas.push(`${arquivo}: exercicio ${ex.id}: entrega escolha sem "correta"/"corretas" válidas`)
    out.corretas = corretas
    out.multipla = corretas.length > 1 || Array.isArray(e.corretas)
    out.rotulo ||= out.multipla ? 'Marque todas as corretas' : 'Escolha uma'
  } else if (tipo === 'checklist') {
    out.itens = listaStr(e.itens, 10)
    if (out.itens.length < 2) problemas.push(`${arquivo}: exercicio ${ex.id}: checklist precisa de >= 2 itens`)
    out.rotulo ||= 'Marque o que você conseguiu fazer'
  } else {
    out.minimoChars = Number.isFinite(Number(e.minimoChars)) ? Number(e.minimoChars) : 80
    out.rotulo ||= 'Cole a resposta / o código / o que observou'
  }
  return out
}

/**
 * Normaliza um exercício (esquema de content/praticas/README.md) resolvendo os `termos` contra os decks.
 * Exportada porque as atividades embutidas nos cursos (content/cursos/*.md) usam exatamente o mesmo esquema.
 * @param deck deck padrão para termos escritos sem "deckId/" (pode ser null)
 */
export function normalizarExercicio(ex, arquivo, deck, repo, problemas) {
  const id = String(ex.id || '')
  const termos = []
  for (const t of listaStr(ex.termos, 6)) {
    const [deckId, termoId] = t.includes('/') ? t.split('/') : [deck ? deck.id : null, t]
    const d = deckId ? repo.obter(deckId) : null
    const termo = d ? d.termos.find((x) => x.id === termoId) : null
    if (!termo) {
      problemas.push(`${arquivo}: exercicio ${id}: termo "${t}" não existe`)
      continue
    }
    termos.push({ deckId: d.id, termoId, termo: termo.termo })
  }
  if (!termos.length) problemas.push(`${arquivo}: exercicio ${id}: sem termo válido em "termos"`)
  const nivel = Number(ex.nivel)
  const ambiente = AMBIENTES.includes(ex.ambiente) ? ex.ambiente : 'papel'
  if (!AMBIENTES.includes(ex.ambiente)) problemas.push(`${arquivo}: exercicio ${id}: ambiente "${ex.ambiente}" desconhecido (usando papel)`)
  if (!ex.enunciado) problemas.push(`${arquivo}: exercicio ${id}: sem enunciado`)
  if (!ex.solucao) problemas.push(`${arquivo}: exercicio ${id}: sem solucao`)
  const entrega = normalizarEntrega(ex.entrega, { id }, arquivo, problemas)
  if (entrega.tipo === 'texto' && !listaStr(ex.criterios, 8).length) problemas.push(`${arquivo}: exercicio ${id}: entrega texto sem "criterios"`)
  return {
    id,
    titulo: str(ex.titulo, 200) || id,
    termos,
    nivel: Number.isFinite(nivel) ? Math.max(1, Math.min(5, Math.round(nivel))) : 3,
    tempoMin: Number.isFinite(Number(ex.tempoMin)) ? Number(ex.tempoMin) : 20,
    ambiente,
    enunciado: str(ex.enunciado),
    passos: listaStr(ex.passos, 12),
    entrega,
    dicas: listaStr(ex.dicas, 3),
    solucao: str(ex.solucao),
    criterios: listaStr(ex.criterios, 8),
    postmortem: Boolean(ex.postmortem),
    auto: TIPOS_AUTO.has(entrega.tipo),
  }
}

export function criarPraticas(raizConteudo, repo) {
  const dir = path.join(raizConteudo, 'praticas')

  function recarregarSePreciso() {
    const ass = assinaturaDir(dir) + '#' + repo.listar().map((d) => `${d.id}:${d.termos.length}`).join(',')
    if (ass === cache.assinatura) return false
    const lista = []
    const erros = []
    const decksVistos = new Set()
    let nomes = []
    try {
      nomes = fs.readdirSync(dir).filter((n) => n.endsWith('.json')).sort()
    } catch {
      nomes = []
    }
    for (const nome of nomes) {
      let bruto
      try {
        bruto = JSON.parse(fs.readFileSync(path.join(dir, nome), 'utf8'))
      } catch (e) {
        erros.push(`praticas/${nome}: JSON inválido - ${e.message}`)
        continue
      }
      if (!bruto || typeof bruto !== 'object' || !bruto.deckId || !Array.isArray(bruto.exercicios)) {
        erros.push(`praticas/${nome}: esperado { deckId, exercicios: [...] }`)
        continue
      }
      const deckId = String(bruto.deckId)
      const deck = repo.obter(deckId)
      if (!deck) {
        erros.push(`praticas/${nome}: deck "${deckId}" não existe - arquivo ignorado`)
        continue
      }
      if (decksVistos.has(deckId)) {
        erros.push(`praticas/${nome}: já existe arquivo de práticas para o deck ${deckId} - ignorado`)
        continue
      }
      decksVistos.add(deckId)
      const ids = new Set()
      const exercicios = []
      bruto.exercicios.forEach((ex, i) => {
        if (!ex || !ex.id) return erros.push(`praticas/${nome}: exercicio[${i}] sem id`)
        if (ids.has(String(ex.id))) return erros.push(`praticas/${nome}: exercicio id duplicado ${ex.id}`)
        ids.add(String(ex.id))
        exercicios.push(normalizarExercicio(ex, `praticas/${nome}`, deck, repo, erros))
      })
      lista.push({
        deckId,
        deckTitulo: deck.titulo,
        fase: deck.fase,
        ordem: deck.ordem,
        titulo: str(bruto.titulo, 200) || `Práticas · ${deck.titulo}`,
        arquivo: nome,
        exercicios,
      })
    }
    lista.sort((a, b) => a.fase - b.fase || a.ordem - b.ordem)
    cache.lista = lista
    cache.erros = erros
    cache.assinatura = ass
    return true
  }

  /** versão pública de um exercício: sem gabarito (solucao, esperados, corretas) */
  const publico = exercicioPublico

  function obter(deckId) {
    recarregarSePreciso()
    return cache.lista.find((p) => p.deckId === deckId) || null
  }

  return {
    listar() {
      recarregarSePreciso()
      return cache.lista
    },
    obter,
    exercicio(deckId, exId) {
      const p = obter(deckId)
      return p ? p.exercicios.find((e) => e.id === exId) || null : null
    },
    publico,
    erros() {
      recarregarSePreciso()
      return cache.erros
    },
  }
}

/** versão pública de um exercício/atividade: sem gabarito (solucao, esperados, corretas) */
export function exercicioPublico(ex) {
  const { solucao, entrega, ...resto } = ex
  const e = { ...entrega }
  delete e.esperados
  delete e.esperado
  delete e.min
  delete e.max
  delete e.tolerancia
  delete e.corretas
  return { ...resto, entrega: e, temSolucao: Boolean(solucao) }
}

/**
 * Corrige uma resposta de tipo automático.
 * @returns {{ correto: boolean, detalhe?: string }}
 */
export function corrigir(ex, resposta) {
  const e = ex.entrega
  if (e.tipo === 'saida') {
    const r = normalizarSaida(resposta, e.normalizar)
    if (!r) return { correto: false, detalhe: 'resposta vazia' }
    const ok = e.esperados.some((alvo) => normalizarSaida(alvo, e.normalizar) === r)
    return { correto: ok }
  }
  if (e.tipo === 'numero') {
    const n = Number(String(resposta ?? '').trim().replace(',', '.').replace(/[^\d.eE+-]/g, ''))
    if (!Number.isFinite(n)) return { correto: false, detalhe: 'não entendi como número' }
    if (e.min != null && e.max != null) return { correto: n >= e.min && n <= e.max }
    if (e.esperado == null) return { correto: false }
    const tol = Math.abs(e.esperado) * e.tolerancia
    return { correto: Math.abs(n - e.esperado) <= tol + 1e-9 }
  }
  if (e.tipo === 'escolha') {
    const marc = Array.isArray(resposta) ? resposta : [resposta]
    const set = [...new Set(marc.map(Number).filter(Number.isInteger))].sort((a, b) => a - b)
    return { correto: set.length === e.corretas.length && set.every((v, i) => v === e.corretas[i]) }
  }
  return { correto: false, detalhe: 'tipo não é automático' }
}

/** nota automática pelas regras do README */
export function notaAutomatica({ tentativasErradas = 0, dicasUsadas = 0, revelou = false }) {
  if (revelou) return 1
  if (tentativasErradas === 0 && dicasUsadas === 0) return 4
  if (tentativasErradas <= 2) return 3
  return 2
}

export function notaChecklist(marcados, total) {
  if (!total) return 0
  return Math.max(0, Math.min(5, Math.round((marcados / total) * 5)))
}
