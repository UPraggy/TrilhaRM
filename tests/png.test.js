// server/png.js — encoder PNG, primitivas de desenho e a fonte bitmap.
// O teste decodifica o PNG de volta (assinatura, chunks, CRC, zlib) e olha os pixels: é a única
// forma de garantir que o arquivo que o Telegram recebe é um PNG válido de verdade.
import assert from 'node:assert/strict'
import zlib from 'node:zlib'
import test, { describe } from 'node:test'
import {
  ASSINATURA_PNG,
  alturaCaixaAlta,
  alturaTexto,
  codificarPNG,
  corRGBA,
  cortarTexto,
  crc32,
  criarTela,
  decodificarPNG,
  gradiente,
  lerPixel,
  linha,
  medirTexto,
  misturarCores,
  preencher,
  quebrarTexto,
  retangulo,
  texto,
} from '../server/png.js'

describe('cores', () => {
  test('hex de 6, de 3 e com alfa', () => {
    assert.deepEqual(corRGBA('#9db1ea'), [157, 177, 234, 1])
    assert.deepEqual(corRGBA('#abc'), [170, 187, 204, 1])
    assert.deepEqual(corRGBA('#00000080'), [0, 0, 0, 128 / 255])
  })

  test('rgba() e array', () => {
    assert.deepEqual(corRGBA('rgba(10, 20, 30, 0.5)'), [10, 20, 30, 0.5])
    assert.deepEqual(corRGBA([1, 2, 3, 0.25]), [1, 2, 3, 0.25])
  })

  test('misturarCores caminha do a para o b', () => {
    assert.deepEqual(misturarCores('#000000', '#ffffff', 0).slice(0, 3), [0, 0, 0])
    assert.deepEqual(misturarCores('#000000', '#ffffff', 1).slice(0, 3), [255, 255, 255])
    assert.deepEqual(misturarCores('#000000', '#ffffff', 0.5).slice(0, 3), [128, 128, 128])
  })
})

describe('CRC-32', () => {
  test('vetores conhecidos', () => {
    assert.equal(crc32(Buffer.from('')), 0)
    assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926)
    assert.equal(crc32(Buffer.from('IEND')), 0xae426082) // o CRC do chunk IEND vazio do PNG
  })
})

describe('codificarPNG', () => {
  const tela = criarTela(12, 7, '#0a0c12')

  test('assinatura e ordem dos chunks', () => {
    const png = codificarPNG(tela)
    assert.ok(ASSINATURA_PNG.equals(png.subarray(0, 8)))
    assert.equal(png.toString('latin1', 12, 16), 'IHDR')
    assert.ok(png.includes(Buffer.from('IDAT')))
    assert.equal(png.toString('latin1', png.length - 8, png.length - 4), 'IEND')
  })

  test('IHDR descreve 8 bits RGBA sem entrelaçamento', () => {
    const png = codificarPNG(tela)
    assert.equal(png.readUInt32BE(16), 12) // largura
    assert.equal(png.readUInt32BE(20), 7) // altura
    assert.equal(png[24], 8) // profundidade
    assert.equal(png[25], 6) // RGBA
    assert.equal(png[28], 0) // sem entrelaçamento
  })

  test('todo CRC confere (decodificarPNG estoura se não conferir)', () => {
    const lido = decodificarPNG(codificarPNG(tela))
    assert.equal(lido.largura, 12)
    assert.equal(lido.altura, 7)
    assert.equal(lido.tipoCor, 6)
  })

  test('cada linha começa com o byte de filtro 0', () => {
    const png = codificarPNG(tela)
    const inicio = png.indexOf(Buffer.from('IDAT')) + 4
    const tamanho = png.readUInt32BE(inicio - 8)
    const cru = zlib.inflateSync(png.subarray(inicio, inicio + tamanho))
    assert.equal(cru.length, (12 * 4 + 1) * 7)
    for (let y = 0; y < 7; y++) assert.equal(cru[y * (12 * 4 + 1)], 0, `linha ${y} com filtro != 0`)
  })

  test('os pixels voltam com a cor que foram pintados', () => {
    const t = criarTela(4, 2, '#112233')
    const lido = decodificarPNG(codificarPNG(t))
    assert.deepEqual(lerPixel(lido.tela, 0, 0), [17, 34, 51, 255])
    assert.deepEqual(lerPixel(lido.tela, 3, 1), [17, 34, 51, 255])
  })
})

describe('formas', () => {
  test('retângulo pinta dentro e não pinta fora', () => {
    const t = criarTela(40, 20, '#000000')
    retangulo(t, { x: 10, y: 5, largura: 10, altura: 8, cor: '#ff0000' })
    assert.deepEqual(lerPixel(t, 14, 8), [255, 0, 0, 255])
    assert.deepEqual(lerPixel(t, 2, 2), [0, 0, 0, 255])
    assert.deepEqual(lerPixel(t, 39, 19), [0, 0, 0, 255])
  })

  test('canto arredondado deixa o canto do retângulo livre', () => {
    const t = criarTela(30, 30, '#000000')
    retangulo(t, { x: 0, y: 0, largura: 30, altura: 30, raio: 10, cor: '#ffffff' })
    assert.deepEqual(lerPixel(t, 0, 0), [0, 0, 0, 255], 'o canto deveria continuar escuro')
    assert.deepEqual(lerPixel(t, 15, 15), [255, 255, 255, 255])
  })

  test('opacidade mistura com o fundo em vez de trocar a cor', () => {
    const t = criarTela(10, 10, '#000000')
    retangulo(t, { x: 0, y: 0, largura: 10, altura: 10, cor: '#ffffff', opacidade: 0.5 })
    const [r, , , a] = lerPixel(t, 5, 5)
    assert.equal(a, 255)
    assert.ok(r > 100 && r < 160, `esperava cinza no meio, veio ${r}`)
  })

  test('linha diagonal acende os dois extremos', () => {
    const t = criarTela(20, 20, '#000000')
    linha(t, { x1: 2, y1: 2, x2: 17, y2: 17, cor: '#00ff00', espessura: 3 })
    assert.ok(lerPixel(t, 2, 2)[1] > 80)
    assert.ok(lerPixel(t, 17, 17)[1] > 80)
    assert.equal(lerPixel(t, 18, 2)[1], 0)
  })

  test('gradiente varia de uma ponta à outra', () => {
    const t = criarTela(60, 10, '#000000')
    gradiente(t, { x: 0, y: 0, largura: 60, altura: 10, de: '#000000', para: '#ffffff', angulo: 0 })
    const esquerda = lerPixel(t, 1, 5)[0]
    const meio = lerPixel(t, 30, 5)[0]
    const direita = lerPixel(t, 58, 5)[0]
    assert.ok(esquerda < meio && meio < direita, `esperava crescente, veio ${esquerda}/${meio}/${direita}`)
  })

  test('preencher troca a tela inteira', () => {
    const t = criarTela(5, 5, '#ffffff')
    preencher(t, '#123456')
    assert.deepEqual(lerPixel(t, 4, 4), [18, 52, 86, 255])
  })
})

describe('fonte', () => {
  test('medirTexto cresce com o tamanho do texto e com a escala', () => {
    assert.ok(medirTexto('ab', 2) > medirTexto('a', 2))
    assert.equal(medirTexto('', 2), 0)
    assert.ok(medirTexto('abc', 4) > medirTexto('abc', 2))
  })

  test('negrito é mais largo que o normal', () => {
    assert.ok(medirTexto('Trilha RM', 2, { negrito: true }) > medirTexto('Trilha RM', 2))
  })

  test('altura da caixa e da caixa alta batem com a escala', () => {
    assert.equal(alturaTexto(3), 27)
    assert.equal(alturaCaixaAlta(3), 21)
  })

  test('desenha dentro da largura medida (nada vaza para a direita)', () => {
    const escala = 3
    const frase = 'Ofensiva 12'
    const largura = medirTexto(frase, escala)
    const t = criarTela(largura + 40, alturaTexto(escala) + 10, '#000000')
    texto(t, frase, { x: 10, y: 2, escala, cor: '#ffffff' })
    let acesos = 0
    for (let x = 10 + largura + 1; x < t.largura; x++) {
      for (let y = 0; y < t.altura; y++) if (lerPixel(t, x, y)[0] > 0) acesos += 1
    }
    assert.equal(acesos, 0, 'texto passou da largura que medirTexto prometeu')
  })

  test('alinhamento à direita termina onde o x manda', () => {
    const t = criarTela(200, 30, '#000000')
    texto(t, 'fim', { x: 150, y: 5, escala: 2, cor: '#ffffff', alinhamento: 'direita' })
    let ultimo = 0
    for (let x = 0; x < 200; x++) {
      for (let y = 0; y < 30; y++) if (lerPixel(t, x, y)[0] > 0) ultimo = Math.max(ultimo, x)
    }
    assert.ok(ultimo <= 150 && ultimo > 130, `última coluna acesa: ${ultimo}`)
  })

  test('acentuadas e maiúsculas acentuadas têm glifo próprio (não caem no ?)', () => {
    const t = criarTela(60, 20, '#000000')
    const pixels = (ch) => {
      preencher(t, '#000000')
      texto(t, ch, { x: 4, y: 4, escala: 2, cor: '#ffffff' })
      let n = 0
      for (let x = 0; x < 60; x++) for (let y = 0; y < 20; y++) if (lerPixel(t, x, y)[0] > 0) n += 1
      return n
    }
    for (const [base, acentuada] of [['a', 'á'], ['e', 'ê'], ['o', 'õ'], ['c', 'ç'], ['I', 'Í'], ['A', 'Ã'], ['C', 'Ç']]) {
      assert.ok(pixels(acentuada) > pixels(base), `${acentuada} não ganhou pixels em cima de ${base}`)
    }
  })

  test('quebrarTexto respeita a largura máxima', () => {
    const linhas = quebrarTexto('quebrar um monólito em dois serviços sem parar a operação', 120, 2)
    assert.ok(linhas.length > 1)
    for (const l of linhas) assert.ok(medirTexto(l, 2) <= 120, `linha larga demais: ${l}`)
  })

  test('quebrarTexto corta palavra que não cabe em linha nenhuma', () => {
    const linhas = quebrarTexto('https://swimming-tail-observations-lynn.trycloudflare.com', 80, 2)
    assert.ok(linhas.length > 1)
    for (const l of linhas) assert.ok(medirTexto(l, 2) <= 80)
    assert.equal(linhas.join(''), 'https://swimming-tail-observations-lynn.trycloudflare.com')
  })

  test('cortarTexto devolve algo que cabe e marca o corte', () => {
    const curto = cortarTexto('Fase 1 · Fundamentos da engenharia', 100, 2)
    assert.ok(medirTexto(curto, 2) <= 100)
    assert.ok(curto.endsWith('...'))
    assert.equal(cortarTexto('ok', 100, 2), 'ok')
  })
})
