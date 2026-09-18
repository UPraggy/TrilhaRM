// Cards PNG do Trilha RM — o que o bot do Telegram manda como imagem (sendPhoto).
//
// Todos 800x418 (proporção que o Telegram mostra inteira, sem cortar, no celular e no desktop),
// fundo "void-frio" e a marca "RM · Trilha RM" no rodapé. As cores são as mesmas variáveis de
// src/styles.css — se mudar a identidade lá, mude o objeto CORES aqui.
//
// Cada função devolve um Buffer PNG pronto. Nada de texto cortado: tudo passa por medirTexto,
// quebrarTexto ou cortarTexto antes de ser desenhado.
import {
  alturaCaixaAlta,
  alturaTexto,
  circulo,
  codificarPNG,
  cortarTexto,
  criarTela,
  gradiente,
  linha,
  medirTexto,
  quebrarTexto,
  retangulo,
  texto,
} from './png.js'
import { matrizQR } from './qrcode.js'

export const LARGURA = 800
export const ALTURA = 418
const MARGEM = 40

export const CORES = {
  bg: '#0a0c12',
  bgClaro: '#141826',
  surface: '#11131c',
  surface2: '#181b26',
  linha: 'rgba(157, 177, 234, 0.18)',
  linhaForte: 'rgba(157, 177, 234, 0.34)',
  peri: '#9db1ea',
  periFraco: 'rgba(157, 177, 234, 0.45)',
  amber: '#eaa94e',
  amberSuave: '#f4cd8a',
  bone: '#f1ede2',
  fg1: '#ddd2c1',
  fg2: '#a99a83',
  fg3: '#7c7060',
  verde: '#7bbf5e',
  verdeFraco: 'rgba(123, 191, 94, 0.28)',
  rosa: '#e06a55',
}

// ---- peças comuns ---------------------------------------------------------

/**
 * Quebra em no máximo `maximo` linhas e marca o corte com reticências — texto cortado no meio da
 * frase sem aviso é o defeito nº 1 de card gerado por código.
 */
function linhasComReticencias(txt, largura, escala, maximo, opcoes = {}) {
  const linhas = quebrarTexto(txt, largura, escala, opcoes)
  if (linhas.length <= maximo) return linhas
  const usadas = linhas.slice(0, maximo)
  usadas[maximo - 1] = cortarTexto(linhas.slice(maximo - 1).join(' '), largura, escala, opcoes)
  return usadas
}

/** monograma RM + "Trilha RM" no rodapé, na cor da marca (R periwinkle, M âmbar) */
function marca(tela, y) {
  const x = MARGEM
  retangulo(tela, { x, y: y - 4, largura: 34, altura: 34, raio: 9, cor: CORES.surface2, contorno: CORES.linhaForte, espessura: 1 })
  texto(tela, 'R', { x: x + 7, y: y + 3, escala: 2, cor: CORES.peri, negrito: true })
  texto(tela, 'M', { x: x + 18, y: y + 3, escala: 2, cor: CORES.amber, negrito: true })
  texto(tela, '· Trilha RM', { x: x + 46, y: y + 4, escala: 2, cor: CORES.fg3 })
  return x + 46 + medirTexto('· Trilha RM', 2)
}

/**
 * Fundo, moldura, cabeçalho (etiqueta + título) e rodapé. Devolve a área útil.
 * { etiqueta, titulo, nota } — `nota` sai no rodapé, à direita.
 */
function moldura({ etiqueta = '', titulo = '', nota = '' } = {}) {
  const tela = criarTela(LARGURA, ALTURA, CORES.bg)
  // brilho diagonal de fundo: dá profundidade sem competir com o conteúdo
  gradiente(tela, { x: 0, y: 0, largura: LARGURA, altura: ALTURA, de: CORES.bgClaro, para: CORES.bg, angulo: 55, opacidade: 0.85 })
  retangulo(tela, { x: 10, y: 10, largura: LARGURA - 20, altura: ALTURA - 20, raio: 20, contorno: CORES.linha, espessura: 2 })

  let y = 34
  if (etiqueta) {
    const largura = medirTexto(etiqueta, 2, { negrito: true, espacamento: 2 })
    retangulo(tela, { x: MARGEM - 10, y: y - 7, largura: largura + 20, altura: 30, raio: 15, cor: 'rgba(157, 177, 234, 0.12)' })
    texto(tela, etiqueta, { x: MARGEM, y, escala: 2, cor: CORES.peri, negrito: true, espacamento: 2 })
    y += 32
  }
  if (titulo) {
    for (const l of linhasComReticencias(titulo, LARGURA - MARGEM * 2, 4, 2, { negrito: true })) {
      texto(tela, l, { x: MARGEM, y, escala: 4, cor: CORES.bone, negrito: true })
      y += alturaCaixaAlta(4) + 8
    }
    y += 6
  }

  const yRodape = ALTURA - 48
  linha(tela, { x1: MARGEM, y1: yRodape - 12, x2: LARGURA - MARGEM, y2: yRodape - 12, cor: CORES.linha, espessura: 1 })
  marca(tela, yRodape)
  if (nota) {
    texto(tela, cortarTexto(nota, 420, 2), { x: LARGURA - MARGEM, y: yRodape + 4, escala: 2, cor: CORES.fg3, alinhamento: 'direita' })
  }
  return { tela, y, limite: yRodape - 24 }
}

/** caixinha de número + rótulo (os três blocos do card "hoje") */
function bloco(tela, { x, y, largura, altura = 104, valor, rotulo, cor = CORES.bone, escalaValor = 6 }) {
  retangulo(tela, { x, y, largura, altura, raio: 14, cor: CORES.surface, contorno: CORES.linha, espessura: 1 })
  const v = String(valor)
  let escala = escalaValor
  while (escala > 2 && medirTexto(v, escala, { negrito: true }) > largura - 28) escala -= 1
  texto(tela, v, { x: x + largura / 2, y: y + 18, escala, cor, negrito: true, alinhamento: 'centro' })
  texto(tela, cortarTexto(rotulo, largura - 20, 2), {
    x: x + largura / 2,
    y: y + altura - 26,
    escala: 2,
    cor: CORES.fg2,
    alinhamento: 'centro',
  })
}

/** barra de progresso com trilho, preenchimento e cantos arredondados */
function barra(tela, { x, y, largura, altura = 16, pct, cor = CORES.verde, fundo = CORES.surface2 }) {
  const p = Math.max(0, Math.min(100, Number(pct) || 0))
  retangulo(tela, { x, y, largura, altura, raio: altura / 2, cor: fundo, contorno: CORES.linha, espessura: 1 })
  const cheio = Math.round((largura * p) / 100)
  if (cheio > 2) retangulo(tela, { x, y, largura: Math.max(cheio, altura), altura, raio: altura / 2, cor })
  return p
}

/** etiqueta pequena arredondada (nível, tempo, tipo) */
function chip(tela, { x, y, rotulo, cor = CORES.peri }) {
  const largura = medirTexto(rotulo, 2) + 24
  retangulo(tela, { x, y, largura, altura: 28, raio: 14, cor: 'rgba(24, 27, 38, 0.9)', contorno: CORES.linhaForte, espessura: 1 })
  texto(tela, rotulo, { x: x + 12, y: y + 6, escala: 2, cor })
  return largura + 10
}

/**
 * Quebra uma URL preferindo os separadores (/ . ? & - _ =) em vez de cortar no meio da palavra:
 * "…observations-lyn / n.trycloudflare.com" fica ilegível, "…observations-lynn. / trycloudflare.com"
 * não. Se um pedaço ainda não couber, aí sim o corte bruto de quebrarTexto resolve.
 */
export function quebrarURL(url, larguraMax, escala = 1) {
  const pedacos = String(url).split(/(?<=[/.?&=_-])/)
  const linhas = []
  let atual = ''
  for (const p of pedacos) {
    const tentativa = atual + p
    if (medirTexto(tentativa, escala) <= larguraMax) {
      atual = tentativa
      continue
    }
    if (atual) linhas.push(atual)
    if (medirTexto(p, escala) <= larguraMax) {
      atual = p
    } else {
      const partido = quebrarTexto(p, larguraMax, escala)
      linhas.push(...partido.slice(0, -1))
      atual = partido[partido.length - 1] || ''
    }
  }
  if (atual) linhas.push(atual)
  return linhas.length ? linhas : ['']
}

/**
 * Desenha o QR de `url` num painel claro (módulo escuro sobre fundo bone: é assim que leitor de
 * celular acerta de primeira — QR invertido falha em muitos aparelhos).
 * Devolve o tamanho real do painel ou null se não deu para gerar.
 */
export function desenharQR(tela, url, { x, y, tamanho }) {
  let modulos = null
  try {
    modulos = matrizQR(url)
  } catch {
    return null
  }
  const n = modulos.length
  const quieta = 3 // zona de silêncio, em módulos (4 é a norma; 3 + a moldura clara já basta)
  const passo = Math.max(2, Math.floor(tamanho / (n + quieta * 2)))
  const lado = passo * (n + quieta * 2)
  retangulo(tela, { x, y, largura: lado, altura: lado, raio: 12, cor: CORES.bone })
  const off = x + passo * quieta
  const offY = y + passo * quieta
  for (let l = 0; l < n; l++) {
    for (let c = 0; c < n; c++) {
      if (modulos[l][c]) retangulo(tela, { x: off + c * passo, y: offY + l * passo, largura: passo, altura: passo, cor: CORES.bg })
    }
  }
  return lado
}

// ---- ícones (desenhados, não são emoji) -----------------------------------

function iconePratica(tela, x, y, tam) {
  // frasco de laboratório: gargalo, corpo em V e o líquido âmbar
  const cx = x + tam / 2
  const topo = y + tam * 0.18
  const base = y + tam * 0.82
  const meio = tam * 0.12
  linha(tela, { x1: cx - meio, y1: topo, x2: cx - meio, y2: y + tam * 0.4, cor: CORES.peri, espessura: 3 })
  linha(tela, { x1: cx + meio, y1: topo, x2: cx + meio, y2: y + tam * 0.4, cor: CORES.peri, espessura: 3 })
  linha(tela, { x1: cx - tam * 0.26, y1: topo, x2: cx + tam * 0.26, y2: topo, cor: CORES.peri, espessura: 3 })
  linha(tela, { x1: cx - meio, y1: y + tam * 0.4, x2: cx - tam * 0.34, y2: base, cor: CORES.peri, espessura: 3 })
  linha(tela, { x1: cx + meio, y1: y + tam * 0.4, x2: cx + tam * 0.34, y2: base, cor: CORES.peri, espessura: 3 })
  linha(tela, { x1: cx - tam * 0.34, y1: base, x2: cx + tam * 0.34, y2: base, cor: CORES.peri, espessura: 3 })
  linha(tela, { x1: cx - tam * 0.26, y1: base - tam * 0.12, x2: cx + tam * 0.26, y2: base - tam * 0.12, cor: CORES.amber, espessura: 8 })
  circulo(tela, { x: cx - tam * 0.1, y: base - tam * 0.26, raio: tam * 0.05, cor: CORES.amberSuave })
  circulo(tela, { x: cx + tam * 0.12, y: base - tam * 0.34, raio: tam * 0.035, cor: CORES.amberSuave })
}

function iconeTreino(tela, x, y, tam) {
  // halter: barra no meio, duas anilhas e as travas das pontas
  const cy = y + tam / 2
  linha(tela, { x1: x + tam * 0.24, y1: cy, x2: x + tam * 0.76, y2: cy, cor: CORES.peri, espessura: 6 })
  retangulo(tela, { x: x + tam * 0.16, y: cy - tam * 0.22, largura: tam * 0.12, altura: tam * 0.44, raio: 4, cor: CORES.amber })
  retangulo(tela, { x: x + tam * 0.72, y: cy - tam * 0.22, largura: tam * 0.12, altura: tam * 0.44, raio: 4, cor: CORES.amber })
  retangulo(tela, { x: x + tam * 0.06, y: cy - tam * 0.12, largura: tam * 0.08, altura: tam * 0.24, raio: 3, cor: CORES.peri })
  retangulo(tela, { x: x + tam * 0.86, y: cy - tam * 0.12, largura: tam * 0.08, altura: tam * 0.24, raio: 3, cor: CORES.peri })
}

function iconeCurso(tela, x, y, tam) {
  // livro aberto: duas páginas, a lombada e as linhas de texto
  const cx = x + tam / 2
  const topo = y + tam * 0.22
  const base = y + tam * 0.78
  retangulo(tela, { x: x + tam * 0.12, y: topo, largura: tam * 0.36, altura: base - topo, raio: 4, cor: CORES.surface2, contorno: CORES.peri, espessura: 3 })
  retangulo(tela, { x: cx + tam * 0.02, y: topo, largura: tam * 0.36, altura: base - topo, raio: 4, cor: CORES.surface2, contorno: CORES.peri, espessura: 3 })
  linha(tela, { x1: cx, y1: topo - tam * 0.04, x2: cx, y2: base + tam * 0.04, cor: CORES.amber, espessura: 4 })
  for (let i = 0; i < 3; i++) {
    const ly = topo + tam * 0.14 + i * tam * 0.14
    linha(tela, { x1: x + tam * 0.2, y1: ly, x2: x + tam * 0.4, y2: ly, cor: CORES.periFraco, espessura: 2 })
    linha(tela, { x1: cx + tam * 0.1, y1: ly, x2: cx + tam * 0.3, y2: ly, cor: CORES.periFraco, espessura: 2 })
  }
}

function iconeChama(tela, x, y, tam, cor = CORES.amber) {
  // "ofensiva": chama cheia = círculo da base + bico varrido linha a linha (a silhueta sólida lê
  // muito melhor que um contorno fino no tamanho pequeno do card)
  const cx = x + tam / 2
  const raio = tam * 0.3
  const centro = y + tam * 0.94 - raio
  const bico = y + tam * 0.04
  for (let py = bico; py <= centro; py += 1) {
    const t = (py - bico) / Math.max(1, centro - bico)
    const meia = raio * Math.pow(t, 1.6)
    if (meia < 0.6) continue
    linha(tela, { x1: cx - meia + 0.5, y1: py, x2: cx + meia - 0.5, y2: py, cor, espessura: 1.4 })
  }
  circulo(tela, { x: cx, y: centro, raio, cor })
  circulo(tela, { x: cx, y: centro + raio * 0.2, raio: raio * 0.46, cor: CORES.amberSuave })
}

const ICONES = { pratica: iconePratica, treino: iconeTreino, curso: iconeCurso, licao: iconeCurso, chama: iconeChama }

// ---- cards ----------------------------------------------------------------

/**
 * O card mais importante: o QR da URL do túnel. Aponta a câmera e abre — a URL do quick tunnel
 * muda a cada restart e é impossível de digitar no celular.
 */
export function cardLink(url, { nota = '', t = (s) => s } = {}) {
  const alvo = String(url || '').trim()
  const { tela, limite } = moldura({ etiqueta: 'LINK DO APP', nota })
  const topoQR = 96
  const tamanhoQR = limite - topoQR
  const lado = alvo ? desenharQR(tela, alvo, { x: MARGEM, y: topoQR, tamanho: tamanhoQR }) : null
  if (!lado) {
    // sem túnel (ou QR que não coube): painel vazio no lugar do código, nunca um QR de string vazia
    retangulo(tela, { x: MARGEM, y: topoQR, largura: tamanhoQR, altura: tamanhoQR, raio: 12, cor: CORES.surface, contorno: CORES.linhaForte, espessura: 2 })
    texto(tela, 'sem QR', { x: MARGEM + tamanhoQR / 2, y: topoQR + tamanhoQR / 2 - 20, escala: 3, cor: CORES.fg3, alinhamento: 'centro' })
    texto(tela, 'sem túnel no ar', { x: MARGEM + tamanhoQR / 2, y: topoQR + tamanhoQR / 2 + 10, escala: 2, cor: CORES.fg3, alinhamento: 'centro' })
  }
  const xTexto = MARGEM + (lado || tamanhoQR) + 34
  const larguraTexto = LARGURA - MARGEM - xTexto

  let y = topoQR + 6
  texto(tela, 'Escaneie para', { x: xTexto, y, escala: 4, cor: CORES.bone, negrito: true })
  y += alturaCaixaAlta(4) + 10
  texto(tela, 'abrir no celular', { x: xTexto, y, escala: 4, cor: CORES.bone, negrito: true })
  y += alturaCaixaAlta(4) + 18

  if (alvo) {
    const linhas = quebrarURL(alvo, larguraTexto - 28, 2).slice(0, 4)
    const alturaCaixa = linhas.length * (alturaTexto(2) + 4) + 22
    retangulo(tela, { x: xTexto, y, largura: larguraTexto, altura: alturaCaixa, raio: 12, cor: CORES.surface, contorno: CORES.linha, espessura: 1 })
    let ly = y + 12
    for (const l of linhas) {
      texto(tela, l, { x: xTexto + 14, y: ly, escala: 2, cor: CORES.peri })
      ly += alturaTexto(2) + 4
    }
    y += alturaCaixa + 14
  } else {
    texto(tela, 'sem túnel no ar agora', { x: xTexto, y, escala: 2, cor: CORES.amber })
    y += 34
  }
  if (y + 24 < limite) {
    texto(tela, alvo ? 'o link muda a cada restart do túnel' : 'na LAN o app responde em 127.0.0.1', {
      x: xTexto,
      y,
      escala: 2,
      cor: CORES.fg3,
    })
  }
  return codificarPNG(tela)
}

/** resumo do dia: vencidos, novos, avaliações e a barra da ofensiva */
// `t` é a tradução do servidor (server/i18n.js). Padrão identidade: quem não passa nada continua em PT.
export function cardHoje({ vencidos = 0, novos = 0, avaliacoesHoje = 0, minimoDia = 10, streak = 0, dia = '', t = (s) => s } = {}) {
  const { tela } = moldura({ etiqueta: t('HOJE'), titulo: t('O que estudar agora'), nota: dia })
  const larguraBloco = Math.floor((LARGURA - MARGEM * 2 - 24) / 3)
  const yBlocos = 150
  bloco(tela, { x: MARGEM, y: yBlocos, largura: larguraBloco, valor: vencidos, rotulo: t('termos vencidos'), cor: vencidos ? CORES.amber : CORES.verde })
  bloco(tela, { x: MARGEM + larguraBloco + 12, y: yBlocos, largura: larguraBloco, valor: novos, rotulo: t('termos novos'), cor: CORES.peri })
  bloco(tela, {
    x: MARGEM + (larguraBloco + 12) * 2,
    y: yBlocos,
    largura: larguraBloco,
    valor: `${avaliacoesHoje}/${minimoDia}`,
    rotulo: t('avaliações de hoje'),
    cor: avaliacoesHoje >= minimoDia ? CORES.verde : CORES.bone,
    escalaValor: 5,
  })

  const yBarra = yBlocos + 132
  const falta = Math.max(0, minimoDia - avaliacoesHoje)
  // a chama vai à ESQUERDA do texto da ofensiva, medido: com posição fixa o "12 dias" passa por cima
  const rotuloStreak = `${streak} ${streak === 1 ? t('dia') : t('dias')}`
  const largStreak = medirTexto(rotuloStreak, 3, { negrito: true })
  const xChama = LARGURA - MARGEM - largStreak - 56
  iconeChama(tela, xChama, yBarra - 12, 40, streak > 0 ? CORES.amber : CORES.fg3)
  texto(tela, rotuloStreak, {
    x: LARGURA - MARGEM,
    y: yBarra,
    escala: 3,
    cor: streak > 0 ? CORES.amberSuave : CORES.fg3,
    negrito: true,
    alinhamento: 'direita',
  })
  const rotulo = falta ? `${t('faltam')} ${falta} ${t('avaliações para fechar o dia')}` : t('dia fechado, ofensiva garantida')
  texto(tela, cortarTexto(rotulo, xChama - MARGEM - 20, 2), { x: MARGEM, y: yBarra + 4, escala: 2, cor: falta ? CORES.fg1 : CORES.verde })
  barra(tela, {
    x: MARGEM,
    y: yBarra + 34,
    largura: LARGURA - MARGEM * 2,
    altura: 18,
    pct: minimoDia ? (avaliacoesHoje / minimoDia) * 100 : 0,
    cor: avaliacoesHoje >= minimoDia ? CORES.verde : CORES.amber,
  })
  return codificarPNG(tela)
}

/** ofensiva: número grande, recorde e o histograma dos últimos 28 dias */
export function cardOfensiva({ atual = 0, melhor = 0, ultimos28 = [], minimoDia = 10, t = (s) => s } = {}) {
  const { tela } = moldura({ etiqueta: t('OFENSIVA'), nota: `${t('mínimo')} ${minimoDia} ${t('avaliações por dia')}` })
  const dias = (Array.isArray(ultimos28) ? ultimos28 : []).slice(-28).map((d) => {
    if (d && typeof d === 'object') return Number(d.avaliacoes) || 0
    return Number(d) || 0
  })
  while (dias.length < 28) dias.unshift(0)

  iconeChama(tela, MARGEM, 104, 72, atual > 0 ? CORES.amber : CORES.fg3)
  const xNumero = MARGEM + 84
  texto(tela, String(atual), { x: xNumero, y: 96, escala: 9, cor: atual > 0 ? CORES.amberSuave : CORES.fg2, negrito: true })
  const largNumero = medirTexto(String(atual), 9, { negrito: true })
  texto(tela, atual === 1 ? 'dia seguido' : 'dias seguidos', { x: xNumero + largNumero + 18, y: 120, escala: 3, cor: CORES.fg1 })
  texto(tela, `recorde: ${melhor} dia${melhor === 1 ? '' : 's'}`, { x: xNumero + largNumero + 18, y: 152, escala: 2, cor: CORES.fg3 })

  const yBase = 300
  const alturaMax = 92
  const largBarra = 18
  const vao = Math.floor((LARGURA - MARGEM * 2 - largBarra) / 27)
  const topo = Math.max(minimoDia, ...dias, 1)
  // à direita: à esquerda ele encostaria no número grande da ofensiva
  texto(tela, 'últimos 28 dias', { x: LARGURA - MARGEM, y: yBase - alturaMax - 34, escala: 2, cor: CORES.fg2, alinhamento: 'direita' })
  // linha do mínimo diário: mostra num relance quais dias fecharam
  const yMinimo = yBase - Math.round((minimoDia / topo) * alturaMax)
  linha(tela, { x1: MARGEM, y1: yMinimo, x2: LARGURA - MARGEM, y2: yMinimo, cor: CORES.linhaForte, espessura: 1, opacidade: 0.8 })
  for (let i = 0; i < 28; i++) {
    const v = dias[i]
    const alt = v > 0 ? Math.max(4, Math.round((v / topo) * alturaMax)) : 3
    const x = MARGEM + i * vao
    retangulo(tela, {
      x,
      y: yBase - alt,
      largura: largBarra,
      altura: alt,
      raio: Math.min(5, alt / 2),
      cor: v >= minimoDia ? CORES.verde : v > 0 ? CORES.periFraco : 'rgba(157, 177, 234, 0.14)',
    })
  }
  linha(tela, { x1: MARGEM, y1: yBase + 4, x2: LARGURA - MARGEM, y2: yBase + 4, cor: CORES.linha, espessura: 1 })
  texto(tela, '28 dias atrás', { x: MARGEM, y: yBase + 14, escala: 2, cor: CORES.fg3 })
  texto(tela, 'hoje', { x: LARGURA - MARGEM, y: yBase + 14, escala: 2, cor: CORES.fg3, alinhamento: 'direita' })
  return codificarPNG(tela)
}

/** matriz: uma barra por fase com o % de termos em nível >= 3 */
export function cardMatriz({ fases = [], nota = '', t = (s) => s } = {}) {
  const { tela, y, limite } = moldura({ etiqueta: t('MATRIZ'), titulo: t('Domínio por trilha'), nota })
  const lista = (Array.isArray(fases) ? fases : []).slice(0, 5)
  if (!lista.length) {
    texto(tela, 'sem fases com termos ainda', { x: MARGEM, y: y + 20, escala: 3, cor: CORES.fg2 })
    return codificarPNG(tela)
  }
  const alturaLinha = Math.min(54, Math.floor((limite - y - 6) / lista.length))
  const xBarra = MARGEM + 316
  const largBarra = LARGURA - MARGEM - 78 - xBarra
  const largNome = xBarra - MARGEM - 24
  let ly = y + 4
  for (const f of lista) {
    const pct = Math.max(0, Math.min(100, Math.round(Number(f.pct) || 0)))
    const nome = cortarTexto(String(f.titulo || f.nome || `Fase ${f.numero}`), largNome, 2)
    const detalhe = f.detalhe ? cortarTexto(String(f.detalhe), largNome, 2) : ''
    texto(tela, nome, { x: MARGEM, y: ly, escala: 2, cor: CORES.fg1 })
    if (detalhe) texto(tela, detalhe, { x: MARGEM, y: ly + 22, escala: 2, cor: CORES.fg3 })
    const cor = pct >= 70 ? CORES.verde : pct >= 35 ? CORES.amber : CORES.peri
    barra(tela, { x: xBarra, y: ly + (detalhe ? 9 : 0), largura: largBarra, altura: 20, pct, cor })
    texto(tela, `${pct}%`, { x: LARGURA - MARGEM, y: ly + (detalhe ? 12 : 3), escala: 2, cor, negrito: true, alinhamento: 'direita' })
    ly += alturaLinha
  }
  return codificarPNG(tela)
}

/** cartão da tarefa sugerida: exercício, treino ou lição */
export function cardSugestao({ tipo = 'pratica', titulo = '', subtitulo = '', tempoMin = null, nivel = null, nota = '', t = (s) => s } = {}) {
  const rotuloTipo = { pratica: 'EXERCÍCIO', treino: 'TREINO ESPECIAL', curso: 'LIÇÃO', licao: 'LIÇÃO' }[tipo] || 'SUGESTÃO'
  const { tela, limite } = moldura({ etiqueta: rotuloTipo, nota })
  const tamIcone = 108
  const xIcone = MARGEM
  const yIcone = 104
  retangulo(tela, { x: xIcone, y: yIcone, largura: tamIcone, altura: tamIcone, raio: 20, cor: CORES.surface, contorno: CORES.linhaForte, espessura: 1 })
  const desenhar = ICONES[tipo] || iconePratica
  desenhar(tela, xIcone + 14, yIcone + 14, tamIcone - 28)

  const x = xIcone + tamIcone + 28
  const largura = LARGURA - MARGEM - x
  let y = yIcone - 6
  // título grande só enquanto couber em 2 linhas; passou disso, cai para a escala 3 em até 3 linhas
  const alvo = String(titulo || 'Sem sugestão nova')
  const escalaTitulo = quebrarTexto(alvo, largura, 4, { negrito: true }).length > 2 ? 3 : 4
  const maxLinhas = escalaTitulo === 4 ? 2 : 3
  for (const l of linhasComReticencias(alvo, largura, escalaTitulo, maxLinhas, { negrito: true })) {
    texto(tela, l, { x, y, escala: escalaTitulo, cor: CORES.bone, negrito: true })
    y += alturaCaixaAlta(escalaTitulo) + 9
  }
  if (subtitulo) {
    y += 8
    for (const l of linhasComReticencias(String(subtitulo), largura, 2, 2)) {
      texto(tela, l, { x, y, escala: 2, cor: CORES.fg2 })
      y += alturaTexto(2) + 4
    }
  }
  y = Math.min(y + 14, limite - 40)
  let cx = x
  if (nivel !== null && nivel !== undefined && nivel !== '') cx += chip(tela, { x: cx, y, rotulo: `nível ${nivel}`, cor: CORES.peri })
  if (tempoMin) cx += chip(tela, { x: cx, y, rotulo: `~${tempoMin} min`, cor: CORES.amber })
  chip(tela, { x: cx, y, rotulo: 'abrir no app', cor: CORES.fg2 })
  return codificarPNG(tela)
}

/** progresso de uma temporada (Treino Especial): etapa atual, total e % concluído */
export function cardTreino({ titulo = '', etapaAtual = 0, totalEtapas = 0, pct = 0, nota = '', t = (s) => s } = {}) {
  const { tela, limite } = moldura({ etiqueta: t('TREINO ESPECIAL'), titulo: String(titulo || t('Treino')), nota })
  const p = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)))
  const total = Math.max(0, Number(totalEtapas) || 0)
  const atual = Math.max(0, Math.min(total, Number(etapaAtual) || 0))

  const y = Math.min(limite - 118, 210)
  texto(tela, total ? `etapa ${atual} de ${total}` : 'temporada nova', { x: MARGEM, y, escala: 3, cor: CORES.fg1 })
  texto(tela, `${p}%`, { x: LARGURA - MARGEM, y: y - 18, escala: 7, cor: p >= 100 ? CORES.verde : CORES.amberSuave, negrito: true, alinhamento: 'direita' })

  // trilho segmentado: uma casinha por etapa, as concluídas em verde
  const yTrilho = y + 56
  const largura = LARGURA - MARGEM * 2
  if (total > 0 && total <= 24) {
    const vao = 6
    const largSeg = Math.max(6, Math.floor((largura - vao * (total - 1)) / total))
    for (let i = 0; i < total; i++) {
      retangulo(tela, {
        x: MARGEM + i * (largSeg + vao),
        y: yTrilho,
        largura: largSeg,
        altura: 22,
        raio: 6,
        cor: i < atual ? CORES.verde : CORES.surface2,
        contorno: i === atual ? CORES.amber : CORES.linha,
        espessura: i === atual ? 2 : 1,
      })
    }
  } else {
    barra(tela, { x: MARGEM, y: yTrilho, largura, altura: 22, pct: p, cor: CORES.verde })
  }
  texto(tela, p >= 100 ? 'temporada concluída' : 'continue de onde parou', { x: MARGEM, y: yTrilho + 34, escala: 2, cor: CORES.fg3 })
  return codificarPNG(tela)
}

export default { cardLink, cardHoje, cardOfensiva, cardMatriz, cardSugestao, cardTreino, LARGURA, ALTURA }
