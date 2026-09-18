// As regras de XP são as MESMAS no servidor e no front — então o front importa o arquivo do servidor
// em vez de duplicar os números. `server/xp.js` é ESM puro, sem nenhum import de Node, então o Vite
// empacota sem problema. Duplicar aqui seria a receita para a tela mostrar uma meta e o servidor outra.
export { PESOS, META_XP_DIA, BONUS_NO_NOVO, xpDoItem, resultadoLicao, coroas, faltaParaMeta } from '../../server/xp.js'
