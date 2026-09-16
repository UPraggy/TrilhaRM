// server/treinos.js + server/progresso-treinos.js — carga, validação, versão pública e entrega por tipo.
import assert from 'node:assert/strict'
import path from 'node:path'
import test, { after, describe } from 'node:test'
import { criarRepositorio } from '../server/decks.js'
import { criarProgresso } from '../server/progresso.js'
import { criarProgressoTreinos } from '../server/progresso-treinos.js'
import {
  AVALIACAO_POR_TIPO,
  criarTreinos,
  etapaPublica,
  gabaritoEtapa,
  GERA_SM2,
  normalizarEtapa,
  resolverTermos,
  TIPOS_ETAPA,
  treinoPublico,
} from '../server/treinos.js'
import { apagarTemp, CONTEUDO, deckFalso, dirTemp, repoFalso } from './_ajuda.mjs'

const temporarios = []
const instancias = []
after(async () => {
  await Promise.all(instancias.map((p) => p.aguardarEscrita()))
  temporarios.forEach(apagarTemp)
})

// ---- treino sintético (não depende do conteúdo real) ----------------------
const repo = repoFalso([deckFalso('deck-teste', ['termo-a', 'termo-b'])])
const problemas = []
const termosTreino = resolverTermos(['termo-a', 'termo-b'], 'deck-teste', repo, 'teste.json', 'treino', problemas)
const cabecalho = { id: 'treino-teste', nivel: 3, termos: termosTreino }

const BRUTAS = {
  aquecimento: { id: 'aq', tipo: 'aquecimento', titulo: 'Aquecer', aquecimento: { modo: 'quiz', fonte: 'deck:deck-teste', quantidade: 12 } },
  leitura: { id: 'ler', tipo: 'leitura', leitura: { markdown: 'conteúdo de leitura. '.repeat(10), link: 'https://exemplo.com' } },
  desafio: {
    id: 'des',
    tipo: 'desafio',
    desafio: { ambiente: 'node', enunciado: 'faça isso', solucao: 'era assim', dicas: ['olhe o log'], criterios: ['c1'], entrega: { tipo: 'saida', esperado: 'ok' } },
  },
  cronometrado: {
    id: 'cron',
    tipo: 'cronometrado',
    cronometrado: {
      minutos: 10,
      perguntas: [
        { id: 'q1', pergunta: 'p1?', resposta: 'r1', termos: ['termo-a'] },
        { id: 'q2', pergunta: 'p2?', resposta: 'r2', termos: ['termo-b'] },
        { id: 'q3', pergunta: 'p3?', resposta: 'r3', termos: ['termo-a'] },
      ],
    },
  },
  simulado: {
    id: 'sim',
    tipo: 'simulado',
    simulado: {
      criterios: ['clareza', 'profundidade'],
      perguntas: [
        { id: 's1', pergunta: 'explique X', pontosEsperados: ['a', 'b'], respostaModelo: 'modelo 1', seguimento: 'e se...', termos: ['termo-a'] },
        { id: 's2', pergunta: 'explique Y', pontosEsperados: ['c', 'd'], respostaModelo: 'modelo 2', termos: ['termo-b'] },
      ],
    },
  },
  'mao-na-massa': { id: 'mao', tipo: 'mao-na-massa', 'mao-na-massa': { passos: ['p1', 'p2'], criterioPronto: ['c1', 'c2', 'c3', 'c4'] } },
  ensinar: { id: 'ens', tipo: 'ensinar', ensinar: { publico: 'um júnior', formato: 'texto', criterios: ['c1', 'c2'] } },
  retrospectiva: { id: 'retro', tipo: 'retrospectiva', retrospectiva: { perguntas: ['o que travou?', 'o que repetir?'] } },
}

function montarEtapa(tipo) {
  const p = []
  const e = normalizarEtapa(BRUTAS[tipo], cabecalho, 'deck-teste', repo, 'teste.json', p)
  assert.deepEqual(p, [], `etapa ${tipo} não deveria ter problemas: ${p.join(' | ')}`)
  return e
}

const ETAPAS = Object.fromEntries(TIPOS_ETAPA.map((t) => [t, montarEtapa(t)]))
const TREINO = { id: 'treino-teste', titulo: 'Treino de teste', recompensa: 'um café', nivel: 3, termos: termosTreino, etapas: Object.values(ETAPAS) }

/** um progresso (SM-2/ofensiva) e um progresso-de-treinos, ambos em temporário */
function novoProgressoTreinos() {
  const dir = dirTemp()
  temporarios.push(dir)
  const prog = criarProgresso(path.join(dir, 'progresso.json'))
  const pt = criarProgressoTreinos(prog, { arquivo: path.join(dir, 'progresso-treinos.json') })
  instancias.push(prog, pt)
  return { prog, pt }
}

describe('carga e validação (conteúdo real)', () => {
  const repoReal = criarRepositorio(CONTEUDO)
  const treinos = criarTreinos(CONTEUDO, repoReal)

  test('content/treinos carrega sem erro', () => {
    const lista = treinos.listar()
    assert.ok(lista.length >= 1)
    assert.deepEqual(treinos.erros(), [])
  })

  test('todo treino tem id kebab-case, etapas e termina em retrospectiva', () => {
    for (const t of treinos.listar()) {
      assert.match(t.id, /^[a-z0-9]+(-[a-z0-9]+)*$/)
      assert.ok(t.etapas.length >= 4, `${t.id} tem poucas etapas`)
      assert.equal(t.etapas[t.etapas.length - 1].tipo, 'retrospectiva')
      assert.ok(t.recompensa)
    }
  })

  test('toda etapa tem regra de avaliação e corpo', () => {
    for (const t of treinos.listar()) {
      for (const e of t.etapas) {
        assert.equal(e.avaliacao, AVALIACAO_POR_TIPO[e.tipo], `${t.id}/${e.id}`)
        assert.ok(e.corpo, `${t.id}/${e.id} sem corpo`)
        assert.equal(e.geraSM2, GERA_SM2.has(e.tipo))
      }
    }
  })

  test('treino inexistente é null', () => {
    assert.equal(treinos.obter('nao-existe'), null)
    assert.equal(treinos.etapa('nao-existe', 'x'), null)
  })
})

describe('validação de etapa', () => {
  test('tipo inválido devolve null e acusa', () => {
    const p = []
    const e = normalizarEtapa({ id: 'x', tipo: 'dança' }, cabecalho, 'deck-teste', repo, 'a.json', p)
    assert.equal(e, null)
    assert.match(p[0], /tipo "dança" inválido/)
  })

  test('id fora do kebab-case acusa', () => {
    const p = []
    normalizarEtapa({ ...BRUTAS.retrospectiva, id: 'Etapa_1' }, cabecalho, 'deck-teste', repo, 'a.json', p)
    assert.match(p.join(' '), /id precisa ser kebab-case/)
  })

  test('corpo do tipo ausente acusa e não derruba', () => {
    const p = []
    const e = normalizarEtapa({ id: 'ens', tipo: 'ensinar' }, cabecalho, 'deck-teste', repo, 'a.json', p)
    assert.match(p.join(' '), /falta o objeto "ensinar"/)
    assert.ok(e.corpo)
  })

  test('etapa sem termos herda os termos do treino', () => {
    assert.deepEqual(ETAPAS.retrospectiva.termos, termosTreino)
  })

  test('cronometrado com menos de 3 perguntas acusa', () => {
    const p = []
    normalizarEtapa({ id: 'c', tipo: 'cronometrado', cronometrado: { perguntas: [{ id: 'q1', pergunta: 'a', resposta: 'b' }] } }, cabecalho, 'deck-teste', repo, 'a.json', p)
    assert.match(p.join(' '), />= 3 perguntas/)
  })

  test('aquecimento com fonte inválida acusa e o link continua sendo gerado', () => {
    const p = []
    const e = normalizarEtapa({ id: 'a', tipo: 'aquecimento', aquecimento: { modo: 'quiz', fonte: 'deck inexistente!' } }, cabecalho, 'deck-teste', repo, 'a.json', p)
    assert.match(p.join(' '), /fonte "deck inexistente!" inválida/)
    assert.match(e.corpo.link, /^\/estudar\/quiz\?fonte=/)
  })

  test('aquecimento monta o link do modo de estudo', () => {
    assert.equal(ETAPAS.aquecimento.corpo.link, '/estudar/quiz?fonte=deck%3Adeck-teste&n=12')
  })
})

describe('versão pública — o gabarito não vaza', () => {
  test('desafio sai sem solução e sem o esperado', () => {
    const pub = etapaPublica(ETAPAS.desafio)
    const texto = JSON.stringify(pub)
    assert.equal(texto.includes('era assim'), false)
    assert.equal(texto.includes('"ok"'), false)
    assert.equal(pub.corpo.exercicio.temSolucao, true)
    assert.equal(pub.corpo.exercicio.dicas.length, 1, 'dica não é gabarito')
  })

  test('cronometrado sai sem as respostas', () => {
    const pub = etapaPublica(ETAPAS.cronometrado)
    assert.equal(JSON.stringify(pub).includes('r1'), false)
    assert.equal(pub.corpo.perguntas[0].pergunta, 'p1?')
    assert.equal(pub.corpo.perguntas[0].resposta, undefined)
  })

  test('simulado sai sem respostaModelo, pontosEsperados e seguimento', () => {
    const pub = etapaPublica(ETAPAS.simulado)
    const texto = JSON.stringify(pub)
    assert.equal(texto.includes('modelo 1'), false)
    assert.equal(texto.includes('e se...'), false)
    assert.equal(pub.corpo.perguntas[0].pontosEsperados, undefined)
    assert.equal(pub.corpo.criterios.length, 2, 'os critérios de avaliação podem aparecer')
  })

  test('com revelar:true o gabarito volta', () => {
    const pub = etapaPublica(ETAPAS.cronometrado, { revelar: true })
    assert.equal(pub.corpo.perguntas[0].resposta, 'r1')
  })

  test('treinoPublico revela só as etapas pedidas', () => {
    const pub = treinoPublico(TREINO, { revelar: ['cron'] })
    const cron = pub.etapas.find((e) => e.id === 'cron')
    const des = pub.etapas.find((e) => e.id === 'des')
    assert.equal(cron.corpo.perguntas[0].resposta, 'r1')
    assert.equal(JSON.stringify(des).includes('era assim'), false)
  })

  test('a versão pública não estraga o original', () => {
    etapaPublica(ETAPAS.cronometrado)
    assert.equal(ETAPAS.cronometrado.corpo.perguntas[0].resposta, 'r1')
  })

  test('gabaritoEtapa devolve o que a pública esconde', () => {
    assert.equal(gabaritoEtapa(ETAPAS.desafio).solucao, 'era assim')
    assert.deepEqual(gabaritoEtapa(ETAPAS.cronometrado).respostas, [
      { id: 'q1', resposta: 'r1' },
      { id: 'q2', resposta: 'r2' },
      { id: 'q3', resposta: 'r3' },
    ])
    assert.equal(gabaritoEtapa(ETAPAS.simulado).perguntas[0].respostaModelo, 'modelo 1')
    assert.equal(gabaritoEtapa(ETAPAS.retrospectiva), null)
    assert.equal(gabaritoEtapa(null), null)
  })
})

describe('entrega de cada tipo de etapa', () => {
  test('aquecimento e leitura: só marcar como feito, sem SM-2', () => {
    const { pt, prog } = novoProgressoTreinos()
    for (const tipo of ['aquecimento', 'leitura']) {
      const r = pt.responderEtapa(TREINO, ETAPAS[tipo], {})
      assert.equal(r.status, 200)
      assert.equal(r.corpo.etapa.estado, 'concluida')
      assert.deepEqual(r.corpo.termos, [])
    }
    assert.deepEqual(prog.obter().termos, {})
  })

  test('desafio: errado conta tentativa; certo conclui com nota automática e vira SM-2', () => {
    const { pt, prog } = novoProgressoTreinos()
    const errado = pt.responderEtapa(TREINO, ETAPAS.desafio, { resposta: 'não é isso' })
    assert.equal(errado.corpo.correto, false)
    assert.equal(errado.corpo.etapa.tentativasErradas, 1)
    assert.equal(errado.corpo.etapa.estado, 'andamento')

    const certo = pt.responderEtapa(TREINO, ETAPAS.desafio, { resposta: '  OK  ' })
    assert.equal(certo.corpo.correto, true)
    assert.equal(certo.corpo.nota, 3, '1 tentativa errada = nota 3')
    assert.equal(certo.corpo.solucao, 'era assim')
    assert.equal(certo.corpo.termos.length, 1)
    assert.equal(prog.obter().termos['deck-teste/termo-a'].nivel, 3)
  })

  test('cronometrado: nota proporcional aos acertos e SM-2 4/1 por pergunta', () => {
    const { pt, prog } = novoProgressoTreinos()
    const r = pt.responderEtapa(TREINO, ETAPAS.cronometrado, { acertos: ['q1', 'q3', 'nao-existe'], segundos: 240 })
    assert.equal(r.status, 200)
    assert.deepEqual(r.corpo.acertos, ['q1', 'q3'])
    assert.equal(r.corpo.total, 3)
    assert.equal(r.corpo.nota, 3, '2 de 3 = 3,33 arredondado')
    assert.equal(r.corpo.passou, false, 'acertosMin é 3')
    assert.equal(r.corpo.etapa.dados.segundos, 240)
    const termos = prog.obter().termos
    assert.equal(termos['deck-teste/termo-a'].ultimoModo, 'treino')
    assert.equal(termos['deck-teste/termo-b'].nivel, 1, 'q2 errada = nota 1')
  })

  test('simulado: exige a nota de TODA pergunta e tira a média', () => {
    const { pt, prog } = novoProgressoTreinos()
    const faltando = pt.responderEtapa(TREINO, ETAPAS.simulado, { notas: { s1: 4 } })
    assert.equal(faltando.status, 400)
    assert.match(faltando.corpo.erro, /falta a nota de 1 pergunta/)

    const r = pt.responderEtapa(TREINO, ETAPAS.simulado, { notas: { s1: 4, s2: 3 } })
    assert.equal(r.corpo.nota, 4, 'média 3,5 arredonda para 4')
    assert.deepEqual(r.corpo.etapa.dados.notas, { s1: 4, s2: 3 })
    assert.equal(prog.obter().termos['deck-teste/termo-a'].nivel, 4)
    assert.equal(prog.obter().termos['deck-teste/termo-b'].nivel, 3)
  })

  test('mao-na-massa: proporção do criterioPronto vira nota', () => {
    const { pt } = novoProgressoTreinos()
    const r = pt.responderEtapa(TREINO, ETAPAS['mao-na-massa'], { marcados: [0, 1, 2, 2, 9] })
    assert.deepEqual(r.corpo.marcados, [0, 1, 2], 'repetido conta uma vez, fora da faixa é descartado')
    assert.equal(r.corpo.nota, 4, '3 de 4 = 3,75 arredondado')
  })

  test('ensinar e retrospectiva: nota manual obrigatória', () => {
    const { pt, prog } = novoProgressoTreinos()
    assert.equal(pt.responderEtapa(TREINO, ETAPAS.ensinar, {}).status, 400)
    assert.equal(pt.responderEtapa(TREINO, ETAPAS.ensinar, { nota: 9 }).status, 400)

    const r = pt.responderEtapa(TREINO, ETAPAS.ensinar, { nota: 5, resposta: 'expliquei assim' })
    assert.equal(r.corpo.nota, 5)
    assert.equal(prog.obter().termos['deck-teste/termo-a'].nivel, 5, 'ensinar gera SM-2')

    const retro = pt.responderEtapa(TREINO, ETAPAS.retrospectiva, { nota: 4 })
    assert.deepEqual(retro.corpo.termos, [], 'retrospectiva não gera SM-2')
  })

  test('o treino fecha quando todas as obrigatórias terminam (e entrega a recompensa)', () => {
    const { pt } = novoProgressoTreinos()
    let ultimo = null
    for (const tipo of TIPOS_ETAPA) {
      const corpo = tipo === 'desafio' ? { resposta: 'ok' } : tipo === 'simulado' ? { notas: { s1: 4, s2: 4 } } : { nota: 4, acertos: ['q1', 'q2', 'q3'], marcados: [0, 1, 2, 3] }
      ultimo = pt.responderEtapa(TREINO, ETAPAS[tipo], corpo)
      assert.equal(ultimo.status, 200, `falhou em ${tipo}: ${JSON.stringify(ultimo.corpo.erro || '')}`)
    }
    assert.equal(ultimo.corpo.treino.estado, 'concluido')
    assert.equal(ultimo.corpo.recompensa, 'um café')
    const resumo = pt.resumo(TREINO)
    assert.equal(resumo.percentual, 100)
    assert.equal(resumo.concluidas, TIPOS_ETAPA.length)
    assert.ok(typeof resumo.notaFinal === 'number')
  })

  test('reabrir etapa volta o treino para andamento; reabrir treino zera tudo', () => {
    const { pt } = novoProgressoTreinos()
    pt.responderEtapa(TREINO, ETAPAS.aquecimento, { nota: 4 })
    pt.responderEtapa(TREINO, ETAPAS.retrospectiva, { nota: 4 })
    const r = pt.reabrirEtapa(TREINO, 'retro')
    assert.equal(r.etapa.estado, 'andamento')
    assert.equal(r.etapa.nota, null)
    assert.equal(pt.obter(TREINO.id).estado, 'andamento')
    pt.reabrirTreino(TREINO)
    assert.equal(pt.obter(TREINO.id), null)
  })

  test('dica e revelar ficam registrados e derrubam a nota automática', () => {
    const { pt } = novoProgressoTreinos()
    pt.dica(TREINO.id, 'des', 1)
    assert.equal(pt.etapa(TREINO.id, 'des').dicasUsadas, 1)
    pt.revelar(TREINO.id, 'des')
    assert.equal(pt.etapa(TREINO.id, 'des').revelou, true)
    const r = pt.responderEtapa(TREINO, ETAPAS.desafio, { resposta: 'ok' })
    assert.equal(r.corpo.nota, 1, 'revelou = nota 1')
  })

  test('rascunho sobrevive e some ao concluir', () => {
    const { pt } = novoProgressoTreinos()
    pt.rascunho(TREINO.id, 'ens', 'meu texto')
    assert.equal(pt.etapa(TREINO.id, 'ens').rascunho, 'meu texto')
    pt.responderEtapa(TREINO, ETAPAS.ensinar, { nota: 3, resposta: 'texto final' })
    assert.equal(pt.etapa(TREINO.id, 'ens').rascunho, '')
  })

  test('progresso dos treinos persiste em arquivo próprio', async () => {
    const dir = dirTemp()
    temporarios.push(dir)
    const arquivo = path.join(dir, 'progresso-treinos.json')
    const prog = criarProgresso(path.join(dir, 'progresso.json'))
    const pt = criarProgressoTreinos(prog, { arquivo })
    instancias.push(prog, pt)
    pt.responderEtapa(TREINO, ETAPAS.retrospectiva, { nota: 4 })
    await pt.aguardarEscrita()

    const outro = criarProgressoTreinos(criarProgresso(path.join(dir, 'progresso.json')), { arquivo })
    instancias.push(outro)
    assert.equal(outro.etapa(TREINO.id, 'retro').nota, 4)
  })
})
