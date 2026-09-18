// As regras de XP e coroas (server/xp.js). São funções puras de propósito: dá para testar o
// comportamento inteiro sem servidor, sem arquivo e sem relógio.
import test, { describe } from 'node:test'
import assert from 'node:assert/strict'
import { BONUS_NO_NOVO, META_XP_DIA, PESOS, coroas, faltaParaMeta, resultadoLicao, xpDoItem } from '../server/xp.js'

describe('xpDoItem — peso por tipo', () => {
  test('item com nota é proporcional à nota', () => {
    assert.equal(xpDoItem({ tipo: 'termo', nota: 5 }), PESOS.termo)
    assert.equal(xpDoItem({ tipo: 'termo', nota: 3 }), 6) // 10 * 3/5
    assert.equal(xpDoItem({ tipo: 'exercicio', nota: 5 }), PESOS.exercicio)
  })

  test('nota zero ainda dá 1 — tentar vale mais que não aparecer', () => {
    assert.equal(xpDoItem({ tipo: 'termo', nota: 0 }), 1)
  })

  test('nota fora da escala é aparada em 0..5', () => {
    assert.equal(xpDoItem({ tipo: 'termo', nota: 99 }), PESOS.termo)
    assert.equal(xpDoItem({ tipo: 'termo', nota: -3 }), 1)
  })

  test('item sem nota: peso cheio no acerto, 20 % no erro', () => {
    assert.equal(xpDoItem({ tipo: 'leitura', acertou: true }), PESOS.leitura)
    assert.equal(xpDoItem({ tipo: 'leitura', acertou: false }), Math.max(1, Math.round(PESOS.leitura * 0.2)))
  })

  test('tipo desconhecido cai no peso de termo em vez de dar NaN', () => {
    assert.equal(xpDoItem({ tipo: 'inventado', acertou: true }), PESOS.termo)
    assert.equal(xpDoItem({}), Math.max(1, Math.round(PESOS.termo * 0.2)))
  })

  /**
   * `Number(null) === 0` já mordeu duas vezes nesta casa (nota nula virando "desconheço", saldo não
   * lido virando zero confirmado). Aqui a guarda é `typeof nota === 'number'`: nota nula NÃO é nota
   * zero — é ausência de nota, e cai na regra de acertou/errou.
   */
  test('nota null/undefined não vira nota zero', () => {
    assert.equal(xpDoItem({ tipo: 'termo', nota: null, acertou: true }), PESOS.termo, 'null com acerto = peso cheio')
    assert.equal(xpDoItem({ tipo: 'termo', nota: undefined, acertou: true }), PESOS.termo)
    assert.equal(xpDoItem({ tipo: 'termo', nota: NaN, acertou: true }), PESOS.termo, 'NaN também não é nota')
    assert.notEqual(xpDoItem({ tipo: 'termo', nota: null, acertou: true }), xpDoItem({ tipo: 'termo', nota: 0 }))
  })
})

describe('resultadoLicao — o fechamento da sessão', () => {
  const itens = [
    { tipo: 'termo', nota: 5 },
    { tipo: 'termo', nota: 3 },
    { tipo: 'termo', nota: 1 },
    { tipo: 'leitura', acertou: true },
  ]

  test('soma o XP de todos os itens', () => {
    const r = resultadoLicao(itens)
    assert.equal(r.xp, 10 + 6 + 2 + 6)
  })

  test('acerto é nota >= 3 (a régua "aplico") ou acertou explícito', () => {
    const r = resultadoLicao(itens)
    assert.equal(r.acertos, 3, 'notas 5 e 3 contam; nota 1 não; leitura acertada conta')
    assert.equal(r.total, 4)
    assert.equal(r.pct, 75)
  })

  test('bônus de primeira vez entra só quando há item', () => {
    assert.equal(resultadoLicao(itens, { primeiraVez: true }).xp, resultadoLicao(itens).xp + BONUS_NO_NOVO)
    assert.equal(resultadoLicao([], { primeiraVez: true }).xp, 0, 'lição vazia não ganha bônus')
  })

  test('entrada inválida não explode', () => {
    for (const entrada of [null, undefined, 'nada', 42]) {
      const r = resultadoLicao(entrada)
      assert.deepEqual({ xp: r.xp, total: r.total, pct: r.pct }, { xp: 0, total: 0, pct: 0 })
    }
  })
})

describe('coroas', () => {
  test('é o nível médio arredondado para baixo, preso em 0..5', () => {
    assert.equal(coroas(0), 0)
    assert.equal(coroas(2.9), 2)
    assert.equal(coroas(3.0), 3)
    assert.equal(coroas(5), 5)
    assert.equal(coroas(9), 5, 'não passa de 5')
    assert.equal(coroas(-1), 0, 'não fica negativo')
  })

  test('valor não numérico vira zero em vez de NaN na tela', () => {
    for (const v of [null, undefined, 'x', NaN]) assert.equal(coroas(v), 0)
  })
})

describe('faltaParaMeta', () => {
  test('conta quanto falta e marca quando fechou', () => {
    const a = faltaParaMeta(20)
    assert.equal(a.meta, META_XP_DIA)
    assert.equal(a.falta, META_XP_DIA - 20)
    assert.equal(a.fechou, false)

    const b = faltaParaMeta(META_XP_DIA)
    assert.equal(b.falta, 0)
    assert.equal(b.fechou, true)
    assert.equal(b.pct, 100)
  })

  test('passar da meta não vira falta negativa nem pct acima de 100', () => {
    const r = faltaParaMeta(META_XP_DIA * 3)
    assert.equal(r.falta, 0)
    assert.equal(r.pct, 100)
  })

  test('xp inválido conta como zero', () => {
    assert.equal(faltaParaMeta(null).feito, 0)
    assert.equal(faltaParaMeta('abc').feito, 0)
  })
})
