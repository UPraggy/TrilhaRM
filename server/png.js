// Encoder PNG + primitivas de desenho, em JavaScript puro (só node:zlib e node:buffer).
//
// Por que existe: o bot do Telegram manda imagem (sendPhoto) e o app não pode ganhar dependência
// nenhuma — nada de canvas, sharp ou pngjs. Aqui tem o suficiente para desenhar um card bonito:
//
//   tela  -> buffer RGBA (4 bytes por pixel, linha a linha)
//   PNG   -> IHDR + IDAT (filtro 0 em toda linha, deflateSync) + IEND, com CRC32 próprio
//   forma -> retângulo (cantos arredondados), linha, círculo, arco, gradiente linear
//   texto -> fonte bitmap embutida (5x9 com descida real), escala inteira, negrito, alinhamento
//
// Decisões que valem comentário:
// - Anti-aliasing por distância assinada: cada pixel da borda recebe cobertura = clamp(0.5 - d).
//   É barato, não precisa de supersampling e resolve o serrilhado dos cantos e dos círculos.
// - A fonte é bitmap de propósito: em escala inteira ela fica nítida (sem AA), que é o que salva a
//   legibilidade num PNG de 800x418 visto no celular. Cada glifo é uma grade 5x9:
//     linhas 0-6 = caixa alta e ascendentes | linhas 2-6 = altura-x | linhas 7-8 = descida (g p q y j)
//   As linhas 0-1 sobram para os acentos do português (á ã â é ê í ó ô õ ú ç).
// - Largura variável: o glifo é recortado nas colunas vazias das pontas, então "il" não fica com
//   buraco e "MW" não encosta. `medirTexto` usa exatamente a mesma conta do desenho.
import zlib from 'node:zlib'

// ---- cores ---------------------------------------------------------------

const CACHE_COR = new Map()

/**
 * Aceita '#rgb', '#rrggbb', '#rrggbbaa', 'rgba(r,g,b,a)' ou [r,g,b,a].
 * Devolve sempre [r, g, b, a] com a em 0..1.
 */
export function corRGBA(c) {
  if (Array.isArray(c)) return [c[0] | 0, c[1] | 0, c[2] | 0, c.length > 3 ? Number(c[3]) : 1]
  const chave = String(c)
  const emCache = CACHE_COR.get(chave)
  if (emCache) return emCache
  let saida = [0, 0, 0, 1]
  const t = chave.trim()
  const hex = /^#([0-9a-f]{3,8})$/i.exec(t)
  if (hex) {
    let h = hex[1]
    if (h.length === 3 || h.length === 4) h = h.split('').map((x) => x + x).join('')
    const n = (i) => parseInt(h.slice(i * 2, i * 2 + 2), 16)
    saida = [n(0), n(1), n(2), h.length >= 8 ? n(3) / 255 : 1]
  } else {
    const rgba = /^rgba?\(([^)]+)\)$/i.exec(t)
    if (rgba) {
      const p = rgba[1].split(',').map((x) => Number(x.trim()))
      saida = [p[0] | 0, p[1] | 0, p[2] | 0, p.length > 3 && Number.isFinite(p[3]) ? p[3] : 1]
    }
  }
  CACHE_COR.set(chave, saida)
  return saida
}

/** mistura duas cores (t = 0 devolve `a`, t = 1 devolve `b`) */
export function misturarCores(a, b, t) {
  const x = corRGBA(a)
  const y = corRGBA(b)
  const k = Math.max(0, Math.min(1, t))
  return [
    Math.round(x[0] + (y[0] - x[0]) * k),
    Math.round(x[1] + (y[1] - x[1]) * k),
    Math.round(x[2] + (y[2] - x[2]) * k),
    x[3] + (y[3] - x[3]) * k,
  ]
}

// ---- tela ----------------------------------------------------------------

/** cria a tela RGBA (transparente, ou já preenchida se vier `fundo`) */
export function criarTela(largura, altura, fundo = null) {
  const l = Math.max(1, Math.round(largura))
  const a = Math.max(1, Math.round(altura))
  const tela = { largura: l, altura: a, dados: Buffer.alloc(l * a * 4) }
  if (fundo) preencher(tela, fundo)
  return tela
}

/** source-over de um pixel; `cobertura` (0..1) multiplica o alfa da cor */
export function pintar(tela, x, y, cor, cobertura = 1) {
  if (cobertura <= 0) return
  const [r, g, b, ca] = corRGBA(cor)
  pintarBruto(tela, x, y, r, g, b, ca * cobertura)
}

/**
 * O mesmo source-over com a cor já destrinchada. Os laços de desenho usam esta versão: parsear a
 * cor por pixel custava mais que desenhar (um card 800x418 tem 334 mil pixels).
 */
function pintarBruto(tela, x, y, r, g, b, alfa) {
  const px = x | 0
  const py = y | 0
  if (px < 0 || py < 0 || px >= tela.largura || py >= tela.altura) return
  const sa = alfa > 1 ? 1 : alfa
  if (sa <= 0) return
  const i = (py * tela.largura + px) * 4
  const d = tela.dados
  if (sa >= 1) {
    d[i] = r
    d[i + 1] = g
    d[i + 2] = b
    d[i + 3] = 255
    return
  }
  const da = d[i + 3] / 255
  const oa = sa + da * (1 - sa)
  if (oa <= 0) {
    d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 0
    return
  }
  d[i] = Math.round((r * sa + d[i] * da * (1 - sa)) / oa)
  d[i + 1] = Math.round((g * sa + d[i + 1] * da * (1 - sa)) / oa)
  d[i + 2] = Math.round((b * sa + d[i + 2] * da * (1 - sa)) / oa)
  d[i + 3] = Math.round(oa * 255)
}

/** cor de um pixel, como [r,g,b,a(0..255)] — usado por testes e pelo cache do QR */
export function lerPixel(tela, x, y) {
  const i = ((y | 0) * tela.largura + (x | 0)) * 4
  const d = tela.dados
  return [d[i], d[i + 1], d[i + 2], d[i + 3]]
}

/** pinta a tela inteira (opaco, sem blend: é o fundo) */
export function preencher(tela, cor) {
  const [r, g, b, a] = corRGBA(cor)
  const alfa = Math.round(Math.max(0, Math.min(1, a)) * 255)
  const d = tela.dados
  for (let i = 0; i < d.length; i += 4) {
    d[i] = r
    d[i + 1] = g
    d[i + 2] = b
    d[i + 3] = alfa
  }
}

// ---- formas --------------------------------------------------------------

/** distância assinada de (px,py) a um retângulo de cantos arredondados */
function distRetangulo(px, py, cx, cy, mx, my, raio) {
  const dx = Math.abs(px - cx) - (mx - raio)
  const dy = Math.abs(py - cy) - (my - raio)
  const ax = Math.max(dx, 0)
  const ay = Math.max(dy, 0)
  return Math.sqrt(ax * ax + ay * ay) + Math.min(Math.max(dx, dy), 0) - raio
}

function cobertura(d) {
  return Math.max(0, Math.min(1, 0.5 - d))
}

/**
 * Retângulo com cantos arredondados, preenchimento e/ou contorno.
 * { x, y, largura, altura, cor, raio, opacidade, contorno, espessura }
 */
export function retangulo(tela, opcoes = {}) {
  const { x = 0, y = 0, largura = 0, altura = 0, cor = null, raio = 0, opacidade = 1, contorno = null, espessura = 1 } = opcoes
  if (largura <= 0 || altura <= 0) return
  const mx = largura / 2
  const my = altura / 2
  const cx = x + mx
  const cy = y + my
  const r = Math.max(0, Math.min(raio, mx, my))
  const folga = Math.ceil(espessura / 2 + 1)
  const x0 = Math.max(0, Math.floor(x) - folga)
  const x1 = Math.min(tela.largura - 1, Math.ceil(x + largura) + folga)
  const y0 = Math.max(0, Math.floor(y) - folga)
  const y1 = Math.min(tela.altura - 1, Math.ceil(y + altura) + folga)
  const meia = espessura / 2
  const cp = cor ? corRGBA(cor) : null
  const ct = contorno ? corRGBA(contorno) : null
  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      const d = distRetangulo(px + 0.5, py + 0.5, cx, cy, mx, my, r)
      if (cp) {
        const c = cobertura(d)
        if (c > 0) pintarBruto(tela, px, py, cp[0], cp[1], cp[2], cp[3] * c * opacidade)
      }
      if (ct && espessura > 0) {
        const c = Math.max(0, Math.min(1, 0.5 + meia - Math.abs(d)))
        if (c > 0) pintarBruto(tela, px, py, ct[0], ct[1], ct[2], ct[3] * c * opacidade)
      }
    }
  }
}

/** círculo (preenchido e/ou só contorno) */
export function circulo(tela, opcoes = {}) {
  const { x = 0, y = 0, raio = 0, cor = null, opacidade = 1, contorno = null, espessura = 1 } = opcoes
  if (raio <= 0) return
  retangulo(tela, {
    x: x - raio,
    y: y - raio,
    largura: raio * 2,
    altura: raio * 2,
    raio,
    cor,
    opacidade,
    contorno,
    espessura,
  })
}

const GRAU = Math.PI / 180

/**
 * Arco/anel: { x, y, raio, espessura, inicio, fim, cor } com ângulos em graus,
 * 0 = 3 horas, crescendo no sentido horário (que é como a gente lê um progresso circular).
 */
export function arco(tela, opcoes = {}) {
  const { x = 0, y = 0, raio = 0, espessura = 4, inicio = 0, fim = 360, cor = '#fff', opacidade = 1 } = opcoes
  if (raio <= 0 || espessura <= 0) return
  const meia = espessura / 2
  const externo = raio + meia + 1
  const x0 = Math.max(0, Math.floor(x - externo))
  const x1 = Math.min(tela.largura - 1, Math.ceil(x + externo))
  const y0 = Math.max(0, Math.floor(y - externo))
  const y1 = Math.min(tela.altura - 1, Math.ceil(y + externo))
  const cp = corRGBA(cor)
  const ini = inicio * GRAU
  const total = Math.max(0, Math.min(360, fim - inicio)) * GRAU
  const cheio = total >= 359.9 * GRAU
  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      const dx = px + 0.5 - x
      const dy = py + 0.5 - y
      const dist = Math.sqrt(dx * dx + dy * dy)
      const c = Math.max(0, Math.min(1, 0.5 + meia - Math.abs(dist - raio)))
      if (c <= 0) continue
      if (!cheio) {
        let ang = Math.atan2(dy, dx) - ini
        while (ang < 0) ang += Math.PI * 2
        while (ang >= Math.PI * 2) ang -= Math.PI * 2
        if (ang > total) continue
      }
      pintarBruto(tela, px, py, cp[0], cp[1], cp[2], cp[3] * c * opacidade)
    }
  }
}

/** segmento de reta com espessura e pontas arredondadas */
export function linha(tela, opcoes = {}) {
  const { x1 = 0, y1 = 0, x2 = 0, y2 = 0, cor = '#fff', espessura = 1, opacidade = 1 } = opcoes
  const meia = Math.max(0.5, espessura / 2)
  const folga = Math.ceil(meia + 1)
  const ax = Math.max(0, Math.floor(Math.min(x1, x2)) - folga)
  const bx = Math.min(tela.largura - 1, Math.ceil(Math.max(x1, x2)) + folga)
  const ay = Math.max(0, Math.floor(Math.min(y1, y2)) - folga)
  const by = Math.min(tela.altura - 1, Math.ceil(Math.max(y1, y2)) + folga)
  const vx = x2 - x1
  const vy = y2 - y1
  const comp2 = vx * vx + vy * vy
  const cp = corRGBA(cor)
  for (let py = ay; py <= by; py++) {
    for (let px = ax; px <= bx; px++) {
      const wx = px + 0.5 - x1
      const wy = py + 0.5 - y1
      let t = comp2 > 0 ? (wx * vx + wy * vy) / comp2 : 0
      t = Math.max(0, Math.min(1, t))
      const dx = wx - vx * t
      const dy = wy - vy * t
      const c = Math.max(0, Math.min(1, 0.5 + meia - Math.sqrt(dx * dx + dy * dy)))
      if (c > 0) pintarBruto(tela, px, py, cp[0], cp[1], cp[2], cp[3] * c * opacidade)
    }
  }
}

/**
 * Gradiente linear dentro de um retângulo (com cantos arredondados opcionais).
 * `angulo` em graus: 0 = esquerda->direita, 90 = cima->baixo.
 */
export function gradiente(tela, opcoes = {}) {
  const { x = 0, y = 0, largura = 0, altura = 0, de = '#000', para = '#fff', angulo = 0, opacidade = 1, raio = 0 } = opcoes
  if (largura <= 0 || altura <= 0) return
  const rad = angulo * GRAU
  const ux = Math.cos(rad)
  const uy = Math.sin(rad)
  // projeções dos 4 cantos para normalizar t em 0..1 seja qual for o ângulo
  const cantos = [
    [x, y],
    [x + largura, y],
    [x, y + altura],
    [x + largura, y + altura],
  ].map(([cx, cy]) => cx * ux + cy * uy)
  const min = Math.min(...cantos)
  const max = Math.max(...cantos)
  const faixa = max - min || 1
  const mx = largura / 2
  const my = altura / 2
  const cx = x + mx
  const cy = y + my
  const r = Math.max(0, Math.min(raio, mx, my))
  const x0 = Math.max(0, Math.floor(x) - 1)
  const x1 = Math.min(tela.largura - 1, Math.ceil(x + largura) + 1)
  const y0 = Math.max(0, Math.floor(y) - 1)
  const y1 = Math.min(tela.altura - 1, Math.ceil(y + altura) + 1)
  const a = corRGBA(de)
  const b = corRGBA(para)
  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      const c = cobertura(distRetangulo(px + 0.5, py + 0.5, cx, cy, mx, my, r))
      if (c <= 0) continue
      let t = ((px + 0.5) * ux + (py + 0.5) * uy - min) / faixa
      t = t < 0 ? 0 : t > 1 ? 1 : t
      pintarBruto(
        tela,
        px,
        py,
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
        a[2] + (b[2] - a[2]) * t,
        (a[3] + (b[3] - a[3]) * t) * c * opacidade,
      )
    }
  }
}

// ---- fonte bitmap --------------------------------------------------------
// Grade 5x9. Linhas 0-6 = caixa alta/ascendentes, 2-6 = altura-x, 7-8 = descida.
// '#' acende o pixel; linhas finais em branco podem ser omitidas.

export const GLIFO_L = 5 // colunas da grade
export const GLIFO_A = 9 // linhas da grade (com a descida)
export const LINHA_BASE = 6 // última linha da altura-x

const DESENHOS = {
  ' ': '',
  A: '.###./#...#/#...#/#####/#...#/#...#/#...#',
  B: '####./#...#/#...#/####./#...#/#...#/####.',
  C: '.###./#...#/#..../#..../#..../#...#/.###.',
  D: '####./#...#/#...#/#...#/#...#/#...#/####.',
  E: '#####/#..../#..../####./#..../#..../#####',
  F: '#####/#..../#..../####./#..../#..../#....',
  G: '.###./#...#/#..../#.###/#...#/#...#/.###.',
  H: '#...#/#...#/#...#/#####/#...#/#...#/#...#',
  I: '.###./..#../..#../..#../..#../..#../.###.',
  J: '..###/...#./...#./...#./...#./#..#./.##..',
  K: '#...#/#..#./#.#../##.../#.#../#..#./#...#',
  L: '#..../#..../#..../#..../#..../#..../#####',
  M: '#...#/##.##/#.#.#/#.#.#/#...#/#...#/#...#',
  N: '#...#/##..#/##..#/#.#.#/#..##/#..##/#...#',
  O: '.###./#...#/#...#/#...#/#...#/#...#/.###.',
  P: '####./#...#/#...#/####./#..../#..../#....',
  Q: '.###./#...#/#...#/#...#/#.#.#/#..#./.##.#',
  R: '####./#...#/#...#/####./#.#../#..#./#...#',
  S: '.####/#..../#..../.###./....#/....#/####.',
  T: '#####/..#../..#../..#../..#../..#../..#..',
  U: '#...#/#...#/#...#/#...#/#...#/#...#/.###.',
  V: '#...#/#...#/#...#/#...#/#...#/.#.#./..#..',
  W: '#...#/#...#/#...#/#.#.#/#.#.#/##.##/#...#',
  X: '#...#/#...#/.#.#./..#../.#.#./#...#/#...#',
  Y: '#...#/#...#/.#.#./..#../..#../..#../..#..',
  Z: '#####/....#/...#./..#../.#.../#..../#####',
  a: '...../...../.###./....#/.####/#...#/.####',
  b: '#..../#..../####./#...#/#...#/#...#/####.',
  c: '...../...../.###./#...#/#..../#...#/.###.',
  d: '....#/....#/.####/#...#/#...#/#...#/.####',
  e: '...../...../.###./#...#/#####/#..../.###.',
  f: '..##./.#.../####./.#.../.#.../.#.../.#...',
  g: '...../...../.####/#...#/#...#/.####/....#/#...#/.###.',
  h: '#..../#..../####./#...#/#...#/#...#/#...#',
  i: '..#../...../.##../..#../..#../..#../.###.',
  j: '...#./...../..##./...#./...#./...#./...#./#..#./.##..',
  k: '#..../#..../#..#./#.#../##.../#.#../#..#.',
  l: '.##../..#../..#../..#../..#../..#../.###.',
  m: '...../...../##.##/#.#.#/#.#.#/#.#.#/#.#.#',
  n: '...../...../####./#...#/#...#/#...#/#...#',
  o: '...../...../.###./#...#/#...#/#...#/.###.',
  p: '...../...../####./#...#/#...#/####./#..../#..../#....',
  q: '...../...../.####/#...#/#...#/.####/....#/....#/....#',
  r: '...../...../#.##./##..#/#..../#..../#....',
  s: '...../...../.####/#..../.###./....#/####.',
  t: '.#.../.#.../####./.#.../.#.../.#..#/..##.',
  u: '...../...../#...#/#...#/#...#/#...#/.####',
  v: '...../...../#...#/#...#/#...#/.#.#./..#..',
  w: '...../...../#...#/#...#/#.#.#/#.#.#/.#.#.',
  x: '...../...../#...#/.#.#./..#../.#.#./#...#',
  y: '...../...../#...#/#...#/#...#/.####/....#/#...#/.###.',
  z: '...../...../#####/...#./..#../.#.../#####',
  0: '.###./#...#/#..##/#.#.#/##..#/#...#/.###.',
  1: '..#../.##../..#../..#../..#../..#../.###.',
  2: '.###./#...#/....#/...#./..#../.#.../#####',
  3: '#####/...#./..##./....#/....#/#...#/.###.',
  4: '...#./..##./.#.#./#..#./#####/...#./...#.',
  5: '#####/#..../####./....#/....#/#...#/.###.',
  6: '..##./.#.../#..../####./#...#/#...#/.###.',
  7: '#####/....#/...#./..#../.#.../.#.../.#...',
  8: '.###./#...#/#...#/.###./#...#/#...#/.###.',
  9: '.###./#...#/#...#/.####/....#/...#./.##..',
  '.': '...../...../...../...../...../...../..#..',
  ',': '...../...../...../...../...../...../..#../.#...',
  ':': '...../...../..#../...../...../..#..',
  ';': '...../...../..#../...../...../..#../.#...',
  '!': '..#../..#../..#../..#../..#../...../..#..',
  '?': '.###./#...#/....#/..##./..#../...../..#..',
  '·': '...../...../...../...../..#..',
  '/': '....#/....#/...#./..#../.#.../#..../#....',
  '\\': '#..../#..../.#.../..#../...#./....#/....#',
  '%': '##.../##..#/...#./..#../.#.../#..##/...##',
  '#': '.#.#./.#.#./#####/.#.#./#####/.#.#./.#.#.',
  '+': '...../...../...../..#../#####/..#..',
  '-': '...../...../...../...../#####',
  '=': '...../...../...../#####/...../#####',
  _: '...../...../...../...../...../...../...../#####',
  '(': '...#./..#../.#.../.#.../.#.../..#../...#.',
  ')': '.#.../..#../...#./...#./...#./..#../.#...',
  '[': '.###./.#.../.#.../.#.../.#.../.#.../.###.',
  ']': '.###./...#./...#./...#./...#./...#./.###.',
  '<': '...#./..#../.#.../#..../.#.../..#../...#.',
  '>': '.#.../..#../...#./....#/...#./..#../.#...',
  '≥': '...../##.../..##./##.../...../#####',
  '≤': '...../...##/.##../...##/...../#####',
  '→': '...../...../...#./#####/...#.',
  '*': '...../#.#.#/.###./#####/.###./#.#.#',
  "'": '..#../..#..',
  '"': '.#.#./.#.#.',
  '@': '.###./#...#/#.###/#.#.#/#.###/#..../.###.',
  '&': '.##../#..../.#.../##.#./#..##/#..#./.##.#',
  º: '.###./#...#/.###.',
  '°': '.###./#...#/.###.',
  á: '...#./..#../.###./....#/.####/#...#/.####',
  â: '..#../.#.#./.###./....#/.####/#...#/.####',
  ã: '.##.#/#..##/.###./....#/.####/#...#/.####',
  à: '.#.../..#../.###./....#/.####/#...#/.####',
  é: '...#./..#../.###./#...#/#####/#..../.###.',
  ê: '..#../.#.#./.###./#...#/#####/#..../.###.',
  í: '...#./..#../.##../..#../..#../..#../.###.',
  î: '..#../.#.#./.##../..#../..#../..#../.###.',
  ó: '...#./..#../.###./#...#/#...#/#...#/.###.',
  ô: '..#../.#.#./.###./#...#/#...#/#...#/.###.',
  õ: '.##.#/#..##/.###./#...#/#...#/#...#/.###.',
  ú: '...#./..#../#...#/#...#/#...#/#...#/.####',
  û: '..#../.#.#./#...#/#...#/#...#/#...#/.####',
  ü: '.#.#./...../#...#/#...#/#...#/#...#/.####',
  ç: '...../...../.###./#...#/#..../#...#/.###./..#../.##..',
  ñ: '.##.#/#..##/####./#...#/#...#/#...#/#...#',
  '~': '...../...../...../.##.#/#..##',
  '…': '...../...../...../...../...../...../#.#.#',
  // Maiúsculas acentuadas: o acento fica na linha 0 e a caixa alta encolhe para as linhas 1-6.
  // Fica 1 pixel mais baixa que as outras maiúsculas, mas a LINHA DE BASE é a mesma — que é o que
  // o olho percebe. Sem isso, "EXERCÍCIO" viraria "EXERCICIO" no card.
  Á: '..##./.###./#...#/#####/#...#/#...#/#...#',
  À: '.##../.###./#...#/#####/#...#/#...#/#...#',
  Â: '..#../.#.#./.###./#####/#...#/#...#/#...#',
  Ã: '.##.#/#..##/.###./#####/#...#/#...#/#...#',
  É: '..##./#####/#..../####./#..../#..../#####',
  Ê: '..#../.#.#./#####/####./#..../#..../#####',
  Í: '..##./.###./..#../..#../..#../..#../.###.',
  Ó: '..##./.###./#...#/#...#/#...#/#...#/.###.',
  Ô: '..#../.#.#./.###./#...#/#...#/#...#/.###.',
  Õ: '.##.#/#..##/.###./#...#/#...#/#...#/.###.',
  Ú: '..##./#...#/#...#/#...#/#...#/#...#/.###.',
  Ç: '.###./#...#/#..../#..../#..../#...#/.###./..#../.##..',
}

// Maiúsculas acentuadas e o resto do latim-1 caem no equivalente sem acento: é melhor mostrar
// "AVALIACOES" do que um losango de caractere desconhecido.
const EQUIVALENTES = {
  Ä: 'A', È: 'E', Ì: 'I', Î: 'I', Ò: 'O', Û: 'U', Ü: 'U', Ñ: 'N', ä: 'a', è: 'e',
  ì: 'i', ò: 'o', ù: 'u', '–': '-', '—': '-', '−': '-', '“': '"', '”': '"', '‘': "'", '’': "'",
  '•': '·', '×': 'x', '⁄': '/',
}

/** glifo compilado: { colunas, largura, altura } — `colunas` é bitmask por coluna já recortada */
const CACHE_GLIFO = new Map()

function compilar(ch) {
  const emCache = CACHE_GLIFO.get(ch)
  if (emCache) return emCache
  let desenho = DESENHOS[ch]
  if (desenho === undefined) {
    const eq = EQUIVALENTES[ch]
    if (eq && eq.length === 1) desenho = DESENHOS[eq]
  }
  if (desenho === undefined) desenho = DESENHOS['?']
  const linhas = desenho ? desenho.split('/') : []
  const mapa = [] // [coluna][linha] = ligado
  let minC = GLIFO_L
  let maxC = -1
  for (let c = 0; c < GLIFO_L; c++) mapa.push(new Array(GLIFO_A).fill(false))
  for (let l = 0; l < linhas.length && l < GLIFO_A; l++) {
    const txt = linhas[l]
    for (let c = 0; c < GLIFO_L; c++) {
      if (txt[c] === '#') {
        mapa[c][l] = true
        if (c < minC) minC = c
        if (c > maxC) maxC = c
      }
    }
  }
  const vazio = maxC < 0
  const largura = vazio ? 3 : maxC - minC + 1 // espaço vale 3 colunas
  const g = { largura, colunas: [], vazio }
  if (!vazio) {
    for (let c = minC; c <= maxC; c++) g.colunas.push(mapa[c])
  }
  CACHE_GLIFO.set(ch, g)
  return g
}

/** altura total da caixa do texto (com descida) numa dada escala */
export function alturaTexto(escala = 1) {
  return GLIFO_A * escala
}

/** altura da caixa alta (do topo até a linha de base) — o que interessa para alinhar verticalmente */
export function alturaCaixaAlta(escala = 1) {
  return (LINHA_BASE + 1) * escala
}

/** largura em pixels de `txt` — a mesma conta que `texto()` usa para desenhar */
export function medirTexto(txt, escala = 1, opcoes = {}) {
  const { negrito = false, espacamento = 1 } = opcoes
  const s = String(txt === null || txt === undefined ? '' : txt)
  if (!s.length) return 0
  let largura = 0
  for (const ch of s) {
    largura += compilar(ch).largura * escala + (negrito ? 1 : 0) + espacamento * escala
  }
  return largura - espacamento * escala
}

/**
 * Escreve `txt` com a fonte bitmap.
 * { x, y, escala, cor, negrito, alinhamento: 'esquerda'|'centro'|'direita', opacidade, espacamento }
 * `y` é o TOPO da caixa (linha 0 da grade). Devolve a largura desenhada.
 */
export function texto(tela, txt, opcoes = {}) {
  const {
    x = 0,
    y = 0,
    escala = 1,
    cor = '#fff',
    negrito = false,
    alinhamento = 'esquerda',
    opacidade = 1,
    espacamento = 1,
  } = opcoes
  const s = String(txt === null || txt === undefined ? '' : txt)
  if (!s.length) return 0
  const largura = medirTexto(s, escala, { negrito, espacamento })
  let cursor = x
  if (alinhamento === 'centro') cursor = Math.round(x - largura / 2)
  else if (alinhamento === 'direita') cursor = Math.round(x - largura)
  cursor = Math.round(cursor)
  const topo = Math.round(y)
  const passos = negrito ? [0, 1] : [0]
  const cp = corRGBA(cor)
  for (const ch of s) {
    const g = compilar(ch)
    if (!g.vazio) {
      for (let c = 0; c < g.colunas.length; c++) {
        const col = g.colunas[c]
        for (let l = 0; l < GLIFO_A; l++) {
          if (!col[l]) continue
          const px = cursor + c * escala
          const py = topo + l * escala
          for (const dx of passos) {
            for (let i = 0; i < escala; i++) {
              for (let j = 0; j < escala; j++) pintarBruto(tela, px + i + dx, py + j, cp[0], cp[1], cp[2], cp[3] * opacidade)
            }
          }
        }
      }
    }
    cursor += g.largura * escala + (negrito ? 1 : 0) + espacamento * escala
  }
  return largura
}

/** quebra `txt` em linhas que cabem em `larguraMax` (quebra por palavra; palavra gigante é cortada) */
export function quebrarTexto(txt, larguraMax, escala = 1, opcoes = {}) {
  const palavras = String(txt === null || txt === undefined ? '' : txt).split(/\s+/).filter(Boolean)
  const linhas = []
  let atual = ''
  const cabe = (s) => medirTexto(s, escala, opcoes) <= larguraMax
  for (const p of palavras) {
    const tentativa = atual ? `${atual} ${p}` : p
    if (cabe(tentativa)) {
      atual = tentativa
      continue
    }
    if (atual) linhas.push(atual)
    if (cabe(p)) {
      atual = p
      continue
    }
    // palavra maior que a linha inteira (URL sem espaço): corta no limite
    let resto = p
    atual = ''
    while (resto) {
      let corte = resto.length
      while (corte > 1 && !cabe(resto.slice(0, corte))) corte -= 1
      const pedaco = resto.slice(0, corte)
      resto = resto.slice(corte)
      if (resto) linhas.push(pedaco)
      else atual = pedaco
    }
  }
  if (atual) linhas.push(atual)
  return linhas
}

/** corta com reticências para caber em `larguraMax` numa única linha */
export function cortarTexto(txt, larguraMax, escala = 1, opcoes = {}) {
  const s = String(txt === null || txt === undefined ? '' : txt)
  if (medirTexto(s, escala, opcoes) <= larguraMax) return s
  let corte = s.length
  while (corte > 1) {
    corte -= 1
    const tentativa = `${s.slice(0, corte).trimEnd()}...`
    if (medirTexto(tentativa, escala, opcoes) <= larguraMax) return tentativa
  }
  return ''
}

// ---- PNG ------------------------------------------------------------------

const TABELA_CRC = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

/** CRC-32 (o mesmo polinômio do PNG e do zip) */
export function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = TABELA_CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function pedaco(tipo, dados) {
  const corpo = Buffer.concat([Buffer.from(tipo, 'latin1'), dados])
  const cab = Buffer.alloc(4)
  cab.writeUInt32BE(dados.length, 0)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(corpo), 0)
  return Buffer.concat([cab, corpo, crc])
}

export const ASSINATURA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** tela RGBA -> Buffer PNG (8 bits, cor tipo 6, filtro 0 em toda linha) */
export function codificarPNG(tela) {
  const { largura, altura, dados } = tela
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(largura, 0)
  ihdr.writeUInt32BE(altura, 4)
  ihdr[8] = 8 // profundidade
  ihdr[9] = 6 // RGBA
  ihdr[10] = 0 // deflate
  ihdr[11] = 0 // filtro adaptativo
  ihdr[12] = 0 // sem entrelaçamento
  const passo = largura * 4
  const cru = Buffer.alloc((passo + 1) * altura)
  for (let y = 0; y < altura; y++) {
    cru[y * (passo + 1)] = 0 // filtro 0: linha crua
    dados.copy(cru, y * (passo + 1) + 1, y * passo, y * passo + passo)
  }
  const idat = zlib.deflateSync(cru, { level: 9 })
  return Buffer.concat([ASSINATURA_PNG, pedaco('IHDR', ihdr), pedaco('IDAT', idat), pedaco('IEND', Buffer.alloc(0))])
}

/** lê de volta um PNG gerado aqui (só o formato que a gente escreve) — serve aos testes */
export function decodificarPNG(buf) {
  if (!ASSINATURA_PNG.equals(buf.subarray(0, 8))) throw new Error('assinatura PNG inválida')
  let i = 8
  let cabecalho = null
  const partes = []
  while (i < buf.length) {
    const tam = buf.readUInt32BE(i)
    const tipo = buf.toString('latin1', i + 4, i + 8)
    const dados = buf.subarray(i + 8, i + 8 + tam)
    const crc = buf.readUInt32BE(i + 8 + tam)
    if (crc !== crc32(buf.subarray(i + 4, i + 8 + tam))) throw new Error(`CRC inválido no chunk ${tipo}`)
    if (tipo === 'IHDR') {
      cabecalho = {
        largura: dados.readUInt32BE(0),
        altura: dados.readUInt32BE(4),
        profundidade: dados[8],
        tipoCor: dados[9],
      }
    } else if (tipo === 'IDAT') partes.push(dados)
    i += 12 + tam
  }
  if (!cabecalho) throw new Error('sem IHDR')
  const cru = zlib.inflateSync(Buffer.concat(partes))
  const passo = cabecalho.largura * 4
  const dados = Buffer.alloc(passo * cabecalho.altura)
  for (let y = 0; y < cabecalho.altura; y++) {
    const filtro = cru[y * (passo + 1)]
    if (filtro !== 0) throw new Error(`filtro ${filtro} não suportado`)
    cru.copy(dados, y * passo, y * (passo + 1) + 1, y * (passo + 1) + 1 + passo)
  }
  return { ...cabecalho, dados, tela: { largura: cabecalho.largura, altura: cabecalho.altura, dados } }
}
