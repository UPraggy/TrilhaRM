// server/praticas.js — normalização, correção automática e notas.
import assert from 'node:assert/strict'
import test, { describe } from 'node:test'
import {
  corrigir,
  exercicioPublico,
  normalizarEntrega,
  normalizarExercicio,
  normalizarSaida,
  notaAutomatica,
  notaChecklist,
  paraNumero,
  TIPOS,
  TIPOS_AUTO,
} from '../server/praticas.js'
import { deckFalso, repoFalso } from './_ajuda.mjs'

/** exercício mínimo já normalizado, só com a entrega que interessa */
function exercicio(entrega, extra = {}) {
  const problemas = []
  return { id: 'ex', termos: [], dicas: [], criterios: [], solucao: 'sol', entrega: normalizarEntrega(entrega, { id: 'ex' }, 'teste.json', problemas), problemas, ...extra }
}

describe('normalizarSaida', () => {
  test('colapsa espaços, tira o espaço do fim e ignora maiúsculas', () => {
    assert.equal(normalizarSaida('  A   B  '), 'a b')
    assert.equal(normalizarSaida('A B'), normalizarSaida('a    b   '))
  })

  test('CRLF vira LF e linhas em branco das pontas somem', () => {
    assert.equal(normalizarSaida('\r\nA\r\nB\r\n'), 'a\nb')
  })

  test('com normalizar:false ainda colapsa espaço mas respeita maiúsculas', () => {
    assert.equal(normalizarSaida('A  B', false), 'A B')
    assert.notEqual(normalizarSaida('A B', false), normalizarSaida('a b', false))
  })
})

describe('corrigir — entrega "saida"', () => {
  const ex = exercicio({ tipo: 'saida', esperado: 'I\nH\nG' })

  test('igual é certo', () => {
    assert.equal(corrigir(ex, 'I\nH\nG').correto, true)
  })

  test('espaço sobrando no fim (o que mais engana ao colar saída) é certo', () => {
    assert.equal(corrigir(ex, 'I \nH\nG   ').correto, true)
    assert.equal(corrigir(ex, '\n\nI\nH\nG\n\n').correto, true)
  })

  test('maiúsculas/minúsculas não importam; CRLF do Windows também não', () => {
    assert.equal(corrigir(ex, 'i\r\nh\r\ng').correto, true)
  })

  test('ordem trocada é errado', () => {
    assert.equal(corrigir(ex, 'H\nI\nG').correto, false)
  })

  test('resposta vazia é errado, com detalhe', () => {
    const r = corrigir(ex, '   ')
    assert.equal(r.correto, false)
    assert.equal(r.detalhe, 'resposta vazia')
  })

  test('esperadoQualquer aceita mais de uma saída válida', () => {
    const multi = exercicio({ tipo: 'saida', esperado: 'ok', esperadoQualquer: ['tudo certo', 'OK!'] })
    assert.equal(multi.entrega.esperados.length, 3)
    assert.equal(corrigir(multi, 'tudo   certo').correto, true)
    assert.equal(corrigir(multi, 'ok!').correto, true)
    assert.equal(corrigir(multi, 'nada').correto, false)
  })

  test('acento: o case-folding funciona com acento, mas acento continua sendo acento', () => {
    const acentuado = exercicio({ tipo: 'saida', esperado: 'Ação concluída' })
    assert.equal(corrigir(acentuado, 'AÇÃO   CONCLUÍDA').correto, true)
    // documentado em content/praticas/README.md: normaliza espaços, CRLF e maiúsculas — não acentos
    assert.equal(corrigir(acentuado, 'acao concluida').correto, false)
  })

  test('com normalizar:false o case passa a importar', () => {
    const estrito = exercicio({ tipo: 'saida', esperado: 'Hello', normalizar: false })
    assert.equal(corrigir(estrito, 'Hello').correto, true)
    assert.equal(corrigir(estrito, 'hello').correto, false)
  })
})

describe('paraNumero — o jeito humano de escrever número', () => {
  test('inteiro e decimal com ponto', () => {
    assert.equal(paraNumero('44'), 44)
    assert.equal(paraNumero('0.6'), 0.6)
    assert.equal(paraNumero(' -12.5 '), -12.5)
  })

  test('vírgula como decimal (pt-BR)', () => {
    assert.equal(paraNumero('0,6'), 0.6)
    assert.equal(paraNumero('1,5'), 1.5)
  })

  test('separador de milhar não vira decimal', () => {
    assert.equal(paraNumero('1.900.020'), 1900020)
    assert.equal(paraNumero('-2.147.483.596'), -2147483596)
    assert.equal(paraNumero('1,900,020'), 1900020)
    assert.equal(paraNumero('12 500'), 12500)
  })

  test('milhar + decimal juntos, nos dois padrões', () => {
    assert.equal(paraNumero('1.234,56'), 1234.56)
    assert.equal(paraNumero('1,234.56'), 1234.56)
  })

  test('unidade colada não atrapalha', () => {
    assert.equal(paraNumero('216 min'), 216)
    assert.equal(paraNumero('58bytes'), 58)
  })

  test('texto sem número nenhum é NaN (e não zero)', () => {
    assert.ok(Number.isNaN(paraNumero('')))
    assert.ok(Number.isNaN(paraNumero('   ')))
    assert.ok(Number.isNaN(paraNumero('não sei')))
    assert.ok(Number.isNaN(paraNumero(null)))
  })
})

describe('corrigir — entrega "numero"', () => {
  test('tolerância é fração do esperado', () => {
    const ex = exercicio({ tipo: 'numero', esperado: 0.6, tolerancia: 0.02 }) // +- 0,012
    assert.equal(corrigir(ex, '0.6').correto, true)
    assert.equal(corrigir(ex, '0,61').correto, true)
    assert.equal(corrigir(ex, '0,65').correto, false)
  })

  test('tolerância 0 exige o valor exato', () => {
    const ex = exercicio({ tipo: 'numero', esperado: 44, tolerancia: 0 })
    assert.equal(corrigir(ex, '44').correto, true)
    assert.equal(corrigir(ex, '45').correto, false)
  })

  test('faixa min/max tem precedência sobre esperado', () => {
    const ex = exercicio({ tipo: 'numero', min: 12000, max: 15500, unidade: 'ms' })
    assert.equal(corrigir(ex, '12000').correto, true)
    assert.equal(corrigir(ex, '15500').correto, true)
    assert.equal(corrigir(ex, '11999').correto, false)
    assert.equal(corrigir(ex, '12.500').correto, true, 'separador de milhar dentro da faixa')
    assert.equal(corrigir(ex, '13 200 ms').correto, true)
  })

  test('número grande com separador de milhar bate com o esperado', () => {
    const ex = exercicio({ tipo: 'numero', esperado: 1900020, tolerancia: 0 })
    assert.equal(corrigir(ex, '1900020').correto, true)
    assert.equal(corrigir(ex, '1.900.020').correto, true)
    assert.equal(corrigir(ex, '1,900,020').correto, true)
  })

  test('resposta vazia ou sem número não é lida como zero', () => {
    const ex = exercicio({ tipo: 'numero', esperado: 0, tolerancia: 0 })
    const r = corrigir(ex, '')
    assert.equal(r.correto, false)
    assert.equal(r.detalhe, 'não entendi como número')
    assert.equal(corrigir(ex, 'não sei').correto, false)
    assert.equal(corrigir(ex, '0').correto, true)
  })
})

describe('corrigir — entrega "escolha"', () => {
  test('escolha única: aceita índice número ou string', () => {
    const ex = exercicio({ tipo: 'escolha', opcoes: ['a', 'b', 'c'], correta: 2 })
    assert.equal(ex.entrega.multipla, false)
    assert.equal(corrigir(ex, 2).correto, true)
    assert.equal(corrigir(ex, '2').correto, true)
    assert.equal(corrigir(ex, [2]).correto, true)
    assert.equal(corrigir(ex, 1).correto, false)
  })

  test('múltipla: ordem não importa', () => {
    const ex = exercicio({ tipo: 'escolha', opcoes: ['a', 'b', 'c', 'd'], corretas: [2, 0] })
    assert.equal(ex.entrega.multipla, true)
    assert.deepEqual(ex.entrega.corretas, [0, 2])
    assert.equal(corrigir(ex, [0, 2]).correto, true)
    assert.equal(corrigir(ex, [2, 0]).correto, true)
  })

  test('múltipla: item repetido conta uma vez só', () => {
    const ex = exercicio({ tipo: 'escolha', opcoes: ['a', 'b', 'c', 'd'], corretas: [0, 2] })
    assert.equal(corrigir(ex, [2, 0, 2, 0]).correto, true)
    assert.equal(corrigir(ex, ['0', 2, '2']).correto, true)
  })

  test('múltipla: faltando uma ou sobrando uma é errado', () => {
    const ex = exercicio({ tipo: 'escolha', opcoes: ['a', 'b', 'c', 'd'], corretas: [0, 2] })
    assert.equal(corrigir(ex, [0]).correto, false)
    assert.equal(corrigir(ex, [0, 2, 3]).correto, false)
    assert.equal(corrigir(ex, []).correto, false)
  })

  test('índice fora das opções é descartado na validação', () => {
    const problemas = []
    const e = normalizarEntrega({ tipo: 'escolha', opcoes: ['a', 'b'], corretas: [0, 9] }, { id: 'x' }, 'teste.json', problemas)
    assert.deepEqual(e.corretas, [0])
  })

  test('tipo não automático não é corrigido pelo servidor', () => {
    const ex = exercicio({ tipo: 'texto', minimoChars: 10 })
    const r = corrigir(ex, 'qualquer coisa')
    assert.equal(r.correto, false)
    assert.equal(r.detalhe, 'tipo não é automático')
  })
})

describe('notaChecklist — proporção vira nota', () => {
  test('0, metade e tudo', () => {
    assert.equal(notaChecklist(0, 4), 0)
    assert.equal(notaChecklist(2, 4), 3) // 2.5 arredonda para 3
    assert.equal(notaChecklist(4, 4), 5)
    assert.equal(notaChecklist(3, 5), 3)
  })

  test('total zero não estoura', () => {
    assert.equal(notaChecklist(0, 0), 0)
  })

  test('nunca passa de 5 nem fica abaixo de 0', () => {
    assert.equal(notaChecklist(10, 4), 5)
    assert.equal(notaChecklist(-2, 4), 0)
  })
})

describe('notaAutomatica — 4 · 3 · 2 · 1', () => {
  test('4 de primeira, sem dica e sem erro', () => {
    assert.equal(notaAutomatica({}), 4)
    assert.equal(notaAutomatica({ tentativasErradas: 0, dicasUsadas: 0, revelou: false }), 4)
  })

  test('3 com dica', () => {
    assert.equal(notaAutomatica({ dicasUsadas: 1 }), 3)
  })

  test('3 até a terceira tentativa (2 erradas)', () => {
    assert.equal(notaAutomatica({ tentativasErradas: 1 }), 3)
    assert.equal(notaAutomatica({ tentativasErradas: 2 }), 3)
  })

  test('2 depois disso', () => {
    assert.equal(notaAutomatica({ tentativasErradas: 3 }), 2)
    assert.equal(notaAutomatica({ tentativasErradas: 9, dicasUsadas: 3 }), 2)
  })

  test('1 se revelou, mesmo tendo acertado depois', () => {
    assert.equal(notaAutomatica({ revelou: true }), 1)
    assert.equal(notaAutomatica({ tentativasErradas: 0, dicasUsadas: 0, revelou: true }), 1)
  })
})

describe('normalizarEntrega / normalizarExercicio — validação', () => {
  test('tipo inválido vira texto e acusa o problema', () => {
    const problemas = []
    const e = normalizarEntrega({ tipo: 'nao-existe' }, { id: 'x' }, 'arq.json', problemas)
    assert.equal(e.tipo, 'texto')
    assert.equal(problemas.length, 1)
    assert.match(problemas[0], /entrega\.tipo inválido/)
  })

  test('saida sem esperado, numero sem nada, escolha sem correta, checklist curto', () => {
    const p1 = []
    normalizarEntrega({ tipo: 'saida' }, { id: 'a' }, 'arq.json', p1)
    assert.match(p1[0], /sem "esperado"/)
    const p2 = []
    normalizarEntrega({ tipo: 'numero' }, { id: 'b' }, 'arq.json', p2)
    assert.match(p2[0], /sem "esperado" nem min\/max/)
    const p3 = []
    normalizarEntrega({ tipo: 'escolha', opcoes: ['a'] }, { id: 'c' }, 'arq.json', p3)
    assert.equal(p3.length, 2) // < 2 opções E sem correta
    const p4 = []
    normalizarEntrega({ tipo: 'checklist', itens: ['um'] }, { id: 'd' }, 'arq.json', p4)
    assert.match(p4[0], />= 2 itens/)
  })

  test('rótulos padrão por tipo', () => {
    const p = []
    assert.equal(normalizarEntrega({ tipo: 'saida', esperado: 'x' }, { id: 'a' }, 'f', p).rotulo, 'Cole a saída')
    assert.equal(normalizarEntrega({ tipo: 'numero', esperado: 1 }, { id: 'a' }, 'f', p).rotulo, 'Digite o número')
    assert.equal(normalizarEntrega({ tipo: 'escolha', opcoes: ['a', 'b'], correta: 0 }, { id: 'a' }, 'f', p).rotulo, 'Escolha uma')
    assert.equal(normalizarEntrega({ tipo: 'escolha', opcoes: ['a', 'b'], corretas: [0, 1] }, { id: 'a' }, 'f', p).rotulo, 'Marque todas as corretas')
  })

  test('exercício completo: termos resolvidos, defaults e flag auto', () => {
    const repo = repoFalso([deckFalso('node-internals', ['event-loop', 'libuv'])])
    const problemas = []
    const ex = normalizarExercicio(
      { id: 'meu-ex', titulo: 'T', termos: ['event-loop', 'node-internals/libuv'], ambiente: 'node', enunciado: 'faça', solucao: 'assim', entrega: { tipo: 'saida', esperado: 'ok' } },
      'arq.json',
      repo.obter('node-internals'),
      repo,
      problemas,
    )
    assert.deepEqual(problemas, [])
    assert.equal(ex.termos.length, 2)
    assert.equal(ex.termos[0].deckId, 'node-internals')
    assert.equal(ex.nivel, 3)
    assert.equal(ex.tempoMin, 20)
    assert.equal(ex.auto, true)
    assert.equal(TIPOS_AUTO.has(ex.entrega.tipo), true)
  })

  test('termo inexistente, ambiente desconhecido e falta de enunciado/solução viram problemas', () => {
    const repo = repoFalso([deckFalso('d', ['t'])])
    const problemas = []
    const ex = normalizarExercicio({ id: 'x', termos: ['nao-existe'], ambiente: 'marte', entrega: { tipo: 'texto' } }, 'arq.json', repo.obter('d'), repo, problemas)
    const texto = problemas.join(' | ')
    assert.match(texto, /termo "nao-existe" não existe/)
    assert.match(texto, /sem termo válido/)
    assert.match(texto, /ambiente "marte" desconhecido/)
    assert.match(texto, /sem enunciado/)
    assert.match(texto, /sem solucao/)
    assert.match(texto, /entrega texto sem "criterios"/)
    assert.equal(ex.ambiente, 'papel')
    assert.equal(ex.auto, false)
  })

  test('nível é grampeado em 1..5', () => {
    const repo = repoFalso([deckFalso('d', ['t'])])
    const p = []
    const base = { id: 'x', termos: ['t'], ambiente: 'papel', enunciado: 'e', solucao: 's', entrega: { tipo: 'saida', esperado: 'o' } }
    assert.equal(normalizarExercicio({ ...base, nivel: 9 }, 'a', repo.obter('d'), repo, p).nivel, 5)
    assert.equal(normalizarExercicio({ ...base, nivel: 0 }, 'a', repo.obter('d'), repo, p).nivel, 1)
  })

  test('TIPOS e TIPOS_AUTO são o contrato do conteúdo', () => {
    assert.deepEqual(TIPOS, ['saida', 'numero', 'escolha', 'texto', 'checklist'])
    assert.deepEqual([...TIPOS_AUTO].sort(), ['escolha', 'numero', 'saida'])
  })
})

describe('exercicioPublico — o gabarito não sai da API', () => {
  test('tira solucao e todo o gabarito da entrega', () => {
    const ex = {
      id: 'x',
      solucao: 'a resposta secreta',
      dicas: ['d1'],
      entrega: { tipo: 'saida', esperados: ['segredo'], esperado: 'segredo', min: 1, max: 2, tolerancia: 0.1, corretas: [0], rotulo: 'Cole a saída' },
    }
    const pub = exercicioPublico(ex)
    const texto = JSON.stringify(pub)
    assert.equal(pub.solucao, undefined)
    assert.equal(pub.temSolucao, true)
    assert.equal(texto.includes('segredo'), false)
    for (const chave of ['esperados', 'esperado', 'min', 'max', 'tolerancia', 'corretas']) {
      assert.equal(chave in pub.entrega, false, `entrega.${chave} vazou`)
    }
    assert.equal(pub.entrega.rotulo, 'Cole a saída')
    assert.equal(pub.dicas.length, 1)
  })

  test('não muta o exercício original', () => {
    const ex = { id: 'x', solucao: 's', entrega: { tipo: 'numero', esperado: 7 } }
    exercicioPublico(ex)
    assert.equal(ex.solucao, 's')
    assert.equal(ex.entrega.esperado, 7)
  })
})
