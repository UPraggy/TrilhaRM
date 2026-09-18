// Utilidades gerais: aleatoriedade, níveis, formatação.

export const NIVEIS = [
  { n: 0, rotulo: 'desconheço', curto: 'Desconheço' },
  { n: 1, rotulo: 'reconheço', curto: 'Reconheço' },
  { n: 2, rotulo: 'explico', curto: 'Explico' },
  { n: 3, rotulo: 'aplico', curto: 'Aplico' },
  { n: 4, rotulo: 'diagnostico', curto: 'Diagnostico' },
  { n: 5, rotulo: 'ensino/defendo', curto: 'Ensino' },
]

export const MODOS = [
  { id: 'flashcards', nome: 'Flashcards', desc: 'Termo na frente, explicação atrás. Você se avalia de 0 a 5.' },
  { id: 'quiz', nome: 'Quiz', desc: 'Dada a definição, escolha o termo entre 4.' },
  { id: 'quiz-inv', nome: 'Quiz invertido', desc: 'Dado o termo, escolha a definição certa.' },
  { id: 'digitar', nome: 'Digitar', desc: 'Leia a definição e digite o termo. Aceita erro de 2 letras.' },
  { id: 'associar', nome: 'Associar', desc: 'Ligue 6 termos às suas definições.' },
  { id: 'vf', nome: 'Verdadeiro ou falso', desc: 'A afirmação está certa ou trocaram a definição?' },
  { id: 'explique', nome: 'Explique', desc: 'Pergunta de entrevista. Escreva, compare com a profundidade, dê a nota.' },
  { id: 'misto', nome: 'Misturar modos', desc: 'Cada termo cai num modo aleatório.' },
  // V2: os modos que a LIÇÃO monta sozinha (server/licao.js escolhe pelo nível do termo).
  // Não aparecem na sessão livre por deck porque dependem de dado que o servidor calcula.
  { id: 'sintoma-causa', nome: 'Sintoma → causa', desc: 'Um sintoma de produção; escolha o conceito que o explica.', soLicao: true },
  { id: 'lacuna', nome: 'Lacuna', desc: 'A definição com o conceito-chave apagado no meio.', soLicao: true },
  { id: 'ordenar', nome: 'Ordenar', desc: 'As fases ou passos fora de ordem, para recolocar.', soLicao: true },
  { id: 'confundiveis', nome: 'Pares confundíveis', desc: 'Duas definições parecidas: qual é de qual.', soLicao: true },
  { id: 'conexoes', nome: 'Mapa de conexões', desc: 'Dado um termo, marque os que se ligam a ele.', soLicao: true },
  { id: 'recall', nome: 'Recall livre', desc: '3 minutos escrevendo tudo; depois a lista para conferir.', soLicao: true },
]

/** os modos que a tela de sessão livre oferece (a lição usa todos) */
export const MODOS_LIVRES = MODOS.filter((m) => !m.soLicao)

/** ambientes dos exercícios práticos (content/praticas) */
export const AMBIENTES = {
  node: { nome: 'Node', desc: 'script ou servidor Node no terminal' },
  bash: { nome: 'Terminal', desc: 'Git Bash / Termux' },
  postgres: { nome: 'PostgreSQL', desc: 'psql ou cliente' },
  redis: { nome: 'Redis', desc: 'redis-cli / Docker' },
  docker: { nome: 'Docker', desc: 'containers' },
  nginx: { nome: 'Nginx', desc: 'proxy reverso' },
  browser: { nome: 'Navegador', desc: 'DevTools' },
  papel: { nome: 'Papel', desc: 'raciocínio, desenho, texto' },
  celular: { nome: 'Celular', desc: 'Termux / PRoot no S23' },
  git: { nome: 'Git', desc: 'repositório' },
  http: { nome: 'HTTP', desc: 'curl / cliente HTTP' },
}
export function nomeAmbiente(id) {
  return (AMBIENTES[id] || { nome: id }).nome
}

export const TIPOS_ENTREGA = {
  saida: { nome: 'saída verificável', curto: 'saída' },
  numero: { nome: 'número verificável', curto: 'número' },
  escolha: { nome: 'múltipla escolha', curto: 'escolha' },
  texto: { nome: 'texto / código (auto-avaliação + mentor)', curto: 'texto' },
  checklist: { nome: 'checklist', curto: 'checklist' },
}

/** estado resumido de uma prática para chips/listas */
export function statusPratica(estado) {
  if (!estado || estado.estado === 'nova') return { id: 'nova', rotulo: 'nova', classe: '' }
  if (estado.estado === 'concluida') return { id: 'concluida', rotulo: `feita · ${fmtNivel(estado.ultimaNota)}`, classe: classeNivel(estado.ultimaNota) }
  return { id: 'andamento', rotulo: 'em andamento', classe: 'chip--amber' }
}

export function nomeModo(id) {
  return (MODOS.find((m) => m.id === id) || { nome: id }).nome
}

export function embaralhar(arr) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function amostra(arr, n) {
  return embaralhar(arr).slice(0, n)
}

export function escolher(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

export function chaveTermo(t) {
  return `${t.deckId}/${t.id}`
}

export function hojeISO(d = new Date()) {
  const off = d.getTimezoneOffset() * 60 * 1000
  return new Date(d.getTime() - off).toISOString().slice(0, 10)
}

export function pct(a, b) {
  if (!b) return 0
  return Math.round((a / b) * 100)
}

export function fmtNivel(n) {
  if (n == null) return '–'
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

export function classeNivel(n) {
  if (n == null) return 'nv-none'
  if (n >= 4) return 'nv-alto'
  if (n >= 3) return 'nv-ok'
  if (n >= 1.5) return 'nv-baixo'
  return 'nv-zero'
}

export function fmtDataCurta(iso) {
  if (!iso) return '–'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y.slice(2)}`
}

export function diasAte(iso) {
  if (!iso) return null
  const hoje = new Date(`${hojeISO()}T12:00:00`)
  const alvo = new Date(`${iso}T12:00:00`)
  return Math.round((alvo - hoje) / 86400000)
}
