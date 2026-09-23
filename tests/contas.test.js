// Contas (server/contas.js) e o separador por pessoa (server/por-usuario.js), sem subir servidor.
import test, { describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { conferirSenha, criarContas, hashSenha, publico, tokenDoCookie, validarCadastro } from '../server/contas.js'
import { criarPorUsuario } from '../server/por-usuario.js'
import { apagarTemp, dirTemp } from './_ajuda.mjs'

describe('contas — peças puras', () => {
  test('senha: o hash confere com a certa e recusa a errada; sal diferente, hash diferente', () => {
    const a = hashSenha('senha-boa-123')
    assert.equal(conferirSenha('senha-boa-123', a.sal, a.hash), true)
    assert.equal(conferirSenha('senha-ruim', a.sal, a.hash), false)
    assert.notEqual(hashSenha('senha-boa-123').hash, a.hash)
  })

  test('cookie: acha a sessão no meio de outros cookies', () => {
    assert.equal(tokenDoCookie('a=1; trilha_sessao=abc%2Bd; b=2'), 'abc+d')
    assert.equal(tokenDoCookie('outro=1'), null)
    assert.equal(tokenDoCookie(undefined), null)
  })

  test('validação do cadastro', () => {
    assert.equal(validarCadastro({ nome: 'Ana', login: 'ana', senha: '12345678' }), null)
    assert.match(validarCadastro({ nome: 'A', login: 'ana', senha: '12345678' }), /nome/)
    assert.match(validarCadastro({ nome: 'Ana', login: 'a b', senha: '12345678' }), /usuário/)
    assert.match(validarCadastro({ nome: 'Ana', login: 'ana', senha: 'curta' }), /senha/)
  })

  test('publico() nunca devolve hash nem sal', () => {
    const p = publico({ id: 'x', nome: 'N', login: 'n', papel: 'aluno', sal: 's', hash: 'h', criadoEm: 'd' })
    assert.equal('hash' in p || 'sal' in p, false)
  })
})

describe('contas — fluxo no disco', () => {
  test('dono exige código; depois dele o cadastro é aberto; sessão no disco é só o hash do token', () => {
    const dir = dirTemp()
    try {
      const c = criarContas({ dir })
      const codigo = c.codigoDono()
      assert.match(codigo, /^[0-9A-F]{8}$/)
      assert.equal(c.cadastrar({ nome: 'Dono', login: 'dono', senha: '12345678', codigo: 'ERRADO' }).status, 403)
      const d = c.cadastrar({ nome: 'Dono', login: 'dono', senha: '12345678', codigo: codigo.toLowerCase() })
      assert.equal(d.ok, true)
      assert.equal(d.usuario.id, 'dono')
      assert.equal(c.codigoDono(), null, 'o código some depois da primeira conta')
      assert.equal(c.cadastrar({ nome: 'Ana', login: 'dono', senha: '12345678' }).status, 409)
      const a = c.cadastrar({ nome: 'Ana', login: 'ana', senha: '12345678' })
      assert.equal(a.usuario.papel, 'aluno')
      assert.equal(c.daSessao(a.token).login, 'ana')
      assert.equal(fs.readFileSync(path.join(dir, 'sessoes.json'), 'utf8').includes(a.token), false)
      c.sair(a.token)
      assert.equal(c.daSessao(a.token), null)
    } finally {
      apagarTemp(dir)
    }
  })

  test('por-usuario: cada pessoa grava no próprio arquivo; fora de requisição vale o dono', async () => {
    const dir = dirTemp()
    try {
      const pu = criarPorUsuario({ dirDados: dir })
      pu.como('dono', () => pu.progresso.somarXp(10))
      pu.como('a1b2c3d4e5f6', () => pu.progresso.somarXp(3))
      assert.equal(pu.progresso.obter().xp.total, 10) // sem contexto = dono
      assert.equal(pu.como('a1b2c3d4e5f6', () => pu.progresso.obter().xp.total), 3)
      await pu.aguardarEscrita()
      assert.ok(fs.existsSync(path.join(dir, 'progresso.json')))
      assert.ok(fs.existsSync(path.join(dir, 'usuarios', 'a1b2c3d4e5f6', 'progresso.json')))
      assert.throws(() => pu.como('../../etc', () => pu.progresso.obter()), /inválido/)
    } finally {
      apagarTemp(dir)
    }
  })
})
