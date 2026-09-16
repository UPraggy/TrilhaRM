// Parser de Markdown próprio do Trilha RM — sem nenhuma dependência nova.
//
// Três camadas:
//   1. parseFrontmatter(texto) → { meta, corpo }        frontmatter YAML simples entre --- ... ---
//   2. mdParaBlocos(md)        → [{ tipo, ... }]        blocos serializáveis (o front renderiza sem lib)
//   3. parseCurso(texto, arq)  → { id, titulo, modulos: [{ licoes: [{ blocos }] }], erros }
//
// Formato de curso e blocos documentados em content/cursos/README.md.
// Este arquivo NÃO conhece decks nem progresso: quem resolve wikilinks e normaliza as atividades
// (reaproveitando server/praticas.js) é server/cursos.js.

// ---------------------------------------------------------------------------
// YAML — subconjunto: chave: valor, mapas aninhados por indentação, listas "- item"
// e "[a, b]", blocos literais "|" / ">", aspas opcionais, números e booleanos.
// ---------------------------------------------------------------------------

const RE_CHAVE = /^([A-Za-z0-9_.-]+)\s*:\s*(.*)$/

function indentacaoDe(linha) {
  return linha.length - linha.replace(/^\s+/, '').length
}

function linhaIgnoravel(linha) {
  const t = linha.trim()
  return !t || t.startsWith('#')
}

function proximaUtil(linhas, i) {
  while (i < linhas.length && linhaIgnoravel(linhas[i])) i += 1
  return i
}

/** "true" → true · "12" → 12 · "[a, b]" → ['a','b'] · '"x"' → 'x' */
export function parseEscalar(bruto) {
  const s = String(bruto ?? '').trim()
  if (!s) return ''
  if (s.length > 1 && ((s[0] === '"' && s[s.length - 1] === '"') || (s[0] === "'" && s[s.length - 1] === "'"))) {
    return s.slice(1, -1).replace(/\\n/g, '\n').replace(/\\t/g, '\t')
  }
  if (s === 'true' || s === 'yes') return true
  if (s === 'false' || s === 'no') return false
  if (s === 'null' || s === '~') return null
  if (s.startsWith('[') && s.endsWith(']')) {
    const dentro = s.slice(1, -1).trim()
    if (!dentro) return []
    return dividirFluxo(dentro).map((x) => parseEscalar(x)).filter((x) => x !== '')
  }
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s)
  return s
}

/** divide "a, \"b, c\", d" respeitando aspas */
function dividirFluxo(s) {
  const out = []
  let atual = ''
  let aspas = null
  for (const ch of s) {
    if (aspas) {
      if (ch === aspas) aspas = null
      atual += ch
    } else if (ch === '"' || ch === "'") {
      aspas = ch
      atual += ch
    } else if (ch === ',') {
      out.push(atual)
      atual = ''
    } else atual += ch
  }
  out.push(atual)
  return out.map((x) => x.trim()).filter(Boolean)
}

function lerLiteral(linhas, ctx, ind, marcador) {
  const out = []
  let indBloco = null
  while (ctx.i < linhas.length) {
    const l = linhas[ctx.i]
    if (!l.trim()) {
      out.push('')
      ctx.i += 1
      continue
    }
    const cur = indentacaoDe(l)
    if (cur <= ind) break
    if (indBloco === null) indBloco = cur
    out.push(l.slice(Math.min(indBloco, cur)))
    ctx.i += 1
  }
  while (out.length && !out[out.length - 1].trim()) out.pop()
  let s = out.join('\n')
  if (marcador.startsWith('>')) s = s.replace(/([^\n])\n(?!\n)/g, '$1 ')
  if (marcador.endsWith('-')) s = s.replace(/\n+$/, '')
  return s
}

function parseFilho(linhas, ctx, ind) {
  const i = proximaUtil(linhas, ctx.i)
  if (i >= linhas.length) {
    ctx.i = i
    return null
  }
  const cur = indentacaoDe(linhas[i])
  const conteudo = linhas[i].slice(cur)
  const ehLista = /^-(\s|$)/.test(conteudo)
  if (cur > ind || (ehLista && cur === ind)) {
    ctx.i = i
    return ehLista ? parseLista(linhas, ctx, cur) : parseMapa(linhas, ctx, cur)
  }
  return null
}

function parseLista(linhas, ctx, ind) {
  const arr = []
  for (;;) {
    const i = proximaUtil(linhas, ctx.i)
    if (i >= linhas.length) {
      ctx.i = i
      break
    }
    const cur = indentacaoDe(linhas[i])
    const conteudo = linhas[i].slice(cur)
    if (cur !== ind || !/^-(\s|$)/.test(conteudo)) {
      ctx.i = i
      break
    }
    const resto = conteudo.replace(/^-\s*/, '')
    ctx.i = i + 1
    if (resto === '') {
      const filho = parseFilho(linhas, ctx, ind)
      arr.push(filho === null ? '' : filho)
    } else if (resto === '|' || resto === '|-' || resto === '>' || resto === '>-') {
      arr.push(lerLiteral(linhas, ctx, ind, resto))
    } else if (RE_CHAVE.test(resto) && !/^https?:/i.test(resto)) {
      // item de lista que é um mapa: "- tipo: saida" + chaves indentadas abaixo
      const desloc = conteudo.indexOf(resto) + ind
      linhas[i] = ' '.repeat(desloc) + resto
      ctx.i = i
      arr.push(parseMapa(linhas, ctx, desloc))
    } else {
      arr.push(parseEscalar(resto))
    }
  }
  return arr
}

function parseMapa(linhas, ctx, ind) {
  const obj = {}
  for (;;) {
    const i = proximaUtil(linhas, ctx.i)
    if (i >= linhas.length) {
      ctx.i = i
      break
    }
    const cur = indentacaoDe(linhas[i])
    if (cur !== ind) {
      ctx.i = i
      break
    }
    const m = linhas[i].slice(ind).match(RE_CHAVE)
    if (!m) {
      ctx.i = i
      break
    }
    const [, chave, resto] = m
    ctx.i = i + 1
    if (resto === '|' || resto === '|-' || resto === '>' || resto === '>-') {
      obj[chave] = lerLiteral(linhas, ctx, ind, resto)
    } else if (resto === '') {
      const filho = parseFilho(linhas, ctx, ind)
      obj[chave] = filho === null ? '' : filho
    } else {
      obj[chave] = parseEscalar(resto)
    }
  }
  return obj
}

/** YAML simples → objeto. Nunca lança: o que não entende vira string ou é ignorado. */
export function parseYaml(texto) {
  const linhas = String(texto || '').replace(/\r\n?/g, '\n').split('\n')
  const ctx = { i: 0 }
  const i = proximaUtil(linhas, 0)
  if (i >= linhas.length) return {}
  ctx.i = i
  const ind = indentacaoDe(linhas[i])
  const conteudo = linhas[i].slice(ind)
  if (/^-(\s|$)/.test(conteudo)) return parseLista(linhas, ctx, ind)
  return parseMapa(linhas, ctx, ind)
}

/**
 * Frontmatter YAML no topo do arquivo, entre linhas "---".
 * @returns {{ meta: object, corpo: string, linhaCorpo: number }} linhaCorpo = 1ª linha do corpo (1-based)
 */
export function parseFrontmatter(texto) {
  const src = String(texto || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n')
  const linhas = src.split('\n')
  let i = 0
  while (i < linhas.length && !linhas[i].trim()) i += 1
  if (linhas[i] !== '---') return { meta: {}, corpo: src, linhaCorpo: 1 }
  const inicio = i + 1
  let fim = -1
  for (let j = inicio; j < linhas.length; j += 1) {
    if (linhas[j].trim() === '---' || linhas[j].trim() === '...') {
      fim = j
      break
    }
  }
  if (fim === -1) return { meta: {}, corpo: src, linhaCorpo: 1 }
  const meta = parseYaml(linhas.slice(inicio, fim).join('\n'))
  return {
    meta: meta && typeof meta === 'object' && !Array.isArray(meta) ? meta : {},
    corpo: linhas.slice(fim + 1).join('\n'),
    linhaCorpo: fim + 2,
  }
}

// ---------------------------------------------------------------------------
// Inline: **negrito**, *itálico*, `code`, [texto](url), [[deckId/termoId]]
// ---------------------------------------------------------------------------

const RE_INLINE =
  /(`[^`]+`)|(\[\[[^\]\n]+\]\])|(!?\[[^\]\n]*\]\([^)\s]+(?:\s+"[^"]*")?\))|(\*\*[^*\n]+\*\*)|(__[^_\n]+__)|(\*[^*\n]+\*)|(_[^_\n]+_)/g

/**
 * Texto → nós inline serializáveis:
 *   { t:'txt', v } · { t:'code', v } · { t:'b', v } · { t:'i', v }
 *   { t:'link', v, href } · { t:'wiki', v, deckId, termoId }
 */
export function parseInline(texto) {
  const src = String(texto ?? '')
  const nos = []
  let ultimo = 0
  RE_INLINE.lastIndex = 0
  let m
  while ((m = RE_INLINE.exec(src))) {
    if (m.index > ultimo) nos.push({ t: 'txt', v: src.slice(ultimo, m.index) })
    const bruto = m[0]
    if (m[1]) nos.push({ t: 'code', v: bruto.slice(1, -1) })
    else if (m[2]) nos.push(noWikilink(bruto.slice(2, -2)))
    else if (m[3]) {
      const mm = bruto.match(/^!?\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)$/)
      const href = mm ? mm[2] : '#'
      const rotulo = mm && mm[1] ? mm[1] : href
      nos.push({ t: 'link', v: rotulo, href, titulo: (mm && mm[3]) || '' })
    } else if (m[4]) nos.push({ t: 'b', v: bruto.slice(2, -2) })
    else if (m[5]) nos.push({ t: 'b', v: bruto.slice(2, -2) })
    else if (m[6]) nos.push({ t: 'i', v: bruto.slice(1, -1) })
    else if (m[7]) nos.push({ t: 'i', v: bruto.slice(1, -1) })
    ultimo = m.index + bruto.length
  }
  if (ultimo < src.length) nos.push({ t: 'txt', v: src.slice(ultimo) })
  return nos.length ? nos : [{ t: 'txt', v: '' }]
}

/** [[deckId/termoId|rótulo]] · [[termoId]] */
function noWikilink(dentro) {
  const [alvo, rotulo] = dentro.split('|').map((x) => x.trim())
  const partes = alvo.split('/')
  const termoId = (partes.length > 1 ? partes[1] : partes[0]) || ''
  const deckId = partes.length > 1 ? partes[0] : ''
  return { t: 'wiki', v: rotulo || termoId, deckId, termoId, alvo }
}

/** percorre todos os nós inline de uma árvore de blocos (para resolver wikilinks / validar) */
export function percorrerInline(blocos, fn) {
  for (const b of blocos || []) {
    if (!b || typeof b !== 'object') continue
    if (Array.isArray(b.inline)) b.inline.forEach(fn)
    if (Array.isArray(b.itens)) for (const it of b.itens) if (it && Array.isArray(it.inline)) it.inline.forEach(fn)
    if (Array.isArray(b.paragrafos)) for (const p of b.paragrafos) if (Array.isArray(p)) p.forEach(fn)
    if (Array.isArray(b.cabecalho)) for (const c of b.cabecalho) if (Array.isArray(c)) c.forEach(fn)
    if (Array.isArray(b.linhas)) for (const l of b.linhas) for (const c of l || []) if (Array.isArray(c)) c.forEach(fn)
    if (Array.isArray(b.blocos)) percorrerInline(b.blocos, fn)
  }
}

// ---------------------------------------------------------------------------
// Blocos
// ---------------------------------------------------------------------------

const CALLOUTS = new Set(['objetivo', 'nota', 'alerta', 'exemplo'])
const RE_ABRE_CONTAINER = /^:::+\s*([a-zA-Zçãé-]+)\s*(.*)$/
const RE_FECHA_CONTAINER = /^:::+\s*$/
const RE_CERCA = /^(```+|~~~+)\s*([A-Za-z0-9+#._-]*)\s*$/
const RE_TITULO = /^(#{1,6})\s+(.*)$/
const RE_ITEM = /^(\s*)([-*+])\s+(.*)$/
const RE_ITEM_NUM = /^(\s*)(\d+)[.)]\s+(.*)$/
const RE_HR = /^(\s*)(-{3,}|\*{3,}|_{3,})\s*$/

/**
 * Markdown → blocos serializáveis.
 * tipos: h2 · h3 · p · lista · codigo · tabela · citacao · callout · atividade · hr
 */
export function mdParaBlocos(md) {
  const linhas = String(md || '').replace(/\r\n?/g, '\n').split('\n')
  const blocos = []
  let i = 0
  let paragrafo = []

  const fecharParagrafo = () => {
    if (!paragrafo.length) return
    const texto = paragrafo.join('\n').trim()
    paragrafo = []
    if (texto) blocos.push({ tipo: 'p', inline: parseInline(texto) })
  }

  while (i < linhas.length) {
    const linha = linhas[i]

    // bloco de código cercado
    const cerca = linha.match(RE_CERCA)
    if (cerca) {
      fecharParagrafo()
      const marca = cerca[1][0].repeat(3)
      const lang = cerca[2] || ''
      const corpo = []
      i += 1
      while (i < linhas.length && !linhas[i].trimEnd().startsWith(marca)) {
        corpo.push(linhas[i])
        i += 1
      }
      i += 1
      blocos.push({ tipo: 'codigo', lang, codigo: corpo.join('\n').replace(/\n+$/, '') })
      continue
    }

    // container ::: (callout ou atividade)
    const abre = linha.match(RE_ABRE_CONTAINER)
    if (abre && !RE_FECHA_CONTAINER.test(linha)) {
      fecharParagrafo()
      const nome = abre[1].toLowerCase()
      const titulo = abre[2].trim()
      const corpo = []
      let nivel = 1
      i += 1
      while (i < linhas.length) {
        const l = linhas[i]
        if (RE_FECHA_CONTAINER.test(l)) {
          nivel -= 1
          if (nivel === 0) {
            i += 1
            break
          }
        } else if (RE_ABRE_CONTAINER.test(l)) nivel += 1
        corpo.push(l)
        i += 1
      }
      const dentro = corpo.join('\n')
      if (nome === 'atividade') blocos.push({ tipo: 'atividade', bruto: parseAtividadeBruta(dentro), fonte: dentro })
      else blocos.push({ tipo: 'callout', variante: CALLOUTS.has(nome) ? nome : 'nota', titulo, blocos: mdParaBlocos(dentro) })
      continue
    }

    // título
    const tit = linha.match(RE_TITULO)
    if (tit) {
      fecharParagrafo()
      const nivel = tit[1].length
      const { texto, id } = extrairId(tit[2])
      blocos.push({ tipo: nivel <= 2 ? 'h2' : 'h3', nivel, id, texto, inline: parseInline(texto) })
      i += 1
      continue
    }

    // tabela GFM
    if (linha.trim().startsWith('|') && ehSeparadorTabela(linhas[i + 1])) {
      fecharParagrafo()
      const cabecalho = celulasDe(linha)
      const alinhamento = alinhamentosDe(linhas[i + 1])
      i += 2
      const corpoLinhas = []
      while (i < linhas.length && linhas[i].trim().startsWith('|')) {
        corpoLinhas.push(celulasDe(linhas[i]).map((c) => parseInline(c)))
        i += 1
      }
      blocos.push({
        tipo: 'tabela',
        cabecalho: cabecalho.map((c) => parseInline(c)),
        alinhamento,
        linhas: corpoLinhas,
      })
      continue
    }

    // citação
    if (/^\s*>\s?/.test(linha)) {
      fecharParagrafo()
      const dentro = []
      while (i < linhas.length && /^\s*>\s?/.test(linhas[i])) {
        dentro.push(linhas[i].replace(/^\s*>\s?/, ''))
        i += 1
      }
      const paragrafos = dentro
        .join('\n')
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => parseInline(p.replace(/\n/g, ' ')))
      blocos.push({ tipo: 'citacao', paragrafos })
      continue
    }

    // linha horizontal (antes da lista: "---" casaria com nada, "***" casaria com item)
    if (RE_HR.test(linha)) {
      fecharParagrafo()
      blocos.push({ tipo: 'hr' })
      i += 1
      continue
    }

    // listas
    const item = linha.match(RE_ITEM) || linha.match(RE_ITEM_NUM)
    if (item) {
      fecharParagrafo()
      const ordenada = Boolean(linha.match(RE_ITEM_NUM)) && !linha.match(RE_ITEM)
      const itens = []
      while (i < linhas.length) {
        const l = linhas[i]
        const m = ordenada ? l.match(RE_ITEM_NUM) : l.match(RE_ITEM)
        if (m) {
          itens.push({ nivel: Math.min(3, Math.floor(m[1].length / 2)), texto: m[3] })
          i += 1
          continue
        }
        // continuação indentada do item anterior
        if (itens.length && l.trim() && /^\s{2,}/.test(l) && !l.match(RE_ITEM) && !l.match(RE_ITEM_NUM)) {
          itens[itens.length - 1].texto += ' ' + l.trim()
          i += 1
          continue
        }
        break
      }
      blocos.push({ tipo: 'lista', ordenada, itens: itens.map((it) => ({ nivel: it.nivel, inline: parseInline(it.texto) })) })
      continue
    }

    if (!linha.trim()) {
      fecharParagrafo()
      i += 1
      continue
    }

    paragrafo.push(linha)
    i += 1
  }
  fecharParagrafo()
  return blocos
}

/** "Título {#meu-id}" → { texto:'Título', id:'meu-id' } */
function extrairId(bruto) {
  const m = String(bruto || '').match(/^(.*?)\s*\{#([a-z0-9-]+)\}\s*$/i)
  if (m) return { texto: m[1].trim(), id: m[2].toLowerCase() }
  const texto = String(bruto || '').trim()
  return { texto, id: kebab(texto) }
}

function ehSeparadorTabela(linha) {
  if (typeof linha !== 'string') return false
  const t = linha.trim()
  if (!t.startsWith('|')) return false
  return /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/.test(t)
}

function celulasDe(linha) {
  let t = linha.trim()
  if (t.startsWith('|')) t = t.slice(1)
  if (t.endsWith('|')) t = t.slice(0, -1)
  return t.split('|').map((c) => c.trim())
}

function alinhamentosDe(linha) {
  return celulasDe(linha).map((c) => {
    const e = c.startsWith(':')
    const d = c.endsWith(':')
    if (e && d) return 'center'
    if (d) return 'right'
    return 'left'
  })
}

/** texto livre → kebab-case sem acento (ids de módulo/lição quando não são explícitos) */
export function kebab(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

// ---------------------------------------------------------------------------
// :::atividade — YAML (esquema de content/praticas) + --- + enunciado + --- + solução
// ---------------------------------------------------------------------------

/** parse cru: não resolve termos nem valida a entrega (quem faz isso é server/cursos.js) */
export function parseAtividadeBruta(texto) {
  const linhas = String(texto || '').replace(/\r\n?/g, '\n').split('\n')
  const cortes = []
  let emCerca = false
  for (let i = 0; i < linhas.length; i += 1) {
    if (RE_CERCA.test(linhas[i])) emCerca = !emCerca
    if (!emCerca && linhas[i].trim() === '---') cortes.push(i)
  }
  const partes = []
  let inicio = 0
  for (const c of cortes.slice(0, 2)) {
    partes.push(linhas.slice(inicio, c).join('\n'))
    inicio = c + 1
  }
  partes.push(linhas.slice(inicio).join('\n'))

  const meta = parseYaml(partes[0]) || {}
  const dados = meta && typeof meta === 'object' && !Array.isArray(meta) ? { ...meta } : {}
  if (partes.length > 1 && partes[1].trim()) dados.enunciado = partes[1].trim()
  if (partes.length > 2 && partes[2].trim()) dados.solucao = partes[2].trim()
  return dados
}

// ---------------------------------------------------------------------------
// Curso
// ---------------------------------------------------------------------------

/**
 * Markdown → curso.
 * `# Título` (ou `titulo:` no frontmatter) · `## Módulo` · `### Lição` · resto = Markdown comum.
 * @returns {{ id, titulo, descricao, fase, deck, tags, intro, modulos, erros }}
 */
export function parseCurso(texto, nomeArquivo = 'curso.md') {
  const erros = []
  const { meta, corpo, linhaCorpo } = parseFrontmatter(texto)
  const linhas = corpo.split('\n')

  // marca as linhas que estão dentro de cerca de código ou de container ::: (ali # não é título)
  const protegida = new Array(linhas.length).fill(false)
  let emCerca = false
  let profundidade = 0
  let linhaCerca = -1
  let linhaContainer = -1
  for (let i = 0; i < linhas.length; i += 1) {
    const l = linhas[i]
    if (RE_CERCA.test(l)) {
      protegida[i] = true
      emCerca = !emCerca
      if (emCerca) linhaCerca = i
      continue
    }
    if (emCerca) {
      protegida[i] = true
      continue
    }
    if (profundidade > 0) {
      protegida[i] = true
      if (RE_FECHA_CONTAINER.test(l)) profundidade -= 1
      else if (RE_ABRE_CONTAINER.test(l)) profundidade += 1
      continue
    }
    if (RE_ABRE_CONTAINER.test(l) && !RE_FECHA_CONTAINER.test(l)) {
      protegida[i] = true
      profundidade = 1
      linhaContainer = i
    }
  }
  // sem esse aviso, um ":::" que falta engole o resto do arquivo em silêncio (lições somem sem erro)
  if (profundidade > 0) {
    erros.push(`${nomeArquivo}:${linhaCorpo + linhaContainer}: container ":::" aberto e nunca fechado — feche com uma linha ":::" (o resto do arquivo virou conteúdo dele)`)
  }
  if (emCerca) {
    erros.push(`${nomeArquivo}:${linhaCorpo + linhaCerca}: bloco de código aberto e nunca fechado — feche com "\`\`\`" (o resto do arquivo virou código)`)
  }

  // varre títulos de nível 1/2/3 fora de código
  const secoes = []
  for (let i = 0; i < linhas.length; i += 1) {
    if (protegida[i]) continue
    const m = linhas[i].match(RE_TITULO)
    if (!m || m[1].length > 3) continue
    secoes.push({ nivel: m[1].length, ...extrairId(m[2]), linha: i, linhaArquivo: linhaCorpo + i })
  }

  const fatia = (de, ate) => linhas.slice(de, ate === undefined ? linhas.length : ate).join('\n').trim()

  const h1 = secoes.find((s) => s.nivel === 1)
  const titulo = String(meta.titulo || (h1 && h1.texto) || '').trim()
  if (!titulo) erros.push(`${nomeArquivo}: sem título — use "# Título do curso" ou "titulo:" no frontmatter`)

  const id = String(meta.id || (h1 && h1.id) || kebab(nomeArquivo.replace(/\.(md|markdown)$/i, '').replace(/^\d+[-_.]?/, ''))).trim()
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) erros.push(`${nomeArquivo}: id "${id}" inválido — use kebab-case (letras minúsculas, números e hífen)`)

  // intro = tudo entre o # e o primeiro ##
  const primeiroH2 = secoes.find((s) => s.nivel === 2)
  const inicioIntro = h1 ? h1.linha + 1 : 0
  const intro = mdParaBlocos(fatia(inicioIntro, primeiroH2 ? primeiroH2.linha : undefined))

  let descricao = String(meta.descricao || '').trim()
  if (!descricao) {
    const p = intro.find((b) => b.tipo === 'p')
    if (p) descricao = p.inline.map((n) => n.v).join('')
  }

  const modulos = []
  const idsModulo = new Set()
  const idsLicao = new Set()
  const titulosLicao = new Set()

  const h2s = secoes.filter((s) => s.nivel === 2)
  h2s.forEach((h2, iv) => {
    const fimModulo = iv + 1 < h2s.length ? h2s[iv + 1].linha : linhas.length
    let idMod = h2.id || kebab(h2.texto) || `modulo-${iv + 1}`
    if (idsModulo.has(idMod)) {
      erros.push(`${nomeArquivo}:${h2.linhaArquivo}: módulo com id duplicado "${idMod}" — renomeie ou use {#outro-id}`)
      idMod = `${idMod}-${iv + 1}`
    }
    idsModulo.add(idMod)

    const h3s = secoes.filter((s) => s.nivel === 3 && s.linha > h2.linha && s.linha < fimModulo)
    const intro2 = mdParaBlocos(fatia(h2.linha + 1, h3s.length ? h3s[0].linha : fimModulo))
    const licoes = h3s.map((h3, il) => {
      const fimLicao = il + 1 < h3s.length ? h3s[il + 1].linha : fimModulo
      let idLic = h3.id || kebab(h3.texto) || `licao-${il + 1}`
      if (idsLicao.has(idLic)) {
        erros.push(`${nomeArquivo}:${h3.linhaArquivo}: lição com id duplicado "${idLic}" — renomeie ou use {#outro-id}`)
        idLic = `${idLic}-${il + 1}`
      }
      idsLicao.add(idLic)
      const chaveTitulo = h3.texto.toLowerCase()
      if (titulosLicao.has(chaveTitulo)) erros.push(`${nomeArquivo}:${h3.linhaArquivo}: título de lição repetido "${h3.texto}"`)
      titulosLicao.add(chaveTitulo)
      return { id: idLic, titulo: h3.texto, modulo: idMod, blocos: mdParaBlocos(fatia(h3.linha + 1, fimLicao)), linha: h3.linhaArquivo }
    })
    if (!licoes.length) erros.push(`${nomeArquivo}:${h2.linhaArquivo}: módulo "${h2.texto}" sem nenhuma lição (### Título)`)
    modulos.push({ id: idMod, titulo: h2.texto, descricao: '', intro: intro2, licoes, linha: h2.linhaArquivo })
  })

  if (!modulos.length) erros.push(`${nomeArquivo}: nenhum módulo — use "## Módulo" e "### Lição"`)

  return {
    id,
    titulo,
    descricao,
    fase: Number.isFinite(Number(meta.fase)) ? Number(meta.fase) : 99,
    ordem: Number.isFinite(Number(meta.ordem)) ? Number(meta.ordem) : 999,
    deck: meta.deck ? String(meta.deck) : '',
    tags: Array.isArray(meta.tags) ? meta.tags.map(String) : meta.tags ? [String(meta.tags)] : [],
    nivel: Number.isFinite(Number(meta.nivel)) ? Number(meta.nivel) : null,
    intro,
    modulos,
    erros,
  }
}
