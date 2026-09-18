// Menus declarativos: um lugar só alimenta a barra inferior (celular), o cabeçalho (desktop),
// a Biblioteca e o Perfil. Quem renderiza é src/components/Layout.jsx.
//
// Regra da V2 (docs/PLANO-V2.md §Etapa 2): quatro destinos, e só quatro. Tudo o que existia antes
// continua existindo — só passou a ser alcançado pela Biblioteca ou pelo Perfil.
import {
  IcoBusca,
  IcoCasa,
  IcoChama,
  IcoCurso,
  IcoEngrenagem,
  IcoGiro,
  IcoGrade,
  IcoLivro,
  IcoRetomar,
  IcoTerminal,
} from './components/Icones.jsx'

/** os quatro destinos da barra inferior e do cabeçalho */
export const PRINCIPAL = [
  { to: '/', rotulo: 'Início', Ico: IcoCasa, end: true, desc: 'O que fazer agora e por onde continuar' },
  { to: '/trilha', rotulo: 'Trilha', Ico: IcoGiro, desc: 'O caminho: módulos e lições em ordem' },
  { to: '/biblioteca', rotulo: 'Biblioteca', Ico: IcoLivro, desc: 'Glossário, cursos, laboratório e treinos' },
  { to: '/perfil', rotulo: 'Perfil', Ico: IcoGrade, desc: 'Matriz, ofensiva, diário de erros e ajustes' },
]

/** o que vive dentro da Biblioteca (escolher em vez de seguir o caminho) */
export const BIBLIOTECA = [
  { to: '/glossario', rotulo: 'Glossário', Ico: IcoBusca, desc: 'Buscar um termo e ver os relacionados' },
  { to: '/cursos', rotulo: 'Cursos', Ico: IcoCurso, desc: 'As aulas em Markdown, do começo ao fim' },
  { to: '/praticas', rotulo: 'Laboratório', Ico: IcoTerminal, desc: 'Todos os exercícios, para escolher um' },
  { to: '/treinos', rotulo: 'Treinos Especiais', Ico: IcoChama, desc: 'Temporadas longas — os chefões' },
]

/** o que vive dentro do Perfil (medir, revisar e ajustar) */
export const PERFIL = [
  { to: '/matriz', rotulo: 'Matriz de nível', Ico: IcoGrade, desc: 'Nível por módulo, ofensiva e histórico' },
  { to: '/perfil/erros', rotulo: 'Diário de erros', Ico: IcoRetomar, desc: 'O que eu achei · o que era · como detectar' },
  { to: '/anatomia', rotulo: 'Como o app funciona', Ico: IcoLivro, desc: 'Trilha → Módulo → Lição, e onde está cada coisa' },
  { to: '/config', rotulo: 'Ajustes', Ico: IcoEngrenagem, desc: 'Mentor IA, bot do Telegram, idioma, reset' },
]

/** rotas que abrem em TELA CHEIA: sem cabeçalho, sem barra, só progresso e sair */
export const ROTAS_IMERSIVAS = [/^\/licao\//, /^\/entrevista\//]

export function ehImersiva(pathname) {
  return ROTAS_IMERSIVAS.some((re) => re.test(pathname))
}
