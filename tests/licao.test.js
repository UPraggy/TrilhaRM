// As regras que montam a LIÇÃO e a ESTRUTURA. Tudo aqui é função pura exportada de propósito
// (server/licao.js e server/estrutura.js), para poder ser testado sem servidor e sem conteúdo real.
import test, { describe } from 'node:test'
import assert from 'node:assert/strict'
import { escolherModo, faixaDe, hash, lacunaDe, modoCabe, MODOS_POR_NIVEL, ordenarTermos, sequenciaDe } from '../server/licao.js'
import { contarNos, coroasDe, distribuir, MAX_NOS, TERMOS_POR_NO } from '../server/estrutura.js'

const TERMO = {
  id: 'circuit-breaker',
  termo: 'Circuit breaker',
  definicao: 'Depois de N falhas, parar de chamar a dependência por um tempo e falhar imediatamente. Protege quem chama.',
  profundidade:
    'Três estados: (1) fechado, passa tudo contando falhas; (2) aberto, falha na hora sem chamar; (3) meio-aberto, deixa passar UMA chamada de teste.',
  exemplo: 'x'.repeat(80),
  perguntaEntrevista: 'Quem o circuit breaker protege?',
  relacionados: ['timeout', 'fallback'],
}

describe('distribuir — reparte os itens entre os nós', () => {
  test('divide o mais uniformemente possível, na ordem', () => {
    assert.deepEqual(distribuir([1, 2, 3, 4, 5], 2), [[1, 2, 3], [4, 5]])
    assert.deepEqual(distribuir([1, 2, 3, 4], 4), [[1], [2], [3], [4]])
  })

  test('mais baldes que itens: os últimos ficam vazios, e não undefined', () => {
    assert.deepEqual(distribuir([1], 3), [[1], [], []])
  })

  test('sem itens devolve baldes vazios, nunca null', () => {
    assert.deepEqual(distribuir([], 2), [[], []])
    assert.deepEqual(distribuir(null, 2), [[], []])
  })

  test('não perde nem duplica item', () => {
    const itens = Array.from({ length: 37 }, (_, i) => i)
    for (const n of [1, 2, 5, 8, 12]) {
      const baldes = distribuir(itens, n)
      assert.deepEqual(baldes.flat(), itens, `n=${n} precisa preservar tudo, na ordem`)
    }
  })
})

describe('contarNos — quantas lições um módulo tem', () => {
  test('quem manda é o vocabulário', () => {
    assert.equal(contarNos({ totalTermos: 30, totalLeituras: 0 }), Math.ceil(30 / TERMOS_POR_NO))
    assert.equal(contarNos({ totalTermos: 22, totalLeituras: 0 }), 4)
  })

  test('as leituras do curso são um piso, de duas em duas', () => {
    assert.equal(contarNos({ totalTermos: 6, totalLeituras: 9 }), 5, '9 leituras => 5 nós, mesmo com poucos termos')
  })

  /**
   * ⚠️ Regressão: exercício NÃO pode criar nó. Quando criava, um módulo de 22 termos com 6 exercícios
   * virava 6 nós de ~3 termos, e a lição ficava com 4 itens em vez dos 8-12 do plano.
   */
  test('exercício não cria nó', () => {
    assert.equal(
      contarNos({ totalTermos: 22, totalLeituras: 0, totalExercicios: 6 }),
      contarNos({ totalTermos: 22, totalLeituras: 0 }),
    )
  })

  test('nunca devolve zero, nem passa do teto', () => {
    assert.equal(contarNos({ totalTermos: 0, totalLeituras: 0 }), 1)
    assert.equal(contarNos({ totalTermos: 5000, totalLeituras: 0 }), MAX_NOS)
  })
})

describe('coroasDe — o nível médio do módulo', () => {
  const termos = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]

  test('termo nunca visto conta ZERO — é o que ele sabe hoje, não o que já estudou', () => {
    const estados = { 'd1/a': { nivel: 4 }, 'd1/b': { nivel: 4 } }
    const r = coroasDe(termos, estados, 'd1')
    assert.equal(r.vistos, 2)
    assert.equal(r.total, 4)
    assert.equal(r.nivelMedio, 2, '(4+4+0+0)/4 — não (4+4)/2')
    assert.equal(r.coroas, 2)
  })

  test('módulo sem termo não estoura', () => {
    assert.deepEqual(coroasDe([], {}, 'd1'), { nivelMedio: 0, coroas: 0, vistos: 0, total: 0 })
  })

  test('estado com nível inválido é ignorado em vez de virar NaN', () => {
    const r = coroasDe(termos, { 'd1/a': { nivel: null }, 'd1/b': { nivel: 'x' }, 'd1/c': { nivel: 5 } }, 'd1')
    assert.equal(r.vistos, 1)
    assert.equal(r.nivelMedio, 1.25)
  })
})

describe('ordenarTermos — vencidos primeiro', () => {
  const hoje = '2026-09-18'
  const termos = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]
  const estados = {
    'd1/a': { nivel: 4, proximaRevisao: '2026-12-01' }, // em dia
    'd1/b': { nivel: 2, proximaRevisao: '2026-09-10' }, // VENCIDO
    'd1/d': { nivel: 1, proximaRevisao: '2026-12-01' }, // em dia, nível baixo
    // 'c' nunca visto
  }

  test('a ordem é: vencido, novo, e depois por nível crescente', () => {
    const ordem = ordenarTermos(termos, estados, 'd1', hoje).map((t) => t.id)
    assert.equal(ordem[0], 'b', 'o vencido vem primeiro — é a promessa do SM-2')
    assert.equal(ordem[1], 'c', 'depois o nunca visto')
    assert.deepEqual(ordem.slice(2), ['d', 'a'], 'por último os em dia, do nível mais baixo para o mais alto')
  })

  test('não perde termo', () => {
    assert.equal(ordenarTermos(termos, estados, 'd1', hoje).length, termos.length)
  })
})

describe('lacunaDe — a lacuna sai do próprio conteúdo', () => {
  test('apaga uma palavra e devolve a resposta', () => {
    const l = lacunaDe(TERMO)
    assert.ok(l, 'deveria montar')
    assert.ok(l.texto.includes('______'))
    assert.ok(!l.texto.includes(l.resposta), 'a palavra apagada não pode continuar na frase')
    assert.ok(TERMO.definicao.includes(l.resposta))
  })

  test('definição curta demais não vira lacuna (não dá para adivinhar)', () => {
    assert.equal(lacunaDe({ termo: 'X', definicao: 'curto' }), null)
  })

  test('nunca apaga uma palavra de ligação', () => {
    const l = lacunaDe(TERMO)
    assert.ok(!['para', 'que', 'com', 'uma'].includes(l.resposta.toLowerCase()))
    assert.ok(l.resposta.length >= 4)
  })
})

describe('sequenciaDe — o modo "ordenar" sem campo novo no conteúdo', () => {
  test('extrai o padrão (1) … (2) … (3) … da profundidade', () => {
    const seq = sequenciaDe(TERMO)
    assert.equal(seq.length, 3)
    assert.match(seq[0], /fechado/)
    assert.match(seq[2], /meio-aberto/)
  })

  test('menos de três passos não vira sequência — ordenar dois é trivial', () => {
    assert.deepEqual(sequenciaDe({ profundidade: 'Só (1) um e (2) dois aqui.' }), [])
    assert.deepEqual(sequenciaDe({ profundidade: 'texto sem numeração nenhuma' }), [])
  })

  test('um campo `sequencia` explícito no deck vence a extração', () => {
    const seq = sequenciaDe({ ...TERMO, sequencia: ['um', 'dois', 'tres', 'quatro'] })
    assert.deepEqual(seq, ['um', 'dois', 'tres', 'quatro'])
  })
})

describe('escolha de modo pelo nível do termo', () => {
  test('faixaDe traduz o nível em faixa', () => {
    assert.equal(faixaDe(null), 'novo')
    assert.equal(faixaDe({ nivel: 0 }), 'baixo')
    assert.equal(faixaDe({ nivel: 2.9 }), 'baixo')
    assert.equal(faixaDe({ nivel: 3 }), 'medio')
    assert.equal(faixaDe({ nivel: 4 }), 'alto')
  })

  test('termo novo nunca cai num modo que cobra antes de apresentar', () => {
    const modo = escolherModo(TERMO, null, { semente: hash('x') })
    assert.ok(MODOS_POR_NIVEL.novo.includes(modo), `${modo} não é modo de apresentação`)
  })

  test('nível alto cai em modo de diagnóstico', () => {
    const modo = escolherModo(TERMO, { nivel: 5 }, { semente: hash('y') })
    assert.ok(MODOS_POR_NIVEL.alto.includes(modo))
  })

  test('é determinístico: a mesma semente dá o mesmo modo', () => {
    const a = escolherModo(TERMO, { nivel: 3 }, { semente: 7 })
    const b = escolherModo(TERMO, { nivel: 3 }, { semente: 7 })
    assert.equal(a, b, 'recarregar a página não pode embaralhar a lição')
  })

  test('sabe evitar repetir o modo anterior', () => {
    const anterior = escolherModo(TERMO, { nivel: 3 }, { semente: 1 })
    const seguinte = escolherModo(TERMO, { nivel: 3 }, { semente: 1, evitar: anterior })
    assert.notEqual(seguinte, anterior)
  })

  test('modoCabe recusa o modo quando falta o dado que ele precisa', () => {
    assert.equal(modoCabe('ordenar', { profundidade: 'sem numeração' }), false)
    assert.equal(modoCabe('conexoes', { relacionados: ['so-um'] }), false)
    assert.equal(modoCabe('explique', { perguntaEntrevista: '' }), false)
    assert.equal(modoCabe('sintoma-causa', { exemplo: 'curto' }, true), false)
    assert.equal(modoCabe('quiz', TERMO, false), false, 'quiz precisa de distratores no módulo')
  })

  test('termo sem nada ainda recebe um modo em vez de quebrar a lição', () => {
    const pelado = { id: 'x', termo: 'X', definicao: 'd', profundidade: '', exemplo: '', relacionados: [] }
    const modo = escolherModo(pelado, { nivel: 4 }, { moduloTemVarios: false, semente: 3 })
    assert.equal(typeof modo, 'string')
    assert.ok(modo.length > 0)
  })
})
