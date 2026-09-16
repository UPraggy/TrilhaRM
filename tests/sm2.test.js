// server/sm2.js — a escala 0-5 do Rafael, o intervalo, a facilidade e a data local.
import assert from 'node:assert/strict'
import test, { describe } from 'node:test'
import { avaliar, estadoInicial, hojeISO, vencido } from '../server/sm2.js'
import { diaLocalManual, diaRelativo } from './_ajuda.mjs'

const HOJE = hojeISO()

describe('hojeISO — data LOCAL, não UTC', () => {
  test('23:59 continua sendo o dia de hoje (o clássico bug de fuso)', () => {
    const d = new Date(2026, 8, 16, 23, 59, 30)
    assert.equal(hojeISO(d), '2026-09-16')
  })

  test('00:00:30 também', () => {
    const d = new Date(2026, 8, 16, 0, 0, 30)
    assert.equal(hojeISO(d), '2026-09-16')
  })

  test('bate com a data local montada à mão em qualquer hora do dia', () => {
    for (const hora of [0, 1, 5, 12, 21, 23]) {
      const d = new Date(2026, 0, 1, hora, 30, 0)
      assert.equal(hojeISO(d), diaLocalManual(d), `falhou às ${hora}h`)
    }
  })
})

describe('avaliar — acerto/erro na escala 0-5', () => {
  for (const nota of [3, 4, 5]) {
    test(`nota ${nota} é acerto`, () => {
      const s = avaliar(undefined, nota, 'quiz')
      assert.equal(s.acertos, 1)
      assert.equal(s.erros, 0)
      assert.equal(s.vistos, 1)
      assert.equal(s.nivel, nota)
    })
  }

  for (const nota of [0, 1, 2]) {
    test(`nota ${nota} é erro`, () => {
      const s = avaliar(undefined, nota, 'quiz')
      assert.equal(s.acertos, 0)
      assert.equal(s.erros, 1)
    })
  }

  test('nota fora da escala é grampeada em 0..5 e arredondada', () => {
    assert.equal(avaliar(undefined, 9, 'quiz').nivel, 5)
    assert.equal(avaliar(undefined, -3, 'quiz').nivel, 0)
    assert.equal(avaliar(undefined, '3', 'quiz').nivel, 3)
    assert.equal(avaliar(undefined, 3.4, 'quiz').nivel, 3)
    assert.equal(avaliar(undefined, undefined, 'quiz').nivel, 0)
  })

  test('nível é média móvel curta depois da primeira vez', () => {
    const a = avaliar(undefined, 5, 'quiz') // nivel 5
    const b = avaliar(a, 2, 'quiz') // (5*2 + 2)/3 = 4
    assert.equal(b.nivel, 4)
    const c = avaliar(b, 0, 'quiz') // (4*2 + 0)/3 = 2.7
    assert.equal(c.nivel, 2.7)
  })

  test('não muta o estado anterior', () => {
    const a = avaliar(undefined, 4, 'quiz')
    const copia = JSON.parse(JSON.stringify(a))
    avaliar(a, 0, 'quiz')
    assert.deepEqual(a, copia)
  })

  test('estadoInicial é o ponto de partida (nunca visto)', () => {
    const s = estadoInicial()
    assert.equal(s.vistos, 0)
    assert.equal(s.facilidade, 2.5)
    assert.equal(s.intervaloDias, 0)
    assert.equal(s.proximaRevisao, null)
  })
})

describe('avaliar — intervalo 1 → 6 → x facilidade', () => {
  test('primeiro acerto = 1 dia, segundo = 6, terceiro = 6 x facilidade', () => {
    const a = avaliar(undefined, 4, 'quiz')
    assert.equal(a.intervaloDias, 1)
    const b = avaliar(a, 4, 'quiz')
    assert.equal(b.intervaloDias, 6)
    const c = avaliar(b, 4, 'quiz')
    assert.equal(c.intervaloDias, Math.round(6 * b.facilidade))
    assert.ok(c.intervaloDias > 6)
  })

  test('nota 0 zera o intervalo: revisar HOJE de novo', () => {
    const agora = new Date()
    const a = avaliar({ ...estadoInicial(), vistos: 3, intervaloDias: 30, facilidade: 2.5 }, 0, 'quiz', undefined, agora)
    assert.equal(a.intervaloDias, 0)
    assert.equal(a.proximaRevisao, hojeISO(agora))
    assert.equal(vencido(a, hojeISO(agora)), true)
  })

  test('notas 1 e 2 voltam o intervalo para 1 dia (não para hoje)', () => {
    for (const nota of [1, 2]) {
      const a = avaliar({ ...estadoInicial(), vistos: 3, intervaloDias: 30 }, nota, 'quiz')
      assert.equal(a.intervaloDias, 1, `nota ${nota}`)
    }
  })

  test('intervalo tem teto de 365 dias', () => {
    const a = avaliar({ ...estadoInicial(), vistos: 9, intervaloDias: 300, facilidade: 3 }, 5, 'quiz')
    assert.equal(a.intervaloDias, 365)
    const b = avaliar({ ...a, vistos: 10 }, 5, 'quiz')
    assert.equal(b.intervaloDias, 365)
  })
})

describe('avaliar — facilidade presa entre 1.3 e 3.0', () => {
  test('piso 1.3 depois de uma sequência de notas 0', () => {
    let s = undefined
    for (let i = 0; i < 10; i += 1) s = avaliar(s, 0, 'quiz')
    assert.equal(s.facilidade, 1.3)
  })

  test('teto 3.0 depois de uma sequência de notas 5', () => {
    let s = undefined
    for (let i = 0; i < 20; i += 1) s = avaliar(s, 5, 'quiz')
    assert.equal(s.facilidade, 3)
  })

  test('nota 4 mantém a facilidade; nota 5 sobe; nota <=2 desce', () => {
    assert.equal(avaliar(undefined, 4, 'quiz').facilidade, 2.5)
    assert.ok(avaliar(undefined, 5, 'quiz').facilidade > 2.5)
    assert.ok(avaliar(undefined, 2, 'quiz').facilidade < 2.5)
  })
})

describe('avaliar — proximaRevisao em data local', () => {
  test('23:30 + 1 dia cai no dia seguinte (não pula um dia)', () => {
    const agora = new Date()
    agora.setHours(23, 30, 0, 0)
    const s = avaliar(undefined, 3, 'quiz', undefined, agora)
    assert.equal(s.intervaloDias, 1)
    assert.equal(s.proximaRevisao, diaRelativo(1, agora))
  })

  test('00:10 + 1 dia também cai no dia seguinte', () => {
    const agora = new Date()
    agora.setHours(0, 10, 0, 0)
    const s = avaliar(undefined, 3, 'quiz', undefined, agora)
    assert.equal(s.proximaRevisao, diaRelativo(1, agora))
  })

  test('6 dias depois do segundo acerto, em data local', () => {
    const agora = new Date()
    agora.setHours(22, 45, 0, 0)
    const a = avaliar(undefined, 4, 'quiz', undefined, agora)
    const b = avaliar(a, 4, 'quiz', undefined, agora)
    assert.equal(b.proximaRevisao, diaRelativo(6, agora))
  })
})

describe('avaliar — respostas do modo explique', () => {
  test('guarda a resposta só no modo explique', () => {
    const a = avaliar(undefined, 4, 'explique', '  minha resposta  ')
    assert.equal(a.respostasExplique.length, 1)
    assert.equal(a.respostasExplique[0].texto, 'minha resposta')
    assert.equal(a.respostasExplique[0].nota, 4)
    assert.equal(a.respostasExplique[0].dia, HOJE)
    const b = avaliar(a, 4, 'quiz', 'texto qualquer')
    assert.equal(b.respostasExplique.length, 1)
  })

  test('resposta em branco não vira registro', () => {
    const a = avaliar(undefined, 4, 'explique', '   ')
    assert.equal(a.respostasExplique.length, 0)
  })

  test('guarda no máximo as 10 últimas', () => {
    let s = undefined
    for (let i = 0; i < 15; i += 1) s = avaliar(s, 4, 'explique', `resposta ${i}`)
    assert.equal(s.respostasExplique.length, 10)
    assert.equal(s.respostasExplique[9].texto, 'resposta 14')
  })
})

describe('vencido', () => {
  test('termo nunca visto está vencido', () => {
    assert.equal(vencido(undefined), true)
    assert.equal(vencido(null), true)
    assert.equal(vencido(estadoInicial()), true)
    assert.equal(vencido({ proximaRevisao: null }), true)
  })

  test('hoje e ontem estão vencidos; amanhã não', () => {
    assert.equal(vencido({ proximaRevisao: HOJE }, HOJE), true)
    assert.equal(vencido({ proximaRevisao: diaRelativo(-1) }, HOJE), true)
    assert.equal(vencido({ proximaRevisao: diaRelativo(1) }, HOJE), false)
  })

  test('um acerto de hoje não vence hoje', () => {
    const s = avaliar(undefined, 4, 'quiz')
    assert.equal(vencido(s, HOJE), false)
  })
})
