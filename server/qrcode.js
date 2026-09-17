// QR Code em JavaScript puro — versões 1 a 10, correção de erro M, modo byte (UTF-8).
//
// Existe por um motivo só: o card do /link. A URL do quick tunnel muda a cada restart do
// cloudflared e é impossível de digitar no celular ("https://swimming-tail-observations-lynn
// .trycloudflare.com"). Com o QR no Telegram é apontar a câmera e abrir.
//
// O que está aqui, na ordem em que a norma manda fazer:
//   1. corpo de Galois GF(256) com o polinômio 0x11d (tabelas exp/log);
//   2. polinômio gerador de Reed-Solomon e o resto da divisão = os codewords de correção;
//   3. codificação em modo byte + terminador + preenchimento 0xEC/0x11;
//   4. divisão em blocos (grupo 1/grupo 2) e intercalação dados + correção;
//   5. padrões fixos: posicionamento (finder), separadores, alinhamento, timing, módulo escuro;
//   6. as 8 máscaras, a penalidade das 4 regras e a escolha da melhor;
//   7. informação de formato (BCH 15,5) e de versão (BCH 18,6, só da versão 7 para cima).
//
// Escopo de propósito: nível M e modo byte cobrem qualquer URL que este app vá mostrar (213 bytes
// na versão 10). Alfanumérico/numérico dariam mais capacidade, mas custam código que ninguém usaria.
const NIVEL_M = 0b00 // bits do nível de correção M na informação de formato

// versão -> [correção por bloco, blocos do grupo 1, dados por bloco g1, blocos g2, dados por bloco g2]
const BLOCOS_M = {
  1: [10, 1, 16, 0, 0],
  2: [16, 1, 28, 0, 0],
  3: [26, 1, 44, 0, 0],
  4: [18, 2, 32, 0, 0],
  5: [24, 2, 43, 0, 0],
  6: [16, 4, 27, 0, 0],
  7: [18, 4, 31, 0, 0],
  8: [22, 2, 38, 2, 39],
  9: [22, 3, 36, 2, 37],
  10: [26, 4, 43, 1, 44],
}

// centros dos padrões de alinhamento (a combinação de dois a dois, menos os cantos dos finders)
const ALINHAMENTO = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
  10: [6, 28, 50],
}

export const VERSAO_MAX = 10

// ---- GF(256) --------------------------------------------------------------

const EXP = new Uint8Array(512)
const LOG = new Uint8Array(256)
;(() => {
  let x = 1
  for (let i = 0; i < 255; i++) {
    EXP[i] = x
    LOG[x] = i
    x <<= 1
    if (x & 0x100) x ^= 0x11d
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]
})()

function mult(a, b) {
  if (!a || !b) return 0
  return EXP[LOG[a] + LOG[b]]
}

/** polinômio gerador de grau `n` (coeficientes do maior para o menor) */
export function polinomioGerador(n) {
  let g = [1]
  for (let i = 0; i < n; i++) {
    const novo = new Array(g.length + 1).fill(0)
    for (let j = 0; j < g.length; j++) {
      novo[j] ^= g[j]
      novo[j + 1] ^= mult(g[j], EXP[i])
    }
    g = novo
  }
  return g
}

/** codewords de correção de erro de um bloco de dados */
export function correcaoReedSolomon(dados, quantidade) {
  const gen = polinomioGerador(quantidade)
  const resto = new Array(quantidade).fill(0)
  for (const byte of dados) {
    const fator = byte ^ resto[0]
    resto.shift()
    resto.push(0)
    if (fator) {
      for (let i = 0; i < quantidade; i++) resto[i] ^= mult(gen[i + 1], fator)
    }
  }
  return resto
}

// ---- codificação ----------------------------------------------------------

function capacidadeDados(versao) {
  const [ec, b1, d1, b2, d2] = BLOCOS_M[versao]
  void ec
  return b1 * d1 + b2 * d2
}

/** menor versão 1..10 que guarda `n` bytes em modo byte no nível M */
export function versaoParaBytes(n) {
  for (let v = 1; v <= VERSAO_MAX; v++) {
    const bitsContagem = v < 10 ? 8 : 16
    const disponivel = capacidadeDados(v) * 8 - 4 - bitsContagem
    if (n * 8 <= disponivel) return v
  }
  return null
}

function bytesDaMensagem(texto) {
  return Array.from(Buffer.from(String(texto), 'utf8'))
}

function montarCodewords(bytes, versao) {
  const totalDados = capacidadeDados(versao)
  const bitsContagem = versao < 10 ? 8 : 16
  const bits = []
  const empurrar = (valor, n) => {
    for (let i = n - 1; i >= 0; i--) bits.push((valor >> i) & 1)
  }
  empurrar(0b0100, 4) // modo byte
  empurrar(bytes.length, bitsContagem)
  for (const b of bytes) empurrar(b, 8)
  // terminador (até 4 bits) e alinhamento no byte
  const capacidadeBits = totalDados * 8
  for (let i = 0; i < 4 && bits.length < capacidadeBits; i++) bits.push(0)
  while (bits.length % 8 !== 0) bits.push(0)
  const codewords = []
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j]
    codewords.push(b)
  }
  // preenchimento alternado 11101100 / 00010001
  const enchimento = [0xec, 0x11]
  let k = 0
  while (codewords.length < totalDados) codewords.push(enchimento[k++ % 2])
  return codewords
}

/** divide em blocos, calcula a correção e intercala (dados, depois correção) */
function intercalar(codewords, versao) {
  const [ecLen, b1, d1, b2, d2] = BLOCOS_M[versao]
  const blocosDados = []
  const blocosEc = []
  let i = 0
  for (let n = 0; n < b1; n++) {
    const bloco = codewords.slice(i, i + d1)
    i += d1
    blocosDados.push(bloco)
    blocosEc.push(correcaoReedSolomon(bloco, ecLen))
  }
  for (let n = 0; n < b2; n++) {
    const bloco = codewords.slice(i, i + d2)
    i += d2
    blocosDados.push(bloco)
    blocosEc.push(correcaoReedSolomon(bloco, ecLen))
  }
  const saida = []
  const maiorDados = Math.max(d1, d2 || 0)
  for (let c = 0; c < maiorDados; c++) {
    for (const bloco of blocosDados) if (c < bloco.length) saida.push(bloco[c])
  }
  for (let c = 0; c < ecLen; c++) {
    for (const bloco of blocosEc) saida.push(bloco[c])
  }
  return saida
}

// ---- matriz ---------------------------------------------------------------

function grade(tamanho, valor) {
  const g = []
  for (let i = 0; i < tamanho; i++) g.push(new Array(tamanho).fill(valor))
  return g
}

function porFinder(m, reservado, linha, coluna) {
  for (let dl = -1; dl <= 7; dl++) {
    for (let dc = -1; dc <= 7; dc++) {
      const l = linha + dl
      const c = coluna + dc
      if (l < 0 || c < 0 || l >= m.length || c >= m.length) continue
      const borda = dl === -1 || dl === 7 || dc === -1 || dc === 7 // separador
      const anel = dl >= 0 && dl <= 6 && dc >= 0 && dc <= 6 && (dl === 0 || dl === 6 || dc === 0 || dc === 6)
      const miolo = dl >= 2 && dl <= 4 && dc >= 2 && dc <= 4
      m[l][c] = !borda && (anel || miolo)
      reservado[l][c] = true
    }
  }
}

function porAlinhamento(m, reservado, versao) {
  const centros = ALINHAMENTO[versao]
  const ultimo = m.length - 1
  for (const l of centros) {
    for (const c of centros) {
      // os três cantos são ocupados pelos finders
      if ((l === 6 && c === 6) || (l === 6 && c === ultimo - 6) || (l === ultimo - 6 && c === 6)) continue
      for (let dl = -2; dl <= 2; dl++) {
        for (let dc = -2; dc <= 2; dc++) {
          m[l + dl][c + dc] = Math.max(Math.abs(dl), Math.abs(dc)) !== 1
          reservado[l + dl][c + dc] = true
        }
      }
    }
  }
}

function porTiming(m, reservado) {
  for (let i = 8; i < m.length - 8; i++) {
    const escuro = i % 2 === 0
    if (!reservado[6][i]) {
      m[6][i] = escuro
      reservado[6][i] = true
    }
    if (!reservado[i][6]) {
      m[i][6] = escuro
      reservado[i][6] = true
    }
  }
}

function reservarFormato(reservado, versao) {
  const n = reservado.length
  for (let i = 0; i < 9; i++) {
    if (!reservado[8][i] || i === 8) reservado[8][i] = true
    if (!reservado[i][8] || i === 8) reservado[i][8] = true
  }
  for (let i = 0; i < 8; i++) {
    reservado[8][n - 1 - i] = true
    reservado[n - 1 - i][8] = true
  }
  if (versao >= 7) {
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 3; j++) {
        reservado[i][n - 11 + j] = true
        reservado[n - 11 + j][i] = true
      }
    }
  }
}

function colocarDados(m, reservado, codewords) {
  const n = m.length
  const bits = []
  for (const cw of codewords) {
    for (let i = 7; i >= 0; i--) bits.push((cw >> i) & 1)
  }
  let idx = 0
  let subindo = true
  for (let col = n - 1; col > 0; col -= 2) {
    if (col === 6) col -= 1 // a coluna 6 é o timing vertical
    for (let passo = 0; passo < n; passo++) {
      const linha = subindo ? n - 1 - passo : passo
      for (let d = 0; d < 2; d++) {
        const c = col - d
        if (reservado[linha][c]) continue
        m[linha][c] = idx < bits.length ? bits[idx] === 1 : false
        idx += 1
      }
    }
    subindo = !subindo
  }
}

const MASCARAS = [
  (l, c) => (l + c) % 2 === 0,
  (l) => l % 2 === 0,
  (l, c) => c % 3 === 0,
  (l, c) => (l + c) % 3 === 0,
  (l, c) => (Math.floor(l / 2) + Math.floor(c / 3)) % 2 === 0,
  (l, c) => ((l * c) % 2) + ((l * c) % 3) === 0,
  (l, c) => (((l * c) % 2) + ((l * c) % 3)) % 2 === 0,
  (l, c) => (((l + c) % 2) + ((l * c) % 3)) % 2 === 0,
]

function aplicarMascara(m, reservado, mascara) {
  const f = MASCARAS[mascara]
  const saida = m.map((linha) => linha.slice())
  for (let l = 0; l < m.length; l++) {
    for (let c = 0; c < m.length; c++) {
      if (!reservado[l][c] && f(l, c)) saida[l][c] = !saida[l][c]
    }
  }
  return saida
}

/** informação de formato: 5 bits (nível + máscara) + BCH(15,5), com a máscara fixa 0x5412 */
export function bitsFormato(nivel, mascara) {
  const dados = (nivel << 3) | mascara
  let v = dados << 10
  for (let i = 14; i >= 10; i--) {
    if ((v >> i) & 1) v ^= 0x537 << (i - 10)
  }
  return (((dados << 10) | v) ^ 0x5412) & 0x7fff
}

/** informação de versão: 6 bits + BCH(18,6) — só da versão 7 em diante */
export function bitsVersao(versao) {
  let v = versao << 12
  for (let i = 17; i >= 12; i--) {
    if ((v >> i) & 1) v ^= 0x1f25 << (i - 12)
  }
  return ((versao << 12) | v) & 0x3ffff
}

// ARMADILHA: a informação de formato vai para a matriz do bit MAIS significativo para o menos
// (k = 0 é o bit 14). Colocar do LSB para o MSB gera um QR que "parece" certo — finder, timing e
// dados todos no lugar — e nenhum leitor decodifica, porque o formato diz outra máscara.
// A cópia 2 também não é simétrica: 7 módulos na coluna de baixo à esquerda e 8 na linha de cima à
// direita, porque o módulo escuro fixo ocupa (n-8, 8) no meio do caminho.
function escreverFormato(m, mascara) {
  const n = m.length
  const bits = bitsFormato(NIVEL_M, mascara)
  for (let k = 0; k < 15; k++) {
    const b = ((bits >> (14 - k)) & 1) === 1
    // cópia 1 (em volta do finder de cima à esquerda)
    if (k < 6) m[8][k] = b
    else if (k === 6) m[8][7] = b
    else if (k === 7) m[8][8] = b
    else if (k === 8) m[7][8] = b
    else m[14 - k][8] = b
    // cópia 2 (coluna de baixo à esquerda + linha de cima à direita)
    if (k < 7) m[n - 1 - k][8] = b
    else m[8][n - 15 + k] = b
  }
  m[n - 8][8] = true // módulo escuro, sempre
}

function escreverVersao(m, versao) {
  if (versao < 7) return
  const n = m.length
  const bits = bitsVersao(versao)
  for (let i = 0; i < 18; i++) {
    const b = ((bits >> i) & 1) === 1
    const l = Math.floor(i / 3)
    const c = i % 3
    m[l][n - 11 + c] = b
    m[n - 11 + c][l] = b
  }
}

// ---- penalidades ----------------------------------------------------------

function penalidadeSequencias(m) {
  const n = m.length
  let total = 0
  const conta = (pegar) => {
    for (let a = 0; a < n; a++) {
      let atual = pegar(a, 0)
      let tamanho = 1
      for (let b = 1; b < n; b++) {
        const v = pegar(a, b)
        if (v === atual) tamanho += 1
        else {
          if (tamanho >= 5) total += 3 + (tamanho - 5)
          atual = v
          tamanho = 1
        }
      }
      if (tamanho >= 5) total += 3 + (tamanho - 5)
    }
  }
  conta((l, c) => m[l][c])
  conta((c, l) => m[l][c])
  return total
}

function penalidadeBlocos(m) {
  const n = m.length
  let total = 0
  for (let l = 0; l < n - 1; l++) {
    for (let c = 0; c < n - 1; c++) {
      const v = m[l][c]
      if (v === m[l][c + 1] && v === m[l + 1][c] && v === m[l + 1][c + 1]) total += 3
    }
  }
  return total
}

const PADRAO_A = [true, false, true, true, true, false, true, false, false, false, false]
const PADRAO_B = [false, false, false, false, true, false, true, true, true, false, true]

function penalidadePadroes(m) {
  const n = m.length
  let total = 0
  const casa = (pegar, a, b, padrao) => {
    for (let i = 0; i < 11; i++) if (pegar(a, b + i) !== padrao[i]) return false
    return true
  }
  const varrer = (pegar) => {
    for (let a = 0; a < n; a++) {
      for (let b = 0; b <= n - 11; b++) {
        if (casa(pegar, a, b, PADRAO_A)) total += 40
        if (casa(pegar, a, b, PADRAO_B)) total += 40
      }
    }
  }
  varrer((l, c) => m[l][c])
  varrer((c, l) => m[l][c])
  return total
}

function penalidadeProporcao(m) {
  const n = m.length
  let escuros = 0
  for (let l = 0; l < n; l++) for (let c = 0; c < n; c++) if (m[l][c]) escuros += 1
  const pct = (escuros * 100) / (n * n)
  return Math.floor(Math.abs(pct - 50) / 5) * 10
}

export function penalidade(m) {
  return penalidadeSequencias(m) + penalidadeBlocos(m) + penalidadePadroes(m) + penalidadeProporcao(m)
}

// ---- API ------------------------------------------------------------------

/**
 * Gera o QR de `texto` (modo byte, nível M) e devolve tudo o que dá para saber dele.
 * { modulos: boolean[][], tamanho, versao, mascara, penalidade }
 */
export function gerarQR(texto, opcoes = {}) {
  const { versao: versaoForcada = null, mascara: mascaraForcada = null } = opcoes
  const bytes = bytesDaMensagem(texto)
  const versao = versaoForcada || versaoParaBytes(bytes.length)
  if (!versao) {
    throw new Error(`texto grande demais para QR versão ${VERSAO_MAX} nível M (${bytes.length} bytes, máximo 213)`)
  }
  if (!BLOCOS_M[versao]) throw new Error(`versão ${versao} fora do suporte (1 a ${VERSAO_MAX})`)
  const codewords = intercalar(montarCodewords(bytes, versao), versao)

  const tamanho = versao * 4 + 17
  const base = grade(tamanho, false)
  const reservado = grade(tamanho, false)
  porFinder(base, reservado, 0, 0)
  porFinder(base, reservado, 0, tamanho - 7)
  porFinder(base, reservado, tamanho - 7, 0)
  porAlinhamento(base, reservado, versao)
  porTiming(base, reservado)
  reservarFormato(reservado, versao)
  colocarDados(base, reservado, codewords)

  let melhor = null
  const candidatas = mascaraForcada === null ? [0, 1, 2, 3, 4, 5, 6, 7] : [mascaraForcada]
  for (const mascara of candidatas) {
    const m = aplicarMascara(base, reservado, mascara)
    escreverFormato(m, mascara)
    escreverVersao(m, versao)
    const p = penalidade(m)
    if (!melhor || p < melhor.penalidade) melhor = { modulos: m, mascara, penalidade: p }
  }
  return { modulos: melhor.modulos, tamanho, versao, mascara: melhor.mascara, penalidade: melhor.penalidade }
}

/** só a matriz booleana (true = módulo escuro), que é o que o desenho precisa */
export function matrizQR(texto, opcoes = {}) {
  return gerarQR(texto, opcoes).modulos
}

export default matrizQR
