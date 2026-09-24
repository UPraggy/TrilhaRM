// O bot com contas: um chat por pessoa. O Telegram é FALSO (fetchImpl) — nada sai para a rede.
import test, { after, before, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { criarCursos } from '../server/cursos.js'
import { criarRepositorio } from '../server/decks.js'
import { criarPorUsuario } from '../server/por-usuario.js'
import { criarPraticas } from '../server/praticas.js'
import { criarTelegram, migrarEstado } from '../server/telegram.js'
import { criarTreinos } from '../server/treinos.js'
import { apagarTemp, CONTEUDO, dirTemp } from './_ajuda.mjs'

const ALUNA = 'a1b2c3d4e5f6'
const NOMES = { dono: 'Rafael', [ALUNA]: 'Ana' }

let dir
let tg
let pu
let enviados // [{ metodo, chatId, texto }]

/** Telegram falso: responde ok e anota o destino e o texto de cada envio */
async function telegramFalso(url, opts) {
  const metodo = String(url).split('/').pop()
  let chatId = null
  let texto = ''
  if (metodo === 'sendPhoto') {
    const corpo = opts.body.toString('latin1')
    chatId = (/name="chat_id"\r\n\r\n([^\r]*)/.exec(corpo) || [])[1] || null
    texto = Buffer.from((/name="caption"\r\n\r\n([\s\S]*?)\r\n--/.exec(corpo) || [])[1] || '', 'latin1').toString('utf8')
  } else if (opts && typeof opts.body === 'string') {
    const b = JSON.parse(opts.body)
    chatId = b.chat_id ? String(b.chat_id) : null
    texto = b.text || ''
  }
  if (metodo === 'sendMessage' || metodo === 'sendPhoto') enviados.push({ metodo, chatId, texto, corpo: opts.body })
  return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, result: { message_id: 1 } }) }
}

const msg = (chatId, text, nome = 'Fulano') => ({ update_id: 1, message: { chat: { id: chatId, type: 'private' }, from: { first_name: nome }, text } })

before(() => {
  dir = dirTemp('trilharm-tg-')
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ telegramToken: '123456789:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' }))
  fs.writeFileSync(path.join(dir, 'tunnel-url.txt'), 'https://exemplo.trycloudflare.com')
  // telegram.json v1: um chat só (o do dono), com lembrete personalizado
  fs.writeFileSync(path.join(dir, 'telegram.json'), JSON.stringify({ versao: 1, offset: 5, chatId: 111, chatNome: 'Rafael', lembrete: '07:15', avisos: true, enviados: {}, decksFortes: [] }))
  const repo = criarRepositorio(CONTEUDO)
  pu = criarPorUsuario({ dirDados: dir })
  tg = criarTelegram({
    arquivoConfig: path.join(dir, 'config.json'),
    arquivoEstado: path.join(dir, 'telegram.json'),
    arquivoTunnel: path.join(dir, 'tunnel-url.txt'),
    repo,
    praticas: criarPraticas(CONTEUDO, repo),
    cursos: criarCursos(CONTEUDO, repo),
    treinos: criarTreinos(CONTEUDO, repo),
    progresso: pu.progresso,
    progTreinos: pu.progTreinos,
    comoUsuario: (id, fn) => pu.como(id, fn),
    nomeDoUsuario: (id) => NOMES[id] || '',
    usuarioExiste: (id) => id in NOMES,
    fetchImpl: telegramFalso,
    log: () => {},
  })
})

after(async () => {
  await tg.aguardarEscrita()
  await pu.aguardarEscrita()
  apagarTemp(dir)
})

describe('telegram — um chat por conta', () => {
  test('migrarEstado: o chat da v1 vira o chat do dono, com lembrete e offset preservados', () => {
    const e = migrarEstado({ offset: 9, chatId: 42, chatNome: 'R', lembrete: '06:00', avisos: false })
    assert.equal(e.versao, 2)
    assert.equal(e.offset, 9)
    assert.equal(e.chats['42'].usuarioId, 'dono')
    assert.equal(e.chats['42'].lembrete, '06:00')
    assert.equal(e.chats['42'].avisos, false)
    assert.equal('chatId' in e, false)
  })

  test('o chat antigo do dono continua respondendo, com o progresso do dono', async () => {
    enviados = []
    pu.como('dono', () => pu.progresso.somarXp(40))
    await tg._interno.processarUpdate(msg(111, '/ofensiva', 'Rafael'))
    assert.equal(enviados.length, 1)
    assert.equal(enviados[0].chatId, '111')
    assert.equal(tg.obterConfig().lembrete, '07:15')
  })

  test('/start de um desconhecido recebe o passo a passo com o link de conexão (e nada do dono)', async () => {
    enviados = []
    await tg._interno.processarUpdate(msg(222, '/start', 'Ana'))
    assert.equal(enviados.length, 1)
    const e = enviados[0]
    assert.equal(e.chatId, '222')
    assert.match(e.texto, /Criar conta ou entrar/)
    assert.match(e.texto, /30 minutos/)
    assert.match(e.corpo, /https:\/\/exemplo\.trycloudflare\.com\/\?vincular=/)
    // outros comandos também recebem o passo a passo, não o progresso de ninguém
    enviados = []
    await tg._interno.processarUpdate(msg(222, '/matriz', 'Ana'))
    assert.match(enviados[0].texto, /Criar conta ou entrar/)
  })

  test('o link liga o chat à conta que entrou; daí em diante o bot usa o progresso DELA', async () => {
    enviados = []
    await tg._interno.processarUpdate(msg(222, '/start', 'Ana'))
    const token = decodeURIComponent(/vincular=([^"&]+)/.exec(enviados[0].corpo)[1])
    enviados = []
    const r = await tg.vincularPorToken(token, ALUNA)
    assert.equal(r.ok, true)
    assert.match(enviados[0].texto, /Conectado como Ana/)
    assert.equal(enviados[0].chatId, '222')
    // o token é de uso único
    assert.equal((await tg.vincularPorToken(token, ALUNA)).ok, false)
    // o progresso consultado no chat dela é o dela: XP 0, não os 40 do dono
    const xp = await tg._interno.comoChat('222', () => pu.progresso.obter().xp.total)
    assert.equal(xp, 0)
    assert.deepEqual(tg.chatsDoUsuario(ALUNA).map((c) => c.id), ['222'])
    assert.deepEqual(tg.chatsDoUsuario('dono').map((c) => c.id), ['111'])
  })

  test('o tick manda o lembrete de cada chat, na hora de cada um', async () => {
    enviados = []
    const r = await tg.tick(new Date(2026, 8, 23, 7, 30)) // 07:30: passou das 07:15 do dono, não das 08:30 da Ana
    assert.ok(r.feito.some((x) => x.startsWith('111:lembrete')), JSON.stringify(r))
    assert.equal(r.feito.some((x) => x.startsWith('222:lembrete')), false)
    const r2 = await tg.tick(new Date(2026, 8, 23, 8, 45))
    assert.ok(r2.feito.some((x) => x.startsWith('222:lembrete')), JSON.stringify(r2))
    assert.equal(r2.feito.some((x) => x.startsWith('111:lembrete')), false, 'o dono já recebeu o de hoje')
  })

  test('/desconectar desliga o chat; a próxima mensagem volta ao passo a passo', async () => {
    enviados = []
    await tg._interno.processarUpdate(msg(222, '/desconectar', 'Ana'))
    assert.match(enviados[0].texto, /desligado da sua conta/)
    enviados = []
    await tg._interno.processarUpdate(msg(222, 'oi', 'Ana'))
    assert.match(enviados[0].texto, /Criar conta ou entrar/)
    assert.deepEqual(tg.chatsDoUsuario(ALUNA), [])
  })

  test('grupo é ignorado: progresso pessoal não vai para um chat coletivo', async () => {
    enviados = []
    await tg._interno.processarUpdate({ update_id: 2, message: { chat: { id: -900, type: 'group' }, from: { first_name: 'X' }, text: '/start' } })
    assert.equal(enviados.length, 0)
  })
})
