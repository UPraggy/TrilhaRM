// Valida content/treinos/*.json contra o esquema (content/treinos/README.md) e contra os ids REAIS
// dos decks, sem subir o servidor.
// Uso: node scripts/validar-treinos.mjs   (sai com código 1 se houver erro)
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { criarRepositorio } from '../server/decks.js'
import { criarTreinos, AVALIACAO_POR_TIPO, TIPOS_ETAPA } from '../server/treinos.js'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CONTEUDO = path.join(RAIZ, 'content')
const repo = criarRepositorio(CONTEUDO)
const treinos = criarTreinos(CONTEUDO, repo)

const lista = treinos.listar()
const extras = []

const termosValidos = new Set()
for (const d of repo.listar()) for (const t of d.termos) termosValidos.add(`${d.id}/${t.id}`)

console.log(`decks: ${repo.listar().length} · termos: ${termosValidos.size}`)
console.log(`treinos: ${lista.length} arquivo(s)`)

for (const t of lista) {
  const dur = t.duracaoDias ? `${t.duracaoDias}d` : `${t.tempoTotalMin}min`
  console.log(`\n  ${t.id}  (nv${t.nivel} · ${dur} · ${t.etapas.length} etapas · ${t.arquivo})`)
  console.log(`    tipos: ${t.tipos.join(', ')}`)
  for (const e of t.etapas) {
    const marca = e.opcional ? '~' : '·'
    const termos = e.termos.map((x) => `${x.deckId}/${x.termoId}`)
    console.log(`    ${marca} ${e.id.padEnd(24)} ${e.tipo.padEnd(13)} ${String(e.tempoMin).padStart(3)}min  ${e.geraSM2 ? 'sm2' : '---'}  ${termos.join(' ') || '(sem termo)'}`)

    // checagens que o carregador não faz (são conselhos de qualidade, viram erro aqui)
    if (!AVALIACAO_POR_TIPO[e.tipo]) extras.push(`${t.arquivo}: etapa ${e.id}: tipo sem regra de avaliação`)
    if (!e.corpo) extras.push(`${t.arquivo}: etapa ${e.id}: corpo "${e.tipo}" ausente ou inválido`)
    // treino sem termos é permitido (a IA não recebeu ids); mas se o treino declara termos e a etapa
    // ficou sem nenhum, algum id caiu na validação
    if (e.geraSM2 && !e.termos.length && t.termos.length && e.tipo !== 'cronometrado' && e.tipo !== 'simulado') {
      extras.push(`${t.arquivo}: etapa ${e.id}: tipo ${e.tipo} avalia SM-2 mas não tem nenhum termo válido`)
    }
    for (const x of termos) if (!termosValidos.has(x)) extras.push(`${t.arquivo}: etapa ${e.id}: termo "${x}" não existe nos decks`)
    if (e.tipo === 'aquecimento' && e.corpo && e.corpo.fonte.startsWith('deck:')) {
      const id = e.corpo.fonte.slice(5)
      if (!repo.obter(id)) extras.push(`${t.arquivo}: etapa ${e.id}: aquecimento aponta para o deck inexistente "${id}"`)
    }
    if (e.tipo === 'desafio' && e.corpo && e.corpo.exercicio) {
      const ex = e.corpo.exercicio
      if (!ex.solucao) extras.push(`${t.arquivo}: etapa ${e.id}: desafio sem solucao`)
      if (ex.entrega.tipo === 'saida' && !(ex.entrega.esperados || []).length) extras.push(`${t.arquivo}: etapa ${e.id}: desafio saida sem esperado`)
    }
  }
  if (!t.recompensa) extras.push(`${t.arquivo}: sem recompensa`)
  if (t.etapas.length < 4) extras.push(`${t.arquivo}: treino com menos de 4 etapas (${t.etapas.length})`)
  if (t.tipos.length < 4) extras.push(`${t.arquivo}: treino usa só ${t.tipos.length} tipo(s) de etapa (mínimo 4)`)
  const desconhecidos = t.tipos.filter((x) => !TIPOS_ETAPA.includes(x))
  if (desconhecidos.length) extras.push(`${t.arquivo}: tipos desconhecidos: ${desconhecidos.join(', ')}`)
  const soma = t.etapas.reduce((a, e) => a + e.tempoMin, 0)
  if (t.tempoTotalMin && Math.abs(soma - t.tempoTotalMin) > Math.max(20, t.tempoTotalMin * 0.25)) {
    extras.push(`${t.arquivo}: tempoTotalMin=${t.tempoTotalMin} destoa da soma das etapas (${soma} min)`)
  }
}

const erros = [...treinos.erros(), ...extras]
if (!lista.length) console.log('\n(nenhum treino em content/treinos/ — nada a validar)')
if (erros.length) {
  console.log(`\nAVISOS/ERROS (${erros.length}):`)
  for (const e of erros) console.log('  - ' + e)
  process.exit(1)
}
console.log('\nOK - sem avisos')
