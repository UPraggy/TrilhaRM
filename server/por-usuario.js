// Um progresso por pessoa, sem reescrever o servidor.
//
// Todo módulo (estrutura, lição, mentor, entrevista, tutor, bot) recebeu, desde a V1, UM objeto
// `progresso`. Em vez de passar o usuário por dezenas de funções, eles passam a receber um PROCURADOR:
// cada chamada (`progresso.obter()`, `progresso.avaliar(...)`) é entregue ao progresso de quem fez a
// requisição — descoberto pelo AsyncLocalStorage que o middleware de sessão abre (ver index.js).
//
// Onde mora cada um:
//   dono  -> data/progresso.json e data/progresso-treinos.json  (os arquivos de sempre: nada migra)
//   outro -> data/usuarios/<id>/progresso.json e progresso-treinos.json
// Fora de uma requisição (o bot do Telegram, que é do dono) o procurador cai no dono.
import { AsyncLocalStorage } from 'node:async_hooks'
import path from 'node:path'
import { criarProgresso } from './progresso.js'
import { criarProgressoTreinos } from './progresso-treinos.js'

export const DONO = 'dono'

export function criarPorUsuario({ dirDados }) {
  const contexto = new AsyncLocalStorage()
  const instancias = new Map() // usuarioId -> { progresso, progTreinos }

  function arquivos(usuarioId) {
    if (usuarioId === DONO) return { progresso: path.join(dirDados, 'progresso.json'), treinos: path.join(dirDados, 'progresso-treinos.json') }
    if (!/^[a-f0-9]{12}$/.test(usuarioId)) throw new Error(`id de usuário inválido: ${usuarioId}`) // nunca vira caminho solto
    const d = path.join(dirDados, 'usuarios', usuarioId)
    return { progresso: path.join(d, 'progresso.json'), treinos: path.join(d, 'progresso-treinos.json') }
  }

  function de(usuarioId) {
    let i = instancias.get(usuarioId)
    if (!i) {
      const arq = arquivos(usuarioId)
      const progresso = criarProgresso(arq.progresso)
      i = { progresso, progTreinos: criarProgressoTreinos(progresso, { arquivo: arq.treinos }) }
      instancias.set(usuarioId, i)
    }
    return i
  }

  const usuarioAtual = () => (contexto.getStore() && contexto.getStore().usuarioId) || DONO

  function procurador(qual) {
    return new Proxy(
      {},
      {
        get(_alvo, prop) {
          const real = de(usuarioAtual())[qual]
          const v = real[prop]
          return typeof v === 'function' ? v.bind(real) : v
        },
      },
    )
  }

  return {
    progresso: procurador('progresso'),
    progTreinos: procurador('progTreinos'),
    /** roda `fn` como se fosse `usuarioId` (o middleware de sessão usa isto em cada requisição) */
    como: (usuarioId, fn) => contexto.run({ usuarioId }, fn),
    usuarioAtual,
    de,
    /** espera as escritas pendentes de TODAS as pessoas (desligamento limpo do PM2) */
    aguardarEscrita: () => Promise.all([...instancias.values()].flatMap((i) => [i.progresso.aguardarEscrita(), i.progTreinos.aguardarEscrita ? i.progTreinos.aguardarEscrita() : null])),
  }
}
