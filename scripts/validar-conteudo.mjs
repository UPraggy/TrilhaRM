// Valida content/decks/*.json, content/praticas/*.json, content/cursos/*.md e content/trilhas.json
// sem subir o servidor.
// Uso: node scripts/validar-conteudo.mjs   (sai com código 1 se houver erro)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { criarRepositorio } from '../server/decks.js'
import { criarPraticas } from '../server/praticas.js'
import { criarCursos } from '../server/cursos.js'
import { criarTreinos } from '../server/treinos.js'
import { criarEstrutura } from '../server/estrutura.js'
import { progressoVazio } from '../server/progresso.js'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CONTEUDO = path.join(RAIZ, 'content')
const repo = criarRepositorio(CONTEUDO)
const praticas = criarPraticas(CONTEUDO, repo)
const cursos = criarCursos(CONTEUDO, repo)
const treinos = criarTreinos(CONTEUDO, repo)
// o validador não tem progresso de verdade: um progresso vazio basta para resolver a estrutura
const estrutura = criarEstrutura(CONTEUDO, { repo, cursos, praticas, treinos, progresso: { obter: () => progressoVazio() } })

const decks = repo.listar()
console.log(`decks: ${decks.length} · termos: ${decks.reduce((a, d) => a + d.termos.length, 0)}`)
for (const d of decks) console.log(`  F${d.fase} ${d.id.padEnd(30)} ${String(d.termos.length).padStart(3)} termos`)
const lista = praticas.listar()
console.log(`praticas: ${lista.length} arquivos · ${lista.reduce((a, p) => a + p.exercicios.length, 0)} exercicios`)
for (const p of lista) console.log(`  ${p.deckId.padEnd(30)} ${String(p.exercicios.length).padStart(3)} exercicios  (${[...new Set(p.exercicios.map((e) => e.entrega.tipo))].join(', ')})`)
const listaCursos = cursos.listar()
console.log(
  `cursos: ${listaCursos.length} · ${listaCursos.reduce((a, c) => a + c.totalLicoes, 0)} licoes · ${listaCursos.reduce((a, c) => a + c.totalAtividades, 0)} atividades`,
)
for (const c of listaCursos) {
  const tipos = [...new Set(c.atividades.map((a) => a.entrega.tipo))]
  console.log(
    `  F${c.fase} ${c.id.padEnd(30)} ${String(c.modulos.length).padStart(2)} mod ${String(c.totalLicoes).padStart(3)} licoes ${String(c.totalAtividades).padStart(3)} ativ  (${tipos.join(', ') || 'sem atividade'})  ${c.arquivo}`,
  )
  // checagens extras que só fazem sentido no validador (o app tolera e segue)
  for (const a of c.atividades) {
    if (!a.criterios.length && a.entrega.tipo !== 'checklist') console.log(`     aviso leve: atividade ${a.id} sem "criterios"`)
  }
}

const tr = estrutura.trilhasCompativel()
console.log(`trilhas: origem=${tr.origem} · fases=${tr.fases.map((f) => `T${f.numero}(${f.decks.length})`).join(' ')}`)

// ---- estrutura: trilha -> modulo -> no ------------------------------------
const est = estrutura.resolver()
console.log(
  `estrutura: ${est.trilhas.length} trilhas · ${est.trilhas.reduce((a, t) => a + t.modulos.length, 0)} modulos · ${est.trilhas.reduce((a, t) => a + t.progresso.nosTotal, 0)} nos`,
)
for (const t of est.trilhas) {
  console.log(`  T${t.numero} ${t.titulo}`)
  for (const m of t.modulos) {
    const falta = []
    if (!m.conteudo.termos) falta.push('sem deck')
    if (m.conteudo.exercicios < 4) falta.push(`so ${m.conteudo.exercicios} exercicios`)
    console.log(
      `     ${m.emProducao ? '[em producao]' : '             '} ${m.id.padEnd(26)} ${String(m.conteudo.termos).padStart(3)} termos ${String(m.conteudo.exercicios).padStart(3)} ex ${String(m.conteudo.leituras).padStart(3)} leituras ${m.conteudo.chefao ? 'chefao' : '      '} ${String(m.progresso.nosTotal).padStart(2)} nos${falta.length ? '   <- ' + falta.join(', ') : ''}`,
    )
  }
}

const erros = [...repo.erros(), ...praticas.erros(), ...cursos.erros(), ...treinos.erros(), ...estrutura.erros()]
if (erros.length) {
  console.log(`\nAVISOS/ERROS (${erros.length}):`)
  for (const e of erros) console.log('  - ' + e)
  process.exit(1)
}
console.log('\nOK - sem avisos')
