// server/markdown.js — frontmatter, blocos e a hierarquia do curso.
import assert from 'node:assert/strict'
import test, { describe } from 'node:test'
import { kebab, mdParaBlocos, parseAtividadeBruta, parseCurso, parseEscalar, parseFrontmatter, parseInline, parseYaml } from '../server/markdown.js'

const CURSO = `---
titulo: HTTP do zero
id: http-do-zero
fase: 1
deck: http-networking
tags: [http, rede]
---

# HTTP do zero

Primeira frase da intro.

## Requisição {#req}

Texto do módulo.

### O que é um request

Parágrafo com **negrito**, *itálico*, \`code\` e [[http-networking/status-code]] e [[libuv]].

| método | idempotente |
| --- | :---: |
| GET | sim |
| POST | não |

- primeiro
  - filho do primeiro
- segundo

\`\`\`bash
curl -v https://exemplo.com
\`\`\`

> uma citação
> na mesma frase

:::alerta Cuidado
não confie no cliente
:::

:::atividade
id: contar-bytes
termos: [status-code]
ambiente: node
entrega:
  tipo: numero
  esperado: 58
  tolerancia: 0
---
Quantos bytes?
---
São 58 bytes.
:::

### Segunda lição {#seg}

Fim.
`

describe('parseFrontmatter', () => {
  const r = parseFrontmatter(CURSO)

  test('lê o YAML do topo e separa o corpo', () => {
    assert.equal(r.meta.titulo, 'HTTP do zero')
    assert.equal(r.meta.fase, 1)
    assert.deepEqual(r.meta.tags, ['http', 'rede'])
    assert.equal(r.corpo.trimStart().startsWith('# HTTP do zero'), true)
    assert.equal(r.linhaCorpo, 8)
  })

  test('arquivo sem frontmatter devolve corpo inteiro', () => {
    const s = parseFrontmatter('# Só o título\n\ntexto')
    assert.deepEqual(s.meta, {})
    assert.equal(s.corpo, '# Só o título\n\ntexto')
    assert.equal(s.linhaCorpo, 1)
  })

  test('frontmatter não fechado não engole o arquivo', () => {
    const s = parseFrontmatter('---\ntitulo: X\n\n# nunca fecha')
    assert.deepEqual(s.meta, {})
    assert.match(s.corpo, /nunca fecha/)
  })

  test('escalares do YAML: número, booleano, lista e aspas', () => {
    assert.equal(parseEscalar('12'), 12)
    assert.equal(parseEscalar('true'), true)
    assert.equal(parseEscalar('"com espaço"'), 'com espaço')
    assert.deepEqual(parseEscalar('[a, b]'), ['a', 'b'])
    const y = parseYaml('a: 1\nb:\n  c: texto\nlista:\n  - um\n  - dois')
    assert.deepEqual(y, { a: 1, b: { c: 'texto' }, lista: ['um', 'dois'] })
  })
})

describe('parseInline', () => {
  test('negrito, itálico, código e link', () => {
    const nos = parseInline('a **b** *c* `d` [e](https://x.com)')
    assert.deepEqual(
      nos.map((n) => n.t),
      ['txt', 'b', 'txt', 'i', 'txt', 'code', 'txt', 'link'],
    )
    assert.equal(nos[7].href, 'https://x.com')
    assert.equal(nos[7].v, 'e')
  })

  test('wikilink com deck e sem deck', () => {
    const [a] = parseInline('[[node-internals/event-loop]]')
    assert.equal(a.t, 'wiki')
    assert.equal(a.deckId, 'node-internals')
    assert.equal(a.termoId, 'event-loop')
    const [b] = parseInline('[[event-loop]]')
    assert.equal(b.deckId, '')
    assert.equal(b.termoId, 'event-loop')
    const [c] = parseInline('[[node-internals/event-loop|o laço]]')
    assert.equal(c.v, 'o laço')
  })

  test('texto sem marcação vira um nó txt só', () => {
    assert.deepEqual(parseInline('nada aqui'), [{ t: 'txt', v: 'nada aqui' }])
    assert.deepEqual(parseInline(''), [{ t: 'txt', v: '' }])
  })
})

describe('mdParaBlocos', () => {
  const blocos = mdParaBlocos(CURSO.split('### O que é um request')[1].split('### Segunda lição')[0])

  test('reconhece todos os blocos da lição na ordem', () => {
    assert.deepEqual(
      blocos.map((b) => b.tipo),
      ['p', 'tabela', 'lista', 'codigo', 'citacao', 'callout', 'atividade'],
    )
  })

  test('tabela GFM com cabeçalho, alinhamento e linhas', () => {
    const t = blocos.find((b) => b.tipo === 'tabela')
    assert.equal(t.cabecalho.length, 2)
    assert.equal(t.cabecalho[0][0].v, 'método')
    assert.deepEqual(t.alinhamento, ['left', 'center'])
    assert.equal(t.linhas.length, 2)
    assert.equal(t.linhas[1][0][0].v, 'POST')
  })

  test('lista aninhada marca o nível do filho', () => {
    const l = blocos.find((b) => b.tipo === 'lista')
    assert.equal(l.ordenada, false)
    assert.deepEqual(
      l.itens.map((i) => i.nivel),
      [0, 1, 0],
    )
    assert.equal(l.itens[1].inline[0].v, 'filho do primeiro')
  })

  test('lista ordenada é reconhecida separadamente', () => {
    const [l] = mdParaBlocos('1. um\n2. dois')
    assert.equal(l.tipo, 'lista')
    assert.equal(l.ordenada, true)
    assert.equal(l.itens.length, 2)
  })

  test('bloco de código guarda a linguagem e o conteúdo cru', () => {
    const c = blocos.find((b) => b.tipo === 'codigo')
    assert.equal(c.lang, 'bash')
    assert.equal(c.codigo, 'curl -v https://exemplo.com')
  })

  test('citação junta as linhas em um parágrafo', () => {
    const q = blocos.find((b) => b.tipo === 'citacao')
    assert.equal(q.paragrafos.length, 1)
    assert.equal(q.paragrafos[0][0].v, 'uma citação na mesma frase')
  })

  test('container :::alerta vira callout com título e blocos dentro', () => {
    const c = blocos.find((b) => b.tipo === 'callout')
    assert.equal(c.variante, 'alerta')
    assert.equal(c.titulo, 'Cuidado')
    assert.equal(c.blocos[0].tipo, 'p')
  })

  test('container desconhecido cai para a variante nota', () => {
    const [c] = mdParaBlocos(':::seila\ntexto\n:::')
    assert.equal(c.tipo, 'callout')
    assert.equal(c.variante, 'nota')
  })

  test('título vira h2/h3 com id explícito ou derivado', () => {
    const b = mdParaBlocos('## Um título\n\n### Outro {#meu-id}')
    assert.equal(b[0].tipo, 'h2')
    assert.equal(b[0].id, 'um-titulo')
    assert.equal(b[1].tipo, 'h3')
    assert.equal(b[1].id, 'meu-id')
  })

  test('# dentro de bloco de código não vira título', () => {
    const b = mdParaBlocos('```sh\n# isto é um comentário\n```')
    assert.equal(b.length, 1)
    assert.equal(b[0].tipo, 'codigo')
  })

  test('kebab tira acento e pontuação', () => {
    assert.equal(kebab('Ação & Reação!'), 'acao-reacao')
    assert.equal(kebab(''), '')
  })
})

describe('parseAtividadeBruta', () => {
  test('YAML + enunciado + solução separados pelos ---', () => {
    const a = parseAtividadeBruta('id: x\nentrega:\n  tipo: saida\n  esperado: ok\n---\nFaça isso\n---\nA resposta')
    assert.equal(a.id, 'x')
    assert.deepEqual(a.entrega, { tipo: 'saida', esperado: 'ok' })
    assert.equal(a.enunciado, 'Faça isso')
    assert.equal(a.solucao, 'A resposta')
  })

  test('--- dentro de bloco de código não corta a atividade', () => {
    const a = parseAtividadeBruta('id: x\n---\nRode:\n\n```sh\n---\n```\n---\nsolucao')
    assert.match(a.enunciado, /```sh/)
    assert.equal(a.solucao, 'solucao')
  })
})

describe('parseCurso — hierarquia e erros', () => {
  const c = parseCurso(CURSO, '01-http.md')

  test('# vira curso, ## módulo e ### lição', () => {
    assert.equal(c.titulo, 'HTTP do zero')
    assert.equal(c.id, 'http-do-zero')
    assert.equal(c.fase, 1)
    assert.equal(c.deck, 'http-networking')
    assert.equal(c.modulos.length, 1)
    assert.equal(c.modulos[0].id, 'req', 'id explícito {#req} manda')
    assert.deepEqual(
      c.modulos[0].licoes.map((l) => l.id),
      ['o-que-e-um-request', 'seg'],
    )
    assert.deepEqual(c.erros, [])
  })

  test('descrição sai do primeiro parágrafo da intro', () => {
    assert.equal(c.descricao, 'Primeira frase da intro.')
  })

  test('a lição guarda os blocos prontos, inclusive a atividade crua', () => {
    const licao = c.modulos[0].licoes[0]
    const atividade = licao.blocos.find((b) => b.tipo === 'atividade')
    assert.equal(atividade.bruto.id, 'contar-bytes')
    assert.equal(atividade.bruto.entrega.esperado, 58)
    assert.equal(atividade.bruto.solucao, 'São 58 bytes.')
  })

  test('curso sem módulo e sem título acusa os dois', () => {
    const vazio = parseCurso('só um texto solto', 'nada.md')
    assert.equal(vazio.erros.length, 2)
    assert.match(vazio.erros.join(' '), /sem título/)
    assert.match(vazio.erros.join(' '), /nenhum módulo/)
  })

  test('módulo sem lição e ids duplicados viram erro com número de linha', () => {
    const md = '# C\n\n## M {#dup}\n\n### L\n\ntexto\n\n## Outro {#dup}\n\n### L2\n\ntexto\n\n## Vazio\n\ntexto\n'
    const r = parseCurso(md, 'x.md')
    const texto = r.erros.join(' | ')
    assert.match(texto, /módulo com id duplicado "dup"/)
    assert.match(texto, /sem nenhuma lição/)
    assert.match(texto, /x\.md:\d+:/)
  })

  test('container ::: mal fechado vira erro legível e não derruba o parser', () => {
    const md = '# C\n\n## M\n\n### L\n\n:::atividade\nid: quebrada\n---\nEnunciado\n---\nSolucao\n\n### L2\n\nEsta lição some.\n'
    let r
    assert.doesNotThrow(() => {
      r = parseCurso(md, 'quebrado.md')
    })
    const texto = r.erros.join(' | ')
    assert.match(texto, /container ":::" aberto e nunca fechado/)
    assert.match(texto, /quebrado\.md:7:/)
    assert.equal(r.modulos[0].licoes.length, 1, 'a lição seguinte é engolida — por isso o erro precisa existir')
  })

  test('bloco de código mal fechado também acusa', () => {
    const r = parseCurso('# C\n\n## M\n\n### L\n\n```js\nconst x = 1\n\n### L2\n\ntexto\n', 'cerca.md')
    assert.match(r.erros.join(' | '), /bloco de código aberto e nunca fechado/)
  })

  test('id inválido no frontmatter acusa kebab-case', () => {
    const r = parseCurso('---\nid: Curso Errado\n---\n\n# T\n\n## M\n\n### L\n\ntexto\n', 'x.md')
    assert.match(r.erros.join(' | '), /id "Curso Errado" inválido/)
  })

  test('título de lição repetido acusa (confunde na navegação)', () => {
    const r = parseCurso('# C\n\n## M\n\n### Igual\n\na\n\n## M2\n\n### Igual\n\nb\n', 'x.md')
    assert.match(r.erros.join(' | '), /título de lição repetido/)
  })
})
