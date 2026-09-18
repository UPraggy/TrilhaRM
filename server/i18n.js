// i18n do SERVIDOR: o bot do Telegram e os cards PNG falam a mesma língua que a interface.
//
// Mesma decisão do front (src/i18n/index.jsx): a CHAVE é o texto em português. Aqui o dicionário fica
// embutido em vez de num .json à parte porque o servidor não tem bundler — um require de JSON a mais
// seria só cerimônia.
//
// O idioma vem de data/config.json (`idioma`), que o seletor da interface grava por PUT /api/config.
// Assim a escolha feita na tela vale para o bot, que roda noutro processo e noutro aparelho.
import fs from 'node:fs'

export const EN = {
  // bot: menu e comandos
  'Trilha RM — o que dá para fazer por aqui': 'Trilha RM — what you can do here',
  'tarefas de hoje': "today's tasks",
  'o link do app (com QR)': 'the app link (with QR)',
  'sua ofensiva': 'your streak',
  'a matriz de nível': 'the level matrix',
  'o que estudar agora': 'what to study now',
  'este menu': 'this menu',
  'Chat conectado.': 'Chat connected.',
  'Chat desconectado.': 'Chat disconnected.',
  'Este chat não está conectado.': 'This chat is not connected.',
  'Não entendi. Use /ajuda.': "I did not get that. Use /help.",

  // bot: tarefas do dia
  'Tarefas de hoje': "Today's tasks",
  'Nada vencido hoje.': 'Nothing due today.',
  'termos para revisar': 'terms to review',
  'termos novos': 'new terms',
  'Faltam': 'Missing',
  'avaliações para o dia contar': 'ratings for the day to count',
  'O dia já contou.': 'The day already counted.',
  'Ofensiva': 'Streak',
  'dias': 'days',
  'dia': 'day',
  'melhor': 'best',
  'Próxima lição': 'Next lesson',
  'itens': 'items',
  'Abrir': 'Open',

  // bot: link e túnel
  'Link do app': 'App link',
  'O túnel ainda não subiu. Tente de novo em alguns segundos.': 'The tunnel is not up yet. Try again in a few seconds.',
  'A URL muda a cada restart do túnel — peça /link de novo quando der erro.': 'The URL changes every time the tunnel restarts — ask for /link again when it fails.',

  // cards PNG
  'Hoje': 'Today',
  'Ofensiva diária': 'Daily streak',
  'Matriz de nível': 'Level matrix',
  'Sugestão de estudo': 'Study suggestion',
  'Treino Especial': 'Special Training',
  'termos': 'terms',
  'nível': 'level',
  'módulo': 'module',
  'módulos': 'modules',
  'lições': 'lessons',
  'exercícios': 'exercises',
  'aponte a câmera': 'point your camera',
  'avaliações hoje': 'ratings today',
  'para o dia contar': 'for the day to count',
  'meta batida': 'target met',
}

const DICS = { pt: null, en: EN }

/** traduz com interpolação por {chave}; sem tradução devolve o próprio texto */
export function traduzir(idioma, texto, vars) {
  const dic = DICS[idioma]
  let saida = (dic && dic[texto]) || texto
  if (vars) for (const [k, v] of Object.entries(vars)) saida = saida.split(`{${k}}`).join(String(v))
  return saida
}

/**
 * Cria o tradutor do servidor lendo `idioma` do config a cada chamada.
 * Ler do arquivo em vez de guardar em memória é de propósito: o bot roda por muito tempo e a troca de
 * idioma na tela precisa valer na próxima mensagem, sem restart.
 */
export function criarI18n(arquivoConfig) {
  function idioma() {
    try {
      const c = JSON.parse(fs.readFileSync(arquivoConfig, 'utf8'))
      return c && c.idioma === 'en' ? 'en' : 'pt'
    } catch {
      return 'pt'
    }
  }
  return {
    idioma,
    t: (texto, vars) => traduzir(idioma(), texto, vars),
    /** plural: tp('dia', 'dias', n) */
    tp: (um, muitos, n) => traduzir(idioma(), Number(n) === 1 ? um : muitos),
    ehEN: () => idioma() === 'en',
  }
}
