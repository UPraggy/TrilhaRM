// Cursos (content/cursos/*.md, e *.json no formato legado): leitura com recarga por mtime,
// validação acumulada em erros() e normalização das atividades embutidas.
//
// As atividades usam EXATAMENTE o esquema de content/praticas: quem normaliza, corrige e pontua é
// server/praticas.js; quem grava é server/progresso.js (funções de prática). Nada é duplicado aqui.
// Formato em content/cursos/README.md.
import fs from 'node:fs'
import path from 'node:path'
import { exercicioPublico, normalizarExercicio } from './praticas.js'
import { kebab, mdParaBlocos, parseCurso, percorrerInline } from './markdown.js'

const cache = { lista: [], assinatura: '', erros: [] }

const EXTENSOES = ['.md', '.markdown', '.json']

function assinaturaDir(dir) {
  const partes = []
  try {
    for (const nome of fs.readdirSync(dir)) {
      if (!EXTENSOES.some((e) => nome.toLowerCase().endsWith(e))) continue
      const st = fs.statSync(path.join(dir, nome))
      partes.push(`${nome}:${st.mtimeMs}:${st.size}`)
    }
  } catch {
    /* pasta pode não existir ainda */
  }
  return partes.sort().join('|')
}

/** chave de progresso de uma atividade de curso (namespace próprio: decks nunca têm ":") */
export function chaveAtividade(cursoId, atividadeId) {
  return `curso:${cursoId}/${atividadeId}`
}

/** curso legado em JSON: { id, titulo, descricao, licoes: [{ id, titulo, markdown }] } */
function cursoDeJson(bruto, nome) {
  const erros = []
  if (!bruto || typeof bruto !== 'object') {
    return { curso: null, erros: [`cursos/${nome}: esperado um objeto JSON`] }
  }
  if (!bruto.id) erros.push(`cursos/${nome}: sem "id"`)
  if (!bruto.titulo) erros.push(`cursos/${nome}: sem "titulo"`)
  const licoesBrutas = Array.isArray(bruto.licoes) ? bruto.licoes : []
  if (!licoesBrutas.length) erros.push(`cursos/${nome}: sem "licoes"`)
  const licoes = licoesBrutas.map((l, i) => ({
    id: String(l.id || `licao-${i + 1}`),
    titulo: String(l.titulo || `Lição ${i + 1}`),
    modulo: 'licoes',
    blocos: mdParaBlocos(String(l.markdown || '')),
  }))
  return {
    curso: {
      id: String(bruto.id || kebab(nome.replace(/\.json$/i, ''))),
      titulo: String(bruto.titulo || nome),
      descricao: String(bruto.descricao || ''),
      fase: Number.isFinite(Number(bruto.fase)) ? Number(bruto.fase) : 99,
      ordem: Number.isFinite(Number(bruto.ordem)) ? Number(bruto.ordem) : 999,
      deck: bruto.deck ? String(bruto.deck) : '',
      tags: Array.isArray(bruto.tags) ? bruto.tags.map(String) : [],
      nivel: null,
      intro: [],
      modulos: [{ id: 'licoes', titulo: 'Lições', descricao: '', intro: [], licoes }],
      erros,
      legado: true,
    },
    erros,
  }
}

/**
 * Resolve os wikilinks [[deckId/termoId]] dos blocos contra os decks: preenche deckId/termo/existe.
 * Wikilink quebrado vira aviso em erros().
 */
function resolverWikilinks(blocos, { repo, deckPadrao, onde, erros }) {
  percorrerInline(blocos, (no) => {
    if (!no || no.t !== 'wiki') return
    let deckId = no.deckId || ''
    let termo = null
    if (deckId) {
      const d = repo.obter(deckId)
      termo = d ? d.termos.find((t) => t.id === no.termoId) : null
    } else {
      for (const d of [deckPadrao, ...repo.listar().filter((x) => x !== deckPadrao)]) {
        if (!d) continue
        const t = d.termos.find((x) => x.id === no.termoId)
        if (t) {
          deckId = d.id
          termo = t
          break
        }
      }
    }
    if (!termo) {
      no.existe = false
      erros.push(`${onde}: wikilink [[${no.alvo}]] não existe em nenhum deck`)
      return
    }
    no.existe = true
    no.deckId = deckId
    no.termo = termo.termo
    if (!no.v || no.v === no.termoId) no.v = termo.termo
  })
}

/** troca os blocos { tipo:'atividade', bruto } por atividades normalizadas e devolve a lista */
function normalizarAtividades(blocos, { repo, deckPadrao, curso, licao, onde, erros, idsVistos }) {
  const encontradas = []
  const visitar = (lista) => {
    for (const b of lista || []) {
      if (!b || typeof b !== 'object') continue
      if (Array.isArray(b.blocos)) visitar(b.blocos)
      if (b.tipo !== 'atividade') continue
      const bruto = b.bruto || {}
      let id = String(bruto.id || kebab(bruto.titulo || '') || '')
      if (!id) {
        id = `${licao.id}-atividade-${encontradas.length + 1}`
        erros.push(`${onde}: atividade sem "id" (usando "${id}")`)
      }
      if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) erros.push(`${onde}: atividade com id "${id}" inválido — use kebab-case`)
      if (idsVistos.has(id)) {
        erros.push(`${onde}: atividade com id duplicado "${id}" no curso`)
        id = `${id}-${idsVistos.size}`
      }
      idsVistos.add(id)
      if (!bruto.solucao) erros.push(`${onde}: atividade "${id}" sem gabarito (solução) — escreva-a depois do segundo "---"`)
      const entradaBruta = { ...bruto, id }
      // YAML devolve número quando o autor escreve `esperado: 200`; saida compara strings
      if (entradaBruta.entrega && entradaBruta.entrega.tipo === 'saida' && typeof entradaBruta.entrega.esperado === 'number') {
        entradaBruta.entrega = { ...entradaBruta.entrega, esperado: String(entradaBruta.entrega.esperado) }
      }
      const ex = normalizarExercicio(entradaBruta, onde, deckPadrao, repo, erros)
      const atividade = {
        ...ex,
        cursoId: curso.id,
        licaoId: licao.id,
        moduloId: licao.modulo,
        chave: chaveAtividade(curso.id, ex.id),
        enunciadoBlocos: mdParaBlocos(ex.enunciado),
        solucaoBlocos: mdParaBlocos(ex.solucao),
      }
      resolverWikilinks(atividade.enunciadoBlocos, { repo, deckPadrao, onde, erros })
      resolverWikilinks(atividade.solucaoBlocos, { repo, deckPadrao, onde, erros })
      b.atividadeId = atividade.id
      delete b.bruto
      delete b.fonte
      encontradas.push(atividade)
    }
  }
  visitar(blocos)
  return encontradas
}

export function criarCursos(raizConteudo, repo) {
  const dir = path.join(raizConteudo, 'cursos')

  function recarregarSePreciso() {
    const ass = assinaturaDir(dir) + '#' + repo.listar().map((d) => `${d.id}:${d.termos.length}`).join(',')
    if (ass === cache.assinatura) return false
    const lista = []
    const erros = []
    const idsVistos = new Set()
    const titulosVistos = new Set()
    let nomes = []
    try {
      nomes = fs
        .readdirSync(dir)
        .filter((n) => EXTENSOES.some((e) => n.toLowerCase().endsWith(e)) && n.toLowerCase() !== 'readme.md' && !n.startsWith('_') && !/^como-pedir/i.test(n))
        .sort()
    } catch {
      nomes = []
    }

    for (const nome of nomes) {
      const onde = `cursos/${nome}`
      let texto
      try {
        texto = fs.readFileSync(path.join(dir, nome), 'utf8')
      } catch (e) {
        erros.push(`${onde}: não consegui ler - ${e.message}`)
        continue
      }
      let curso = null
      if (nome.toLowerCase().endsWith('.json')) {
        let bruto = null
        try {
          bruto = JSON.parse(texto)
        } catch (e) {
          erros.push(`${onde}: JSON inválido - ${e.message}`)
          continue
        }
        const r = cursoDeJson(bruto, nome)
        curso = r.curso
        if (!curso) {
          erros.push(...r.erros)
          continue
        }
      } else {
        try {
          curso = parseCurso(texto, onde)
        } catch (e) {
          erros.push(`${onde}: falhou ao interpretar o Markdown - ${e.message}`)
          continue
        }
      }
      erros.push(...(curso.erros || []))
      delete curso.erros

      if (idsVistos.has(curso.id)) {
        erros.push(`${onde}: id de curso duplicado (${curso.id}) - ignorado`)
        continue
      }
      idsVistos.add(curso.id)
      const chaveTitulo = String(curso.titulo || '').trim().toLowerCase()
      if (chaveTitulo && titulosVistos.has(chaveTitulo)) erros.push(`${onde}: já existe outro curso com o título "${curso.titulo}"`)
      titulosVistos.add(chaveTitulo)

      const deckPadrao = curso.deck ? repo.obter(curso.deck) : null
      if (curso.deck && !deckPadrao) erros.push(`${onde}: deck "${curso.deck}" do frontmatter não existe`)

      const atividades = []
      const idsAtividade = new Set()
      resolverWikilinks(curso.intro, { repo, deckPadrao, onde, erros })
      for (const mod of curso.modulos) {
        resolverWikilinks(mod.intro, { repo, deckPadrao, onde: `${onde} (${mod.id})`, erros })
        for (const lic of mod.licoes) {
          const ondeLic = `${onde}:${lic.linha || '?'} (${mod.id}/${lic.id})`
          resolverWikilinks(lic.blocos, { repo, deckPadrao, onde: ondeLic, erros })
          const achadas = normalizarAtividades(lic.blocos, {
            repo,
            deckPadrao,
            curso,
            licao: lic,
            onde: ondeLic,
            erros,
            idsVistos: idsAtividade,
          })
          lic.atividades = achadas.map((a) => a.id)
          atividades.push(...achadas)
        }
      }

      const totalLicoes = curso.modulos.reduce((a, m) => a + m.licoes.length, 0)
      lista.push({ ...curso, arquivo: nome, atividades, totalLicoes, totalAtividades: atividades.length })
    }

    lista.sort((a, b) => a.fase - b.fase || a.ordem - b.ordem || String(a.titulo).localeCompare(String(b.titulo)))
    cache.lista = lista
    cache.erros = erros
    cache.assinatura = ass
    return true
  }

  function obter(id) {
    recarregarSePreciso()
    return cache.lista.find((c) => c.id === id) || null
  }

  return {
    recarregarSePreciso,
    listar() {
      recarregarSePreciso()
      return cache.lista
    },
    obter,
    licao(cursoId, licaoId) {
      const c = obter(cursoId)
      if (!c) return null
      for (const m of c.modulos) {
        const l = m.licoes.find((x) => x.id === licaoId)
        if (l) return { curso: c, modulo: m, licao: l }
      }
      return null
    },
    atividade(cursoId, atividadeId) {
      const c = obter(cursoId)
      return c ? c.atividades.find((a) => a.id === atividadeId) || null : null
    },
    /** atividade sem gabarito (mesma regra das práticas) */
    publico(atividade) {
      const { solucaoBlocos, ...resto } = exercicioPublico(atividade)
      return resto
    },
    erros() {
      recarregarSePreciso()
      return cache.erros
    },
  }
}
