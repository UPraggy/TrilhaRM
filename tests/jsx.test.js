// Atributo repetido no mesmo elemento JSX não dá erro: o último vence e o primeiro some em silêncio.
// Foi assim que o botão do DeckPage perdeu `btn btn--sm btn--ghost` e virou botão cru do navegador.
// O esbuild só AVISA no build; este teste reprova.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function jsx(d, out = []) {
  for (const nome of fs.readdirSync(d)) {
    const p = path.join(d, nome)
    if (fs.statSync(p).isDirectory()) jsx(p, out)
    else if (p.endsWith('.jsx')) out.push(p)
  }
  return out
}

/** as tags de abertura de um arquivo, sem descer em {expressões} (onde pode haver outra tag) */
function atributosRepetidos(src) {
  const achados = []
  const re = /<([A-Za-z][\w.]*)\s/g
  let m
  while ((m = re.exec(src))) {
    let i = m.index + m[0].length
    let prof = 0
    let str = null
    let fim = -1
    const topo = []
    let atual = ''
    for (; i < src.length; i++) {
      const c = src[i]
      if (str) {
        if (c === str) str = null
        continue
      }
      if (prof > 0) {
        if (c === '{') prof++
        else if (c === '}') prof--
        else if (c === '`' || c === "'" || c === '"') str = c
        continue
      }
      if (c === '{') prof++
      else if (c === '"' || c === "'") str = c
      else if (c === '>') {
        fim = i
        break
      }
      atual += c
    }
    if (fim < 0) continue
    for (const a of atual.matchAll(/(?:^|\s)([A-Za-z][\w-]*)=/g)) topo.push(a[1])
    const vistos = new Set()
    for (const nome of topo) {
      if (vistos.has(nome)) achados.push(`${nome} em <${m[1]}> (linha ${src.slice(0, m.index).split('\n').length})`)
      vistos.add(nome)
    }
  }
  return achados
}

test('nenhum elemento JSX repete atributo (o último venceria em silêncio)', () => {
  const erros = []
  for (const arq of jsx(path.join(RAIZ, 'src'))) {
    for (const a of atributosRepetidos(fs.readFileSync(arq, 'utf8'))) erros.push(`${path.relative(RAIZ, arq)}: ${a}`)
  }
  assert.deepEqual(erros, [])
})

test('o detector pega o caso real que escapou', () => {
  assert.equal(atributosRepetidos('<button className="btn" className="ml-auto" onClick={() => f({ a: 1 })}>x</button>').length, 1)
  assert.equal(atributosRepetidos('<div className={`a ${b ? "c" : ""}`} style={{ x: 1 }}><span className="d" /></div>').length, 0)
})
