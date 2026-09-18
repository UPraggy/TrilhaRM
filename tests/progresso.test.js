// server/progresso.js — escrita atômica, recarga, ofensiva, histórico e retrocompatibilidade.
// Tudo em diretório temporário: o data/ do projeto NUNCA é tocado.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test, { after, describe } from 'node:test'
import { criarProgresso, praticaInicial, progressoVazio } from '../server/progresso.js'
import { hojeISO } from '../server/sm2.js'
import { apagarTemp, diaRelativo, dirTemp } from './_ajuda.mjs'

const HOJE = hojeISO()
const temporarios = []
const instancias = []

function novoArquivo(conteudo) {
  const dir = dirTemp()
  temporarios.push(dir)
  const arquivo = path.join(dir, 'progresso.json')
  if (conteudo !== undefined) fs.writeFileSync(arquivo, typeof conteudo === 'string' ? conteudo : JSON.stringify(conteudo, null, 2), 'utf8')
  return arquivo
}

/** N avaliações em termos diferentes (para fechar o dia da ofensiva) */
function avaliarN(p, n, nota = 4) {
  for (let i = 0; i < n; i += 1) p.avaliar({ deckId: 'd', termoId: `t${i}`, nota, modo: 'quiz' })
}

/** cria o progresso e registra para esperar a fila de escrita antes de apagar o temporário */
function novoProgresso(conteudo) {
  return registrar(criarProgresso(novoArquivo(conteudo)))
}
function registrar(p) {
  instancias.push(p)
  return p
}

after(async () => {
  await Promise.all(instancias.map((p) => p.aguardarEscrita()))
  temporarios.forEach(apagarTemp)
})

describe('persistência (escrita atômica + recarga)', () => {
  test('grava, não deixa .tmp para trás e recarrega igual', async () => {
    const arquivo = novoArquivo()
    const p = registrar(criarProgresso(arquivo))
    p.avaliar({ deckId: 'node-internals', termoId: 'event-loop', nota: 4, modo: 'quiz' })
    await p.aguardarEscrita()

    assert.ok(fs.existsSync(arquivo), 'o arquivo deveria existir')
    const sobras = fs.readdirSync(path.dirname(arquivo)).filter((n) => n.endsWith('.tmp'))
    assert.deepEqual(sobras, [], 'nenhum temporário pode sobrar')

    const outro = registrar(criarProgresso(arquivo))
    assert.deepEqual(outro.obter().termos, p.obter().termos)
    assert.equal(outro.obter().termos['node-internals/event-loop'].nivel, 4)
  })

  test('cria o diretório se ele não existir', async () => {
    const dir = dirTemp()
    temporarios.push(dir)
    const arquivo = path.join(dir, 'sub', 'dir', 'progresso.json')
    const p = registrar(criarProgresso(arquivo))
    p.avaliar({ deckId: 'd', termoId: 't', nota: 3, modo: 'quiz' })
    await p.aguardarEscrita()
    assert.ok(fs.existsSync(arquivo))
  })

  test('arquivo inexistente começa vazio (sem lançar)', () => {
    const p = novoProgresso()
    const estado = p.obter()
    assert.deepEqual(estado.termos, {})
    assert.deepEqual(estado.historico, [])
    assert.equal(estado.streak.atual, 0)
    assert.deepEqual(estado.nos, {})
    assert.deepEqual(estado.xp, { total: 0, porDia: {} })
  })

  test('arquivo corrompido começa do zero em vez de derrubar o servidor', () => {
    const p = novoProgresso('{ isso não é json')
    assert.deepEqual(p.obter().termos, {})
  })

  test('reset zera tudo e persiste', async () => {
    const arquivo = novoArquivo()
    const p = registrar(criarProgresso(arquivo))
    avaliarN(p, 3)
    await p.reset()
    assert.deepEqual(p.obter().termos, {})
    const outro = registrar(criarProgresso(arquivo))
    assert.deepEqual(outro.obter().historico, [])
  })
})

describe('retrocompatibilidade do data/progresso.json', () => {
  test('formato antigo (sem praticas/cursos/versao) carrega sem quebrar', () => {
    const antigo = {
      termos: {
        'node-internals/event-loop': {
          nivel: 3.3,
          vistos: 4,
          acertos: 3,
          erros: 1,
          facilidade: 2.36,
          intervaloDias: 6,
          proximaRevisao: '2026-09-17',
          ultimaResposta: '2026-09-11T12:00:00.000Z',
          ultimoModo: 'quiz',
          respostasExplique: [],
        },
      },
      streak: { atual: 3, melhor: 5, ultimoDia: '2026-09-11' },
      historico: [{ dia: '2026-09-11', avaliacoes: 14 }],
    }
    const p = novoProgresso(antigo)
    const estado = p.obter()
    assert.equal(estado.versao, 3)
    assert.deepEqual(estado.praticas, {})
    assert.deepEqual(estado.cursos, {})
    // V2: os campos novos nascem vazios num progresso.json antigo, sem migração nem perda
    assert.deepEqual(estado.nos, {})
    assert.deepEqual(estado.xp, { total: 0, porDia: {} })
    assert.deepEqual(estado.diario, [])
    assert.deepEqual(estado.entrevistas, {})
    assert.equal(estado.termos['node-internals/event-loop'].nivel, 3.3)
    assert.equal(estado.streak.melhor, 5)
    assert.equal(estado.historico.length, 1)
  })

  test('avaliar sobre o formato antigo continua a série do termo', () => {
    const p = novoProgresso({
      termos: { 'd/t': { nivel: 4, vistos: 2, acertos: 2, erros: 0, facilidade: 2.5, intervaloDias: 6, proximaRevisao: '2026-01-01' } },
      streak: { atual: 1, melhor: 1, ultimoDia: '2026-01-01' },
      historico: [],
    })
    const r = p.avaliar({ deckId: 'd', termoId: 't', nota: 4, modo: 'quiz' })
    assert.equal(r.termo.vistos, 3)
    assert.equal(r.termo.intervaloDias, 15) // 6 x 2.5
  })

  test('chaves estranhas (praticas nula, historico não-array) não quebram', () => {
    const p = novoProgresso({ termos: null, praticas: null, cursos: 7, historico: 'nada', streak: null })
    const estado = p.obter()
    assert.deepEqual(estado.termos, {})
    assert.deepEqual(estado.praticas, {})
    assert.deepEqual(estado.cursos, {})
    assert.deepEqual(estado.historico, [])
    assert.equal(estado.streak.atual, 0)
    assert.deepEqual(estado.nos, {})
    assert.deepEqual(estado.xp, { total: 0, porDia: {} })
  })

  test('progressoVazio tem as chaves que o front espera', () => {
    const v = progressoVazio()
    assert.deepEqual(Object.keys(v).sort(), ['cursos', 'diario', 'entrevistas', 'historico', 'nos', 'praticas', 'streak', 'termos', 'versao', 'xp'])
  })
})

describe('ofensiva (>= 10 avaliações fecham o dia)', () => {
  test('9 avaliações não fecham o dia; a 10ª fecha', () => {
    const p = novoProgresso()
    avaliarN(p, 9)
    let s = p.obter().streak
    assert.equal(s.atual, 0)
    assert.equal(s.hojeContou, false)
    assert.equal(s.avaliacoesHoje, 9)
    assert.equal(s.minimoDia, 10)

    p.avaliar({ deckId: 'd', termoId: 't9', nota: 4, modo: 'quiz' })
    s = p.obter().streak
    assert.equal(s.atual, 1)
    assert.equal(s.melhor, 1)
    assert.equal(s.hojeContou, true)
    assert.equal(s.avaliacoesHoje, 10)
  })

  test('avaliações extras no mesmo dia não contam duas vezes', () => {
    const p = novoProgresso()
    avaliarN(p, 25)
    const s = p.obter().streak
    assert.equal(s.atual, 1)
    assert.equal(s.avaliacoesHoje, 25)
  })

  test('dia seguinte continua a sequência', () => {
    const p = novoProgresso({
      termos: {},
      streak: { atual: 3, melhor: 5, ultimoDia: diaRelativo(-1) },
      historico: [{ dia: diaRelativo(-1), avaliacoes: 12 }],
    })
    assert.equal(p.obter().streak.atual, 3, 'ontem ainda mantém a ofensiva viva')
    avaliarN(p, 10)
    const s = p.obter().streak
    assert.equal(s.atual, 4)
    assert.equal(s.melhor, 5, 'melhor não diminui')
    assert.equal(s.ultimoDia, HOJE)
  })

  test('dois dias de buraco zeram a ofensiva', () => {
    const p = novoProgresso({
      termos: {},
      streak: { atual: 9, melhor: 9, ultimoDia: diaRelativo(-2) },
      historico: [{ dia: diaRelativo(-2), avaliacoes: 12 }],
    })
    assert.equal(p.obter().streak.atual, 0, 'anteontem já caiu')
    avaliarN(p, 10)
    const s = p.obter().streak
    assert.equal(s.atual, 1, 'recomeça do 1')
    assert.equal(s.melhor, 9, 'melhor nunca diminui')
  })

  test('melhor sobe quando a sequência nova passa a antiga', () => {
    const p = novoProgresso({
      termos: {},
      streak: { atual: 5, melhor: 5, ultimoDia: diaRelativo(-1) },
      historico: [{ dia: diaRelativo(-1), avaliacoes: 10 }],
    })
    avaliarN(p, 10)
    assert.equal(p.obter().streak.melhor, 6)
  })
})

describe('histórico por dia', () => {
  test('um registro por dia, somando as avaliações', () => {
    const p = novoProgresso()
    avaliarN(p, 4)
    const h = p.obter().historico
    assert.equal(h.length, 1)
    assert.deepEqual(h[0], { dia: HOJE, avaliacoes: 4, xp: 0 })
  })

  test('28 dias de histórico: ordenado, sem buraco de ordem e terminando hoje', () => {
    const historico = []
    for (let i = 40; i >= 1; i -= 1) historico.push({ dia: diaRelativo(-i), avaliacoes: 10 + (i % 5) })
    const p = novoProgresso({ termos: {}, streak: { atual: 0, melhor: 0, ultimoDia: null }, historico })
    avaliarN(p, 2)
    const h = p.obter().historico
    const ultimos28 = h.slice(-28)
    assert.equal(ultimos28.length, 28)
    assert.equal(ultimos28[27].dia, HOJE)
    assert.equal(ultimos28[0].dia, diaRelativo(-27))
    const ordenado = [...ultimos28].sort((a, b) => (a.dia < b.dia ? -1 : 1))
    assert.deepEqual(ultimos28, ordenado)
  })

  test('histórico desordenado no arquivo é reordenado ao ganhar o dia de hoje', () => {
    const p = novoProgresso({
      termos: {},
      streak: { atual: 0, melhor: 0, ultimoDia: null },
      historico: [{ dia: diaRelativo(-1), avaliacoes: 3 }, { dia: diaRelativo(-5), avaliacoes: 3 }],
    })
    avaliarN(p, 1)
    const dias = p.obter().historico.map((x) => x.dia)
    assert.deepEqual(dias, [diaRelativo(-5), diaRelativo(-1), HOJE])
  })
})

describe('práticas dentro do progresso', () => {
  test('iniciar é idempotente e o rascunho sobrevive', () => {
    const p = novoProgresso()
    const a = p.iniciarPratica('d/ex1')
    const iniciadaEm = a.iniciadaEm
    const b = p.iniciarPratica('d/ex1')
    assert.equal(b.estado, 'andamento')
    assert.equal(b.iniciadaEm, iniciadaEm)
    p.rascunhoPratica('d/ex1', 'meio caminho')
    assert.equal(p.pratica('d/ex1').rascunho, 'meio caminho')
  })

  test('concluir vira avaliação SM-2 no termo principal e conta para o dia', () => {
    const p = novoProgresso()
    const out = p.concluirPratica({ chave: 'd/ex1', nota: 4, auto: true, resposta: 'ok', termoPrincipal: { deckId: 'd', termoId: 't' } })
    assert.equal(out.pratica.estado, 'concluida')
    assert.equal(out.termo.chave, 'd/t')
    assert.equal(out.termo.estado.ultimoModo, 'pratica')
    assert.equal(out.hoje.avaliacoes, 1)
    assert.equal(p.obter().termos['d/t'].nivel, 4)
  })

  test('melhorNota nunca diminui, mas ultimaNota acompanha', () => {
    const p = novoProgresso()
    p.concluirPratica({ chave: 'd/ex1', nota: 4, auto: true, resposta: '', termoPrincipal: null })
    const out = p.concluirPratica({ chave: 'd/ex1', nota: 2, auto: false, resposta: '', termoPrincipal: null })
    assert.equal(out.pratica.melhorNota, 4)
    assert.equal(out.pratica.ultimaNota, 2)
    assert.equal(out.pratica.historico.length, 2)
  })

  test('reabrir limpa tentativas/dicas/revelou e mantém o histórico', () => {
    const p = novoProgresso()
    p.tentativaErradaPratica('d/ex1')
    p.dicaPratica('d/ex1', 2)
    p.revelarPratica('d/ex1')
    p.concluirPratica({ chave: 'd/ex1', nota: 1, auto: true, resposta: 'x', termoPrincipal: null })
    const s = p.reabrirPratica('d/ex1')
    assert.equal(s.estado, 'andamento')
    assert.equal(s.tentativasErradas, 0)
    assert.equal(s.dicasUsadas, 0)
    assert.equal(s.revelou, false)
    assert.equal(s.historico.length, 1)
    assert.equal(s.melhorNota, 1)
  })

  test('praticaInicial começa "nova" e sem nota', () => {
    const s = praticaInicial()
    assert.equal(s.estado, 'nova')
    assert.equal(s.melhorNota, null)
    assert.equal(s.revelou, false)
  })
})

describe('cursos dentro do progresso', () => {
  test('ver lição não conclui; concluir/desmarcar funciona', () => {
    const p = novoProgresso()
    let c = p.verLicao('curso-a', 'licao-1', 'mod-1')
    assert.equal(c.licoes['licao-1'].concluidaEm, null)
    assert.equal(c.ultimaLicao, 'licao-1')
    c = p.concluirLicao('curso-a', 'licao-1', 'mod-1', true)
    assert.ok(c.licoes['licao-1'].concluidaEm)
    c = p.concluirLicao('curso-a', 'licao-1', 'mod-1', false)
    assert.equal(c.licoes['licao-1'].concluidaEm, null)
  })

  test('lição não mexe na ofensiva nem no SM-2', () => {
    const p = novoProgresso()
    p.concluirLicao('curso-a', 'licao-1', 'mod-1', true)
    assert.deepEqual(p.obter().historico, [])
    assert.deepEqual(p.obter().termos, {})
  })
})
