// server/qrcode.js — QR versões 1-10, nível M, modo byte.
//
// Os valores "de fora" deste teste (polinômio gerador de grau 10, informação de formato, informação
// de versão e a matriz inteira de uma URL) são os da norma ISO/IEC 18004 — os mesmos que a
// biblioteca qrcode-generator produz. A matriz completa em MATRIZ_REFERENCIA foi conferida módulo a
// módulo contra essa biblioteca e o PNG correspondente foi decodificado pelo jsQR.
import assert from 'node:assert/strict'
import test, { describe } from 'node:test'
import { bitsFormato, bitsVersao, correcaoReedSolomon, gerarQR, matrizQR, penalidade, polinomioGerador, versaoParaBytes } from '../server/qrcode.js'

const URL_REFERENCIA = 'http://127.0.0.1:8790/'
const MATRIZ_REFERENCIA = [
  '#######.#.###...#.#######',
  '#.....#.#..#.##...#.....#',
  '#.###.#.#....#..#.#.###.#',
  '#.###.#..#######..#.###.#',
  '#.###.#.#.#.......#.###.#',
  '#.....#..#.####...#.....#',
  '#######.#.#.#.#.#.#######',
  '.........###.#...........',
  '#..######.##...#.#..#.###',
  '.#####..###.##.###..####.',
  '#.#..###.#.#..##..#..#..#',
  '#.###..#......##.....####',
  '.#.##.####.#..#.###.....#',
  '#.##.#.#.#..##.#...##..#.',
  '###...###.#..#.###...####',
  '#.##.#....#.#.#.#...#.#.#',
  '#.###.###..##########.##.',
  '........#..#.#.##...#..#.',
  '#######.###.#...#.#.##..#',
  '#.....#.##.#.#..#...#....',
  '#.###.#.#.##.#.#######.##',
  '#.###.#.#...###...##.#.##',
  '#.###.#...##.#..#...#.###',
  '#.....#..#.###...####.###',
  '#######.#..###.####..#..#',
]

const desenhar = (m) => m.map((l) => l.map((b) => (b ? '#' : '.')).join(''))

describe('Reed-Solomon sobre GF(256)', () => {
  test('polinômio gerador de grau 10 é o da norma', () => {
    assert.deepEqual(polinomioGerador(10), [1, 216, 194, 159, 111, 199, 94, 95, 113, 157, 193])
  })

  test('o gerador tem grau n e começa em 1', () => {
    for (const n of [7, 10, 16, 18, 22, 24, 26]) {
      const g = polinomioGerador(n)
      assert.equal(g.length, n + 1)
      assert.equal(g[0], 1)
    }
  })

  test('a correção tem exatamente o tamanho pedido e cabe em um byte', () => {
    const ec = correcaoReedSolomon([32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17], 10)
    assert.equal(ec.length, 10)
    for (const b of ec) assert.ok(Number.isInteger(b) && b >= 0 && b <= 255)
  })

  test('dado só de zeros não gera correção nenhuma (propriedade do resto)', () => {
    assert.deepEqual(correcaoReedSolomon(new Array(16).fill(0), 10), new Array(10).fill(0))
  })
})

describe('informação de formato e de versão (BCH)', () => {
  test('formato do nível L máscara 0 bate com a tabela da norma', () => {
    assert.equal(bitsFormato(0b01, 0), 0b111011111000100)
  })

  test('formato do nível M máscara 6 bate com o QR de referência', () => {
    assert.equal(bitsFormato(0b00, 6), 0b100111110010111)
  })

  test('informação de versão 7 a 10 bate com a tabela da norma', () => {
    assert.equal(bitsVersao(7), 0x07c94)
    assert.equal(bitsVersao(8), 0x085bc)
    assert.equal(bitsVersao(9), 0x09a99)
    assert.equal(bitsVersao(10), 0x0a4d3)
  })
})

describe('capacidade', () => {
  test('a versão mínima acompanha o tamanho do texto', () => {
    assert.equal(versaoParaBytes(1), 1)
    assert.equal(versaoParaBytes(14), 1)
    assert.equal(versaoParaBytes(15), 2)
    assert.equal(versaoParaBytes(26), 2)
    assert.equal(versaoParaBytes(27), 3)
    assert.equal(versaoParaBytes(213), 10)
  })

  test('acima de 213 bytes não existe versão (o limite do nosso escopo 1-10)', () => {
    assert.equal(versaoParaBytes(214), null)
    assert.throws(() => matrizQR('x'.repeat(214)), /grande demais/)
  })

  test('acento conta como 2 bytes (UTF-8), não como 1 caractere', () => {
    assert.equal(gerarQR('a'.repeat(14)).versao, 1)
    assert.equal(gerarQR('á'.repeat(8)).versao, 2) // 16 bytes
  })
})

describe('matriz', () => {
  test('o tamanho é 4v+17 em todas as versões de 1 a 10', () => {
    for (let v = 1; v <= 10; v++) {
      const m = matrizQR('x'.repeat(10), { versao: v })
      assert.equal(m.length, v * 4 + 17)
      assert.equal(m[0].length, v * 4 + 17)
    }
  })

  test('os três padrões de posicionamento estão nos cantos certos', () => {
    const m = matrizQR('https://trilha.rm/')
    const n = m.length
    const finder = (l0, c0) => {
      for (let l = 0; l < 7; l++) {
        for (let c = 0; c < 7; c++) {
          const anel = l === 0 || l === 6 || c === 0 || c === 6
          const miolo = l >= 2 && l <= 4 && c >= 2 && c <= 4
          assert.equal(m[l0 + l][c0 + c], anel || miolo, `finder (${l0},${c0}) errado em ${l},${c}`)
        }
      }
    }
    finder(0, 0)
    finder(0, n - 7)
    finder(n - 7, 0)
    assert.equal(m[7][7], false, 'separador do finder de cima à esquerda')
  })

  test('os padrões de tempo alternam a partir do módulo 8', () => {
    const m = matrizQR('https://trilha.rm/')
    for (let i = 8; i < m.length - 8; i++) {
      assert.equal(m[6][i], i % 2 === 0, `timing horizontal em ${i}`)
      assert.equal(m[i][6], i % 2 === 0, `timing vertical em ${i}`)
    }
  })

  test('o módulo escuro fixo está aceso', () => {
    const m = matrizQR('https://trilha.rm/')
    assert.equal(m[m.length - 8][8], true)
  })

  test('bate módulo a módulo com o QR de referência da URL local', () => {
    const q = gerarQR(URL_REFERENCIA)
    assert.equal(q.versao, 2)
    assert.equal(q.mascara, 6, 'a máscara é escolhida pela penalidade — mudou a conta, mudou o QR')
    assert.deepEqual(desenhar(q.modulos), MATRIZ_REFERENCIA)
  })

  test('mesma entrada, mesma saída (nada de aleatório no meio)', () => {
    assert.deepEqual(matrizQR(URL_REFERENCIA), matrizQR(URL_REFERENCIA))
  })

  test('a máscara escolhida é a de menor penalidade', () => {
    const texto = 'https://swimming-tail-observations-lynn.trycloudflare.com/estudar/misto?fonte=revisao'
    const escolhida = gerarQR(texto)
    for (let mk = 0; mk < 8; mk++) {
      const forcada = gerarQR(texto, { mascara: mk })
      assert.ok(escolhida.penalidade <= forcada.penalidade, `máscara ${mk} penaliza menos que a escolhida`)
    }
  })

  test('penalidade cresce num campo todo escuro (regra do 50%)', () => {
    const cheio = []
    for (let i = 0; i < 21; i++) cheio.push(new Array(21).fill(true))
    const normal = gerarQR(URL_REFERENCIA)
    assert.ok(penalidade(cheio) > normal.penalidade)
  })

  test('URL do túnel e URL local geram versões diferentes, ambas dentro de 1-10', () => {
    const local = gerarQR('http://127.0.0.1:8790/')
    const tunel = gerarQR('https://swimming-tail-observations-lynn.trycloudflare.com/estudar/misto?fonte=revisao')
    assert.equal(local.versao, 2)
    assert.equal(tunel.versao, 6)
    for (const q of [local, tunel]) {
      assert.ok(q.versao >= 1 && q.versao <= 10)
      assert.equal(q.tamanho, q.versao * 4 + 17)
    }
  })
})
