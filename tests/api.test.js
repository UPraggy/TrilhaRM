// server/index.js — o Express de verdade, com o content/ real e um data/ temporário.
//
// Por que um processo filho e uma raiz temporária: server/index.js não exporta o app — ele resolve
// RAIZ a partir do próprio __dirname e sobe sozinho. Então o teste monta uma raiz descartável
// (cópia de server/*.js + junctions para content/ e node_modules/ + data/ vazio) e roda o servidor
// lá dentro. Assim o data/ do projeto NUNCA é tocado. A porta vem do SO: abrimos um socket na
// porta 0, lemos server.address().port e passamos para o filho (5173/8790/8796/8797/8799 estão ocupadas).
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import test, { after, before, describe } from 'node:test'
import { apagarTemp, CONTEUDO, dirTemp, RAIZ } from './_ajuda.mjs'

const DECK = 'node-internals'
const TERMO = 'event-loop'
const EXERCICIO = 'ordem-event-loop' // entrega "saida", 3 dicas
const SAIDA_CERTA = 'I\nH\nG\nA\nB\nC\nF\nE\nD'

const ARQ_PROGRESSO_REAL = path.join(RAIZ, 'data', 'progresso.json')

let raizTemp = null
let filho = null
let base = ''
let marcaProgressoReal = null

/** porta livre escolhida pelo SO (abre na 0, lê a porta, devolve) */
function portaLivre() {
  return new Promise((resolve, reject) => {
    const s = net.createServer()
    s.on('error', reject)
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address()
      s.close(() => resolve(port))
    })
  })
}

function montarRaiz() {
  const dir = dirTemp('trilharm-api-')
  fs.mkdirSync(path.join(dir, 'server'))
  for (const nome of fs.readdirSync(path.join(RAIZ, 'server'))) {
    fs.copyFileSync(path.join(RAIZ, 'server', nome), path.join(dir, 'server', nome))
  }
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'trilharm-teste', private: true, type: 'module' }), 'utf8')
  fs.symlinkSync(CONTEUDO, path.join(dir, 'content'), 'junction')
  fs.symlinkSync(path.join(RAIZ, 'node_modules'), path.join(dir, 'node_modules'), 'junction')
  fs.mkdirSync(path.join(dir, 'data'))
  return dir
}

function subir(dir, porta) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env }
    delete env.PORT
    const ch = spawn(process.execPath, ['server/index.js', '--port', String(porta)], { cwd: dir, env, stdio: ['ignore', 'pipe', 'pipe'] })
    let saida = ''
    let erroSaida = ''
    const relogio = setTimeout(() => reject(new Error(`servidor não subiu em 20s: ${saida} ${erroSaida}`)), 20000)
    ch.stdout.on('data', (d) => {
      saida += d.toString()
      if (/http:\/\/localhost:\d+/.test(saida)) {
        clearTimeout(relogio)
        resolve(ch)
      }
    })
    ch.stderr.on('data', (d) => {
      erroSaida += d.toString()
    })
    ch.on('exit', (codigo) => {
      clearTimeout(relogio)
      reject(new Error(`servidor morreu (código ${codigo}): ${erroSaida}`))
    })
  })
}

async function api(caminho, opcoes = {}) {
  const r = await fetch(base + caminho, {
    ...opcoes,
    headers: opcoes.body ? { 'content-type': 'application/json', ...(opcoes.headers || {}) } : opcoes.headers,
  })
  const texto = await r.text()
  let corpo = null
  try {
    corpo = JSON.parse(texto)
  } catch {
    corpo = texto
  }
  return { status: r.status, corpo }
}

/** assinatura simples (tamanho + mtime) para provar que o data/ do projeto não foi mexido */
function marcaDoArquivo(arquivo) {
  try {
    const st = fs.statSync(arquivo)
    return `${st.size}:${st.mtimeMs}`
  } catch {
    return 'inexistente'
  }
}

const post = (caminho, corpo) => api(caminho, { method: 'POST', body: JSON.stringify(corpo ?? {}) })

before(async () => {
  marcaProgressoReal = marcaDoArquivo(ARQ_PROGRESSO_REAL)
  raizTemp = montarRaiz()
  const porta = await portaLivre()
  filho = await subir(raizTemp, porta)
  filho.removeAllListeners('exit')
  base = `http://127.0.0.1:${porta}/api`
})

after(async () => {
  if (filho && filho.exitCode === null) {
    await new Promise((resolve) => {
      filho.once('exit', resolve)
      filho.kill('SIGTERM')
      setTimeout(() => filho.kill('SIGKILL'), 4000).unref()
    })
  }
  assert.notEqual(filho.exitCode === null && filho.signalCode === null, true, 'o servidor de teste precisa encerrar')
  apagarTemp(raizTemp)
})

describe('saúde e catálogo', () => {
  test('GET /api/saude responde com o conteúdo carregado e sem erros', async () => {
    const { status, corpo } = await api('/saude')
    assert.equal(status, 200)
    assert.equal(corpo.ok, true)
    assert.ok(corpo.decks >= 1)
    assert.ok(corpo.praticas >= 1)
    assert.deepEqual(corpo.erros, [], 'o conteúdo real não pode ter erro de validação')
    assert.match(corpo.hoje, /^\d{4}-\d{2}-\d{2}$/)
  })

  test('GET /api/decks lista os decks com total de termos', async () => {
    const { status, corpo } = await api('/decks')
    assert.equal(status, 200)
    assert.ok(Array.isArray(corpo.decks))
    const d = corpo.decks.find((x) => x.id === DECK)
    assert.ok(d, `deck ${DECK} deveria existir`)
    assert.ok(d.totalTermos > 0)
    assert.ok(Array.isArray(d.tags))
    assert.equal(corpo.decks.every((x) => x.termos === undefined), true, 'a lista é resumida')
  })

  test('GET /api/decks/:id devolve o deck completo', async () => {
    const { status, corpo } = await api(`/decks/${DECK}`)
    assert.equal(status, 200)
    assert.equal(corpo.id, DECK)
    assert.ok(corpo.termos.some((t) => t.id === TERMO))
  })

  test('GET /api/decks/:id de deck inexistente é 404 em JSON', async () => {
    const { status, corpo } = await api('/decks/deck-que-nao-existe')
    assert.equal(status, 404)
    assert.equal(corpo.erro, 'deck não encontrado')
  })

  test('rota inexistente sob /api também é 404 em JSON', async () => {
    const { status, corpo } = await api('/nao-existe')
    assert.equal(status, 404)
    assert.equal(corpo.erro, 'rota não encontrada')
  })

  test('GET /api/termos e /api/trilhas atendem o glossário e as fases', async () => {
    const termos = await api('/termos')
    assert.ok(termos.corpo.termos.length > 100)
    assert.ok(termos.corpo.termos.every((t) => t.deckId && t.deckTitulo))
    const trilhas = await api('/trilhas')
    assert.ok(trilhas.corpo.fases.length >= 1)
    assert.ok(['estrutura.json', 'trilhas.json', 'auto'].includes(trilhas.corpo.origem))
  })
})

describe('POST /api/progresso/avaliar', () => {
  test('sem deckId/termoId é 400', async () => {
    const r = await post('/progresso/avaliar', { nota: 3 })
    assert.equal(r.status, 400)
    assert.match(r.corpo.erro, /obrigatórios/)
  })

  for (const nota of [7, -1, 'abc', null]) {
    test(`nota inválida (${JSON.stringify(nota)}) é 400`, async () => {
      const r = await post('/progresso/avaliar', { deckId: DECK, termoId: TERMO, nota, modo: 'quiz' })
      assert.equal(r.status, 400)
      assert.equal(r.corpo.erro, 'nota deve ser 0..5')
    })
  }

  test('deck ou termo inexistente é 404', async () => {
    const a = await post('/progresso/avaliar', { deckId: 'nao-existe', termoId: TERMO, nota: 3 })
    assert.equal(a.status, 404)
    const b = await post('/progresso/avaliar', { deckId: DECK, termoId: 'nao-existe', nota: 3 })
    assert.equal(b.status, 404)
    assert.equal(b.corpo.erro, 'termo não encontrado')
  })

  test('nota válida grava, devolve o termo e a ofensiva', async () => {
    const r = await post('/progresso/avaliar', { deckId: DECK, termoId: TERMO, nota: 4, modo: 'quiz' })
    assert.equal(r.status, 200)
    assert.equal(r.corpo.chave, `${DECK}/${TERMO}`)
    assert.equal(r.corpo.termo.nivel, 4)
    assert.equal(r.corpo.termo.intervaloDias, 1)
    assert.equal(r.corpo.streak.minimoDia, 10)
    assert.ok(r.corpo.hoje.avaliacoes >= 1)

    const p = await api('/progresso')
    assert.equal(p.corpo.termos[`${DECK}/${TERMO}`].vistos, 1)
    const rev = await api('/progresso/revisao')
    assert.equal(rev.status, 200)
    assert.ok(rev.corpo.porDeck[DECK].total > 0)
  })

  test('JSON inválido no corpo vira 400 em JSON (não HTML de erro)', async () => {
    const r = await api('/progresso/avaliar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{ isso não é json' })
    assert.equal(r.status, 400)
    assert.equal(r.corpo.erro, 'JSON inválido')
  })
})

describe('práticas — o gabarito só sai na hora certa', () => {
  test('GET do exercício não vaza solução nem resposta certa', async () => {
    const { status, corpo } = await api(`/praticas/${DECK}/${EXERCICIO}`)
    assert.equal(status, 200)
    assert.equal(corpo.solucao, undefined)
    assert.equal(corpo.temSolucao, true)
    assert.equal(corpo.entrega.esperados, undefined)
    assert.equal(JSON.stringify(corpo).includes(SAIDA_CERTA), false, 'a saída esperada não pode estar no JSON')
    assert.ok(corpo.enunciado)
  })

  test('exercício inexistente é 404', async () => {
    const r = await api(`/praticas/${DECK}/nao-existe`)
    assert.equal(r.status, 404)
    assert.equal(r.corpo.erro, 'exercício não encontrado')
  })

  test('fluxo completo: iniciar → errar → dica → acertar → nota 3', async () => {
    const iniciar = await post(`/praticas/${DECK}/${EXERCICIO}/iniciar`)
    assert.equal(iniciar.status, 200)
    assert.equal(iniciar.corpo.estado.estado, 'andamento')

    const errado = await post(`/praticas/${DECK}/${EXERCICIO}/responder`, { resposta: 'A\nB\nC' })
    assert.equal(errado.status, 200)
    assert.equal(errado.corpo.correto, false)
    assert.equal(errado.corpo.estado.tentativasErradas, 1)
    assert.equal(errado.corpo.solucao, undefined, 'errar não revela a solução')

    const dica = await post(`/praticas/${DECK}/${EXERCICIO}/dica`, { n: 1 })
    assert.equal(dica.status, 200)
    assert.equal(dica.corpo.dicas.length, 1)
    assert.equal(dica.corpo.estado.dicasUsadas, 1)

    const certo = await post(`/praticas/${DECK}/${EXERCICIO}/responder`, { resposta: `${SAIDA_CERTA}\n` })
    assert.equal(certo.status, 200)
    assert.equal(certo.corpo.correto, true)
    assert.equal(certo.corpo.nota, 3, '1 tentativa errada + 1 dica = 3')
    assert.equal(certo.corpo.pratica.estado, 'concluida')
    assert.ok(certo.corpo.solucao, 'depois de acertar, a solução vem junto')
    assert.ok(certo.corpo.termo, 'a nota vira avaliação SM-2 no termo principal')

    const depois = await api(`/praticas/${DECK}/${EXERCICIO}`)
    assert.ok(depois.corpo.solucao, 'concluído: o GET já entrega a solução')
    assert.equal(depois.corpo.estado.melhorNota, 3)
  })

  test('nota fora de 0..5 na entrega é 400', async () => {
    const r = await post(`/praticas/${DECK}/${EXERCICIO}/responder`, { resposta: 'x', nota: 9 })
    assert.equal(r.status, 400)
    assert.equal(r.corpo.erro, 'nota deve ser 0..5')
  })

  test('GET /api/praticas (lista) não traz enunciado nem gabarito', async () => {
    const { corpo } = await api('/praticas')
    const arq = corpo.praticas.find((p) => p.deckId === DECK)
    const ex = arq.exercicios.find((e) => e.id === EXERCICIO)
    assert.equal(ex.enunciado, undefined)
    assert.equal(ex.solucao, undefined)
    assert.ok(ex.estado, 'o estado do progresso vem junto')
  })
})

describe('cursos e treinos respondem', () => {
  test('GET /api/cursos e /api/treinos listam sem erro', async () => {
    const cursos = await api('/cursos')
    assert.equal(cursos.status, 200)
    assert.deepEqual(cursos.corpo.erros, [])
    const treinos = await api('/treinos')
    assert.equal(treinos.status, 200)
    assert.deepEqual(treinos.corpo.erros, [])
    assert.ok(treinos.corpo.treinos.length >= 1)
  })

  test('detalhe do treino sai sem gabarito antes de concluir', async () => {
    const lista = await api('/treinos')
    const id = lista.corpo.treinos[0].id
    const { status, corpo } = await api(`/treinos/${id}`)
    assert.equal(status, 200)
    assert.deepEqual(corpo.gabaritos, {})
    for (const etapa of corpo.treino.etapas) {
      if (etapa.tipo === 'cronometrado') assert.equal(etapa.corpo.perguntas.every((p) => p.resposta === undefined), true)
      if (etapa.tipo === 'desafio') assert.equal(etapa.corpo.exercicio.solucao, undefined)
    }
  })

  test('treino inexistente é 404', async () => {
    const r = await api('/treinos/nao-existe')
    assert.equal(r.status, 404)
  })
})

describe('isolamento do data/', () => {
  test('o progresso foi escrito na raiz temporária, não no data/ do projeto', async () => {
    await new Promise((r) => setTimeout(r, 200)) // a escrita é atômica e assíncrona
    const arquivo = path.join(raizTemp, 'data', 'progresso.json')
    assert.ok(fs.existsSync(arquivo), 'o progresso do teste tem que estar no temporário')
    const gravado = JSON.parse(fs.readFileSync(arquivo, 'utf8'))
    assert.ok(gravado.termos[`${DECK}/${TERMO}`])
    const dentroDoProjeto = path.resolve(arquivo).toLowerCase().startsWith(path.resolve(RAIZ).toLowerCase() + path.sep)
    assert.equal(dentroDoProjeto, false, 'o arquivo não pode estar dentro do projeto')
  })

  test('o data/progresso.json do projeto continua intocado', () => {
    assert.equal(marcaDoArquivo(ARQ_PROGRESSO_REAL), marcaProgressoReal)
  })
})
