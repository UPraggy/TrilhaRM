// Ajudantes dos testes. NÃO é um arquivo de teste (o node --test só pega *.test.js).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { hojeISO } from '../server/sm2.js'

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const CONTEUDO = path.join(RAIZ, 'content')

/** diretório temporário de verdade (nunca o data/ do projeto) */
export function dirTemp(prefixo = 'trilharm-teste-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefixo))
}

/** apaga um temporário; desfaz junctions primeiro para nunca tocar no alvo real */
export function apagarTemp(dir) {
  if (!dir || !dir.startsWith(os.tmpdir())) return
  for (const nome of safeReaddir(dir)) {
    const p = path.join(dir, nome)
    try {
      if (fs.lstatSync(p).isSymbolicLink()) fs.unlinkSync(p)
    } catch {
      /* ignora */
    }
  }
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 })
  } catch {
    /* no Windows o antivírus às vezes segura o arquivo; não é falha de teste */
  }
}

function safeReaddir(dir) {
  try {
    return fs.readdirSync(dir)
  } catch {
    return []
  }
}

/** dia local deslocado em N dias (meio-dia evita qualquer surpresa de fuso/horário de verão) */
export function diaRelativo(n, base = new Date()) {
  const d = new Date(base.getTime())
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() + n)
  return hojeISO(d)
}

/** YYYY-MM-DD montado à mão a partir da data local (referência independente do hojeISO) */
export function diaLocalManual(d) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** repositório de decks falso, com a mesma interface de server/decks.js */
export function repoFalso(decks) {
  const lista = decks.map((d) => ({ fase: 1, ordem: 1, titulo: d.id, ...d }))
  return {
    listar: () => lista,
    obter: (id) => lista.find((d) => d.id === id) || null,
    trilhas: () => ({ fases: [], origem: 'auto' }),
    erros: () => [],
    recarregarSePreciso: () => false,
  }
}

/** deck mínimo usável pelos normalizadores (praticas/cursos/treinos) */
export function deckFalso(id = 'deck-teste', termos = ['termo-a', 'termo-b']) {
  return { id, titulo: `Deck ${id}`, fase: 1, ordem: 1, termos: termos.map((t) => ({ id: t, termo: t, definicao: 'def' })) }
}
