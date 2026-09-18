// O núcleo do i18n, SEM React e SEM JSX — para o teste em `node --test` poder importar direto
// (node não sabe carregar .jsx). O provider e o hook ficam em index.jsx e reusam isto.
//
// DECISÃO DE PROJETO: a CHAVE é o próprio texto em português (modelo gettext), não um id inventado
// (`t('home.titulo')`). Três razões concretas:
//   1. o código continua legível — `t('Começar')` diz o que vai aparecer na tela;
//   2. string sem tradução cai no PT em vez de mostrar a chave crua para o usuário;
//   3. não há o trabalho (e o erro) de inventar e manter centenas de nomes de chave.
// O preço é que corrigir um typo em português "perde" a tradução daquela string — e é por isso que
// tests/i18n.test.js varre o código e reprova quando um `t('…')` não existe em en.json.
import EN from './en.json' with { type: 'json' }

export const IDIOMAS = { pt: { nome: 'Português', dic: null }, en: { nome: 'English', dic: EN } }
export const CHAVE_LOCAL = 'trilharm.idioma'
export const PADRAO = 'pt'

/**
 * Traduz. Aceita interpolação por chave: traduzir('en', 'faltam {n}', { n: 3 }).
 * Sem tradução, devolve o próprio texto — nunca a chave crua, nunca vazio.
 */
export function traduzir(idioma, texto, vars) {
  const entrada = IDIOMAS[idioma]
  const dic = entrada && entrada.dic
  let saida = (dic && dic[texto]) || texto
  if (vars) {
    for (const [k, v] of Object.entries(vars)) saida = saida.split(`{${k}}`).join(String(v))
  }
  return saida
}

/** plural simples: as duas formas já estão no dicionário */
export function plural(idioma, um, muitos, n) {
  return traduzir(idioma, Number(n) === 1 ? um : muitos)
}

/** ?lang= na URL vence o localStorage, que vence o padrão */
export function idiomaInicial() {
  try {
    const url = new URLSearchParams(window.location.search).get('lang')
    if (url && IDIOMAS[url]) return url
    const salvo = localStorage.getItem(CHAVE_LOCAL)
    if (salvo && IDIOMAS[salvo]) return salvo
  } catch {
    /* localStorage bloqueado (janela privada, site data limpo): o padrão resolve */
  }
  return PADRAO
}

/** o locale do Intl para números e datas */
export function localeDe(idioma) {
  return idioma === 'en' ? 'en-US' : 'pt-BR'
}
