// O contrato do i18n: todo t('…') do código precisa existir em src/i18n/en.json.
//
// Como a CHAVE é o próprio texto em português (ver src/i18n/index.jsx), corrigir um typo em PT
// "perde" a tradução daquela string sem quebrar nada — o app cai no fallback e ninguém percebe.
// Este teste é justamente a rede contra esse silêncio.
import test, { describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { traduzir, plural } from '../src/i18n/nucleo.js'
import { criarI18n, traduzir as traduzirServidor, EN as EN_SERVIDOR } from '../server/i18n.js'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const EN = JSON.parse(fs.readFileSync(path.join(RAIZ, 'src/i18n/en.json'), 'utf8'))

/** todos os .js/.jsx de src/, menos o próprio i18n */
function arquivosDoFront() {
  const out = []
  ;(function anda(d) {
    for (const nome of fs.readdirSync(d)) {
      const p = path.join(d, nome)
      if (fs.statSync(p).isDirectory()) anda(p)
      else if (/\.jsx?$/.test(p) && !p.includes(`${path.sep}i18n${path.sep}`)) out.push(p)
    }
  })(path.join(RAIZ, 'src'))
  return out
}

/** as chaves literais usadas em t('…') / t("…") — t(variavel) é ignorado de propósito */
function chavesUsadas() {
  const usos = new Map() // chave -> arquivos
  for (const arq of arquivosDoFront()) {
    const src = fs.readFileSync(arq, 'utf8')
    for (const m of src.matchAll(/\bt\(\s*'((?:[^'\\]|\\.)*)'/g)) {
      const chave = m[1].replace(/\\'/g, "'")
      if (!usos.has(chave)) usos.set(chave, [])
      usos.get(chave).push(path.relative(RAIZ, arq))
    }
    for (const m of src.matchAll(/\bt\(\s*"((?:[^"\\]|\\.)*)"/g)) {
      const chave = m[1].replace(/\\"/g, '"')
      if (!usos.has(chave)) usos.set(chave, [])
      usos.get(chave).push(path.relative(RAIZ, arq))
    }
  }
  return usos
}

describe('i18n — o dicionário cobre o que o código pede', () => {
  test('todo t(\'…\') literal existe em en.json', () => {
    const usos = chavesUsadas()
    const faltando = [...usos.entries()].filter(([k]) => !(k in EN))
    const lista = faltando.map(([k, arqs]) => `  - "${k}"  (${arqs[0]})`).join('\n')
    assert.equal(
      faltando.length,
      0,
      `${faltando.length} chave(s) usada(s) no código e ausente(s) em src/i18n/en.json:\n${lista}\n` +
        'Sem a chave, a tela fica em português quando o idioma é EN.',
    )
  })

  test('en.json não tem chave sobrando (tradução órfã)', () => {
    const usos = chavesUsadas()
    // as chaves que vêm de DADO (nav.js, rótulos de nível, modos) são usadas como t(variavel) e
    // por isso não aparecem na varredura — a lista abaixo é a exceção declarada.
    const deDado = new Set([
      ...JSON.parse(fs.readFileSync(path.join(RAIZ, 'src/i18n/en.json'), 'utf8'))._deDado || [],
    ])
    const orfas = Object.keys(EN).filter((k) => !k.startsWith('_') && !usos.has(k) && !deDado.has(k))
    // órfã não quebra nada (só ocupa espaço); o teste só AVISA quando passa de um limite generoso,
    // para não travar o desenvolvimento a cada string removida de uma tela.
    assert.ok(
      orfas.length < 220,
      `${orfas.length} traduções sem uso em en.json — provavelmente sobrou texto de tela reescrita:\n  ${orfas.slice(0, 12).join('\n  ')}`,
    )
  })

  test('cada chave tem uma tradução não vazia e diferente de si mesma quando faz sentido', () => {
    const suspeitas = Object.entries(EN).filter(([k, v]) => !k.startsWith('_') && (typeof v !== 'string' || !v.trim()))
    assert.deepEqual(suspeitas, [], 'chave com tradução vazia em en.json')
  })
})

describe('i18n — a função de tradução', () => {
  test('sem tradução devolve o próprio texto, nunca a chave crua nem vazio', () => {
    assert.equal(traduzir('en', 'uma frase que não existe no dicionário'), 'uma frase que não existe no dicionário')
    assert.equal(traduzir('pt', 'Início'), 'Início')
  })

  test('traduz quando a chave existe', () => {
    assert.equal(traduzir('en', 'Início'), 'Home')
    assert.equal(traduzir('en', 'Biblioteca'), 'Library')
  })

  test('interpola por {chave}', () => {
    assert.equal(traduzir('pt', 'faltam {n} de {t}', { n: 3, t: 10 }), 'faltam 3 de 10')
    assert.equal(traduzir('pt', '{a} e {a}', { a: 'x' }), 'x e x', 'a mesma variável pode repetir')
  })

  test('plural escolhe a forma pelo número', () => {
    assert.equal(plural('en', 'dia', 'dias', 1), 'day')
    assert.equal(plural('en', 'dia', 'dias', 2), 'days')
    assert.equal(plural('pt', 'dia', 'dias', 0), 'dias')
  })

  test('idioma desconhecido cai no português em vez de quebrar', () => {
    assert.equal(traduzir('xx', 'Início'), 'Início')
  })
})

describe('i18n do servidor (bot e cards)', () => {
  test('traduz e cai no próprio texto quando falta', () => {
    assert.equal(traduzirServidor('en', 'Tarefas de hoje'), "Today's tasks")
    assert.equal(traduzirServidor('en', 'frase inexistente'), 'frase inexistente')
    assert.equal(traduzirServidor('pt', 'Tarefas de hoje'), 'Tarefas de hoje')
  })

  test('lê o idioma do config a cada chamada — trocar na tela vale sem restart do bot', () => {
    const tmp = path.join(RAIZ, 'data', `.i18n-teste-${process.pid}.json`)
    fs.mkdirSync(path.dirname(tmp), { recursive: true })
    try {
      fs.writeFileSync(tmp, JSON.stringify({ idioma: 'pt' }))
      const i18n = criarI18n(tmp)
      assert.equal(i18n.idioma(), 'pt')
      assert.equal(i18n.t('Tarefas de hoje'), 'Tarefas de hoje')

      fs.writeFileSync(tmp, JSON.stringify({ idioma: 'en' }))
      assert.equal(i18n.idioma(), 'en', 'o mesmo objeto precisa enxergar a troca')
      assert.equal(i18n.t('Tarefas de hoje'), "Today's tasks")
      assert.equal(i18n.tp('dia', 'dias', 3), 'days')
      assert.equal(i18n.ehEN(), true)
    } finally {
      fs.rmSync(tmp, { force: true })
    }
  })

  test('config ilegível ou ausente cai no português em vez de estourar', () => {
    const i18n = criarI18n(path.join(RAIZ, 'data', 'nao-existe-mesmo.json'))
    assert.equal(i18n.idioma(), 'pt')
    assert.equal(i18n.t('Tarefas de hoje'), 'Tarefas de hoje')
  })

  test('o dicionário do servidor não tem tradução vazia', () => {
    const vazias = Object.entries(EN_SERVIDOR).filter(([, v]) => typeof v !== 'string' || !v.trim())
    assert.deepEqual(vazias, [])
  })
})
