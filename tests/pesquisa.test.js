// O tipo de entrega `pesquisa` (server/praticas.js): ler documentação e voltar com resposta + FONTE.
// A correção é automática por palavras-chave quando a pergunta é fechada; com `aberta: true` quem
// avalia é o mentor IA.
import test, { describe } from 'node:test'
import assert from 'node:assert/strict'
import { corrigir, normalizarEntrega, normalizarTexto, TIPOS, TIPOS_AUTO, temFonte } from '../server/praticas.js'

const entrega = (e) => {
  const problemas = []
  const out = normalizarEntrega(e, { id: 'x' }, 'teste.json', problemas)
  return { out, problemas }
}

describe('temFonte — o que conta como fonte', () => {
  test('aceita URL, referência normativa e citação entre aspas', () => {
    assert.equal(temFonte('vi em https://nodejs.org/api/fs.html'), true)
    assert.equal(temFonte('conforme a RFC 9293'), true)
    assert.equal(temFonte('RFC-7231 diz isso'), true)
    assert.equal(temFonte('o texto diz "o event loop tem seis fases distintas"'), true)
  })

  test('recusa resposta sem fonte nenhuma', () => {
    assert.equal(temFonte('acho que é assim porque sempre foi'), false)
    assert.equal(temFonte(''), false)
    assert.equal(temFonte(null), false)
  })

  test('a sigla só vale com o NÚMERO e solta de outra palavra', () => {
    assert.equal(temFonte('falo de RFC mas não digo qual'), false, 'sigla sem número não é referência')
    assert.equal(temFonte('ABCRFC123'), false, 'grudada em outra palavra não conta')
    assert.equal(temFonte('leia a RFC 9293'), true)
  })

  test('citação curta demais não passa por fonte', () => {
    assert.equal(temFonte('ele disse "sim"'), false)
  })
})

describe('normalizarTexto — casar palavra-chave sem brigar com acento', () => {
  test('tira acento, baixa a caixa e colapsa espaço', () => {
    assert.equal(normalizarTexto('  Invalidação   de CACHE '), 'invalidacao de cache')
  })
  test('entrada nula vira string vazia em vez de estourar', () => {
    assert.equal(normalizarTexto(null), '')
  })
})

describe('entrega pesquisa — validação do esquema', () => {
  test('é um tipo válido e NÃO está na lista fixa de automáticos', () => {
    assert.ok(TIPOS.includes('pesquisa'))
    assert.equal(TIPOS_AUTO.has('pesquisa'), false, 'quem decide é ter deveConter, não o tipo')
  })

  test('sem deveConter e sem aberta, o validador reclama', () => {
    const { problemas } = entrega({ tipo: 'pesquisa' })
    assert.equal(problemas.length, 1)
    assert.match(problemas[0], /deveConter/)
  })

  test('aberta: true dispensa deveConter (quem avalia é o mentor)', () => {
    const { out, problemas } = entrega({ tipo: 'pesquisa', aberta: true })
    assert.deepEqual(problemas, [])
    assert.equal(out.aberta, true)
  })

  test('exigeFonte é o padrão e pode ser desligado', () => {
    assert.equal(entrega({ tipo: 'pesquisa', deveConter: ['a'] }).out.exigeFonte, true)
    assert.equal(entrega({ tipo: 'pesquisa', deveConter: ['a'], exigeFonte: false }).out.exigeFonte, false)
  })
})

describe('corrigir — pesquisa fechada', () => {
  const ex = {
    entrega: entrega({
      tipo: 'pesquisa',
      deveConter: ['fillfactor', 'indexada|índice', 'n_tup_hot_upd'],
      minimoChars: 60,
    }).out,
  }

  const boa =
    'O HOT acontece quando nenhuma coluna indexada muda e a versão nova cabe na mesma página; ' +
    'o fillfactor reserva esse espaço e n_tup_hot_upd mede a taxa. Fonte: https://www.postgresql.org/docs/current/sql-createtable.html'

  test('aceita a resposta que cobre as palavras-chave e traz fonte', () => {
    assert.deepEqual(corrigir(ex, boa), { correto: true })
  })

  test('alternativa separada por | conta como a mesma exigência', () => {
    const comIndice = boa.replace('indexada', 'índice')
    assert.equal(corrigir(ex, comIndice).correto, true, 'acento e sinônimo não podem reprovar')
  })

  test('falta uma palavra-chave: recusa e DIZ quantos pontos faltam, sem entregar a resposta', () => {
    const r = corrigir(ex, boa.replace('fillfactor', 'algo'))
    assert.equal(r.correto, false)
    assert.match(r.detalhe, /ponto/)
    assert.ok(!r.detalhe.includes('fillfactor'), 'a dica não pode virar gabarito')
  })

  test('sem fonte: recusa pedindo o link', () => {
    const semFonte = boa.replace(/Fonte:.*/, 'e é isso que eu lembro do assunto todo.')
    const r = corrigir(ex, semFonte)
    assert.equal(r.correto, false)
    assert.match(r.detalhe, /fonte/i)
  })

  test('resposta curta demais: recusa antes de olhar palavra-chave', () => {
    const r = corrigir(ex, 'fillfactor indexada n_tup_hot_upd https://x.dev/a')
    assert.equal(r.correto, false)
    assert.match(r.detalhe, /caracteres/)
  })

  test('resposta vazia ou nula não estoura', () => {
    for (const v of [null, undefined, '', 0]) assert.equal(corrigir(ex, v).correto, false)
  })
})
