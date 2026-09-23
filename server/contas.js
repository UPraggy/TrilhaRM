// Contas: cadastro, login e sessão. Cada pessoa tem a PRÓPRIA trajetória (progresso, XP, diário,
// entrevistas, treinos) — quem separa os arquivos é server/por-usuario.js; aqui só se sabe QUEM é.
//
// Decisões:
// - Senha com scrypt (node:crypto, sem dependência) + sal por usuário. Nunca se guarda a senha.
// - Sessão = token aleatório de 32 bytes num cookie HttpOnly. No disco fica só o SHA-256 do token:
//   quem ler data/sessoes.json não consegue se passar por ninguém.
// - A PRIMEIRA conta vira a do dono e herda o progresso que já existia (data/progresso.json). Como o
//   túnel é público, criá-la exige o "código do dono", gerado no primeiro boot sem contas e gravado em
//   data/codigo-dono.txt (e no log do PM2). Sem isso, quem achasse a URL primeiro levaria o progresso.
// - Depois do dono, o cadastro fica aberto por padrão; o dono fecha em Ajustes.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export const SESSAO_DIAS = 30
export const COOKIE = 'trilha_sessao'
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 }

export function hashSenha(senha, sal = crypto.randomBytes(16).toString('hex')) {
  const h = crypto.scryptSync(String(senha), sal, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p }).toString('hex')
  return { sal, hash: h }
}

export function conferirSenha(senha, sal, hash) {
  const outro = Buffer.from(hashSenha(senha, sal).hash, 'hex')
  const certo = Buffer.from(String(hash || ''), 'hex')
  return certo.length === outro.length && crypto.timingSafeEqual(certo, outro)
}

const sha = (x) => crypto.createHash('sha256').update(String(x)).digest('hex')

/** login: 3 a 32 caracteres, minúsculo, letras/números/ponto/traço/sublinhado */
export function normalizarLogin(login) {
  return String(login || '').trim().toLowerCase()
}

export function validarCadastro({ nome, login, senha }) {
  const n = String(nome || '').trim()
  const l = normalizarLogin(login)
  if (n.length < 2 || n.length > 60) return 'nome deve ter de 2 a 60 caracteres'
  if (!/^[a-z0-9._-]{3,32}$/.test(l)) return 'usuário deve ter de 3 a 32 caracteres: letras, números, ponto, traço ou sublinhado'
  if (typeof senha !== 'string' || senha.length < 8) return 'senha deve ter pelo menos 8 caracteres'
  if (senha.length > 200) return 'senha longa demais'
  return null
}

/** o que pode sair para o front: nunca hash nem sal */
export function publico(u) {
  return u ? { id: u.id, nome: u.nome, login: u.login, papel: u.papel, criadoEm: u.criadoEm } : null
}

/** lê o cookie da sessão do cabeçalho Cookie (sem dependência de cookie-parser) */
export function tokenDoCookie(cabecalho) {
  for (const parte of String(cabecalho || '').split(';')) {
    const i = parte.indexOf('=')
    if (i > 0 && parte.slice(0, i).trim() === COOKIE) return decodeURIComponent(parte.slice(i + 1).trim())
  }
  return null
}

export function criarContas({ dir }) {
  const arqUsuarios = path.join(dir, 'usuarios.json')
  const arqSessoes = path.join(dir, 'sessoes.json')
  const arqCodigo = path.join(dir, 'codigo-dono.txt')
  let dados = null
  let sessoes = null

  function lerJSON(arq, padrao) {
    try {
      return JSON.parse(fs.readFileSync(arq, 'utf8'))
    } catch (e) {
      if (e.code !== 'ENOENT') console.warn(`[contas] ${path.basename(arq)} ilegível:`, e.message)
      return padrao
    }
  }

  /** escrita atômica síncrona (temp + rename): conta e sessão são pequenas e não podem se perder */
  function gravar(arq, obj) {
    fs.mkdirSync(dir, { recursive: true })
    const tmp = `${arq}.${process.pid}.${Date.now()}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), { encoding: 'utf8', mode: 0o600 })
    fs.renameSync(tmp, arq)
  }

  function carregar() {
    if (dados) return dados
    const d = lerJSON(arqUsuarios, {})
    dados = { usuarios: Array.isArray(d.usuarios) ? d.usuarios : [], cadastroAberto: d.cadastroAberto !== false }
    return dados
  }

  function carregarSessoes() {
    if (sessoes) return sessoes
    const s = lerJSON(arqSessoes, {})
    sessoes = s && typeof s === 'object' && !Array.isArray(s) ? s : {}
    return sessoes
  }

  /** o código do dono só existe enquanto não há conta nenhuma */
  function codigoDono() {
    if (carregar().usuarios.length) return null
    try {
      const c = fs.readFileSync(arqCodigo, 'utf8').trim()
      if (c) return c
    } catch {
      /* gera abaixo */
    }
    const novo = crypto.randomBytes(4).toString('hex').toUpperCase()
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(arqCodigo, novo + '\n', { encoding: 'utf8', mode: 0o600 })
    return novo
  }

  function dono() {
    return carregar().usuarios.find((u) => u.papel === 'dono') || null
  }

  function obter(id) {
    return carregar().usuarios.find((u) => u.id === id) || null
  }

  function estado() {
    const d = carregar()
    return { temContas: d.usuarios.length > 0, precisaCodigo: d.usuarios.length === 0, cadastroAberto: d.usuarios.length === 0 || d.cadastroAberto }
  }

  function criarSessao(usuarioId) {
    const token = crypto.randomBytes(32).toString('base64url')
    const s = carregarSessoes()
    const agora = Date.now()
    for (const [k, v] of Object.entries(s)) if (!v || v.expira < agora) delete s[k] // faxina de vencidas
    s[sha(token)] = { usuarioId, criada: agora, expira: agora + SESSAO_DIAS * 86400_000 }
    gravar(arqSessoes, s)
    return token
  }

  function cadastrar({ nome, login, senha, codigo }) {
    const erro = validarCadastro({ nome, login, senha })
    if (erro) return { ok: false, status: 400, erro }
    const d = carregar()
    const primeira = d.usuarios.length === 0
    if (primeira) {
      const esperado = codigoDono()
      if (String(codigo || '').trim().toUpperCase() !== esperado)
        return { ok: false, status: 403, erro: 'código do dono inválido (está em data/codigo-dono.txt e no log do servidor)' }
    } else if (!d.cadastroAberto) {
      return { ok: false, status: 403, erro: 'o cadastro de novas contas está fechado' }
    }
    const l = normalizarLogin(login)
    if (d.usuarios.some((u) => u.login === l)) return { ok: false, status: 409, erro: 'esse usuário já existe' }
    const { sal, hash } = hashSenha(senha)
    const u = {
      id: primeira ? 'dono' : crypto.randomBytes(6).toString('hex'),
      nome: String(nome).trim(),
      login: l,
      papel: primeira ? 'dono' : 'aluno',
      sal,
      hash,
      criadoEm: new Date().toISOString(),
    }
    d.usuarios.push(u)
    gravar(arqUsuarios, d)
    if (primeira) fs.rmSync(arqCodigo, { force: true })
    return { ok: true, usuario: publico(u), token: criarSessao(u.id) }
  }

  function entrar({ login, senha }) {
    const u = carregar().usuarios.find((x) => x.login === normalizarLogin(login))
    // mesma mensagem e mesmo custo (scrypt) para usuário inexistente: não dá para sondar quem existe
    if (!u) {
      hashSenha(String(senha || ''))
      return { ok: false, status: 401, erro: 'usuário ou senha incorretos' }
    }
    if (!conferirSenha(String(senha || ''), u.sal, u.hash)) return { ok: false, status: 401, erro: 'usuário ou senha incorretos' }
    return { ok: true, usuario: publico(u), token: criarSessao(u.id) }
  }

  /** token do cookie -> usuário (ou null) */
  function daSessao(token) {
    if (!token) return null
    const s = carregarSessoes()[sha(token)]
    if (!s || s.expira < Date.now()) return null
    return obter(s.usuarioId)
  }

  function sair(token) {
    if (!token) return
    const s = carregarSessoes()
    if (s[sha(token)]) {
      delete s[sha(token)]
      gravar(arqSessoes, s)
    }
  }

  function trocarSenha(usuarioId, { atual, nova }) {
    const d = carregar()
    const u = d.usuarios.find((x) => x.id === usuarioId)
    if (!u) return { ok: false, status: 404, erro: 'usuário não encontrado' }
    if (!conferirSenha(String(atual || ''), u.sal, u.hash)) return { ok: false, status: 401, erro: 'senha atual incorreta' }
    if (typeof nova !== 'string' || nova.length < 8 || nova.length > 200) return { ok: false, status: 400, erro: 'senha nova deve ter pelo menos 8 caracteres' }
    Object.assign(u, hashSenha(nova))
    gravar(arqUsuarios, d)
    // derruba as outras sessões desta pessoa: trocar senha é o que se faz quando se desconfia de algo
    const s = carregarSessoes()
    for (const [k, v] of Object.entries(s)) if (v.usuarioId === usuarioId) delete s[k]
    gravar(arqSessoes, s)
    return { ok: true, token: criarSessao(usuarioId) }
  }

  function listar() {
    return carregar().usuarios.map(publico)
  }

  function definirCadastroAberto(aberto) {
    const d = carregar()
    d.cadastroAberto = Boolean(aberto)
    gravar(arqUsuarios, d)
    return d.cadastroAberto
  }

  return { estado, codigoDono, dono, obter, cadastrar, entrar, daSessao, sair, trocarSenha, listar, definirCadastroAberto }
}
