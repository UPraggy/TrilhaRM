// "Não entendi a divisão de módulos e trilha" — esta tela existe por causa dessa frase.
// O diagrama da hierarquia e a tabela "onde está cada coisa". Ver também docs/AI-GUIA.md.
import { Link } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { useT } from '../i18n/index.jsx'

export default function Anatomia() {
  const { estrutura } = useStore()
  const { t } = useT()
  const totais = estrutura
    ? estrutura.trilhas.reduce(
        (a, tr) => ({
          trilhas: a.trilhas + 1,
          modulos: a.modulos + tr.modulos.length,
          nos: a.nos + tr.progresso.nosTotal,
          termos: a.termos + tr.progresso.termos,
        }),
        { trilhas: 0, modulos: 0, nos: 0, termos: 0 },
      )
    : null

  return (
    <div className="page anatomia">
      <p className="kicker"><Link to="/perfil">{t('Perfil')}</Link></p>
      <h1>{t('Como o app é organizado')}</h1>
      <p className="lead">
        {t('Três palavras, e só três. Tudo o que existe de um tema mora dentro do módulo daquele tema — você nunca precisa escolher entre "praticar", "curso" e "treino".')}
      </p>

      <div className="anat__diagrama" role="img" aria-label="Trilha contém módulos; cada módulo contém vocabulário, lições, exercícios e um chefão; a lição mistura os quatro">
        <div className="anat__nivel anat__nivel--trilha">
          <b>{t('Trilha').toUpperCase()}</b>
          <span className="dim small">{t('uma fase do plano de carreira (T1…T5)')}</span>
        </div>
        <div className="anat__seta" aria-hidden="true" />
        <div className="anat__nivel anat__nivel--modulo">
          <b>{t('módulo').toUpperCase()}</b>
          <span className="dim small">{t('um tema: Cache, HTTP, Testes…')}</span>
          <div className="anat__quatro">
            <span><b>{t('vocabulário')}</b><i className="dim">{t('decorar')}</i></span>
            <span><b>{t('lições')}</b><i className="dim">{t('aprender')}</i></span>
            <span><b>{t('exercícios')}</b><i className="dim">{t('praticar')}</i></span>
            <span><b>{t('chefão')}</b><i className="dim">{t('provar')}</i></span>
          </div>
        </div>
        <div className="anat__seta" aria-hidden="true" />
        <div className="anat__nivel anat__nivel--licao">
          <b>{t('Lição').toUpperCase()}</b>
          <span className="dim small">{t('8–12 itens, 5–10 min, um por tela — mistura os quatro acima')}</span>
        </div>
      </div>

      {totais && (
        <p className="dim small mono anat__totais">
          {t('hoje:')} {totais.trilhas} {t('trilhas')} · {totais.modulos} {t('módulos')} · {totais.nos} {t('lições')} · {totais.termos} {t('termos')}
        </p>
      )}

      <h2 className="secao">{t('Onde está cada coisa')}</h2>
      <div className="tabela-wrap">
        <table className="tabela">
          <thead>
            <tr>
              <th>{t('Quero…')}</th>
              <th>{t('Vou em')}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{t('Saber o que fazer agora')}</td>
              <td><Link to="/">{t('Início')}</Link></td>
            </tr>
            <tr>
              <td>{t('Seguir o caminho, na ordem')}</td>
              <td><Link to="/trilha">{t('Trilha')}</Link> → {t('módulo')} → {t('lição')}</td>
            </tr>
            <tr>
              <td>{t('Buscar um termo específico')}</td>
              <td><Link to="/glossario">{t('Biblioteca')} › {t('Glossário')}</Link></td>
            </tr>
            <tr>
              <td>{t('Ler um curso inteiro, do começo ao fim')}</td>
              <td><Link to="/cursos">{t('Biblioteca')} › {t('Cursos')}</Link></td>
            </tr>
            <tr>
              <td>{t('Escolher um exercício em vez de receber um')}</td>
              <td><Link to="/praticas">{t('Biblioteca')} › {t('Laboratório')}</Link></td>
            </tr>
            <tr>
              <td>{t('Fazer uma temporada longa (chefão)')}</td>
              <td><Link to="/treinos">{t('Biblioteca')} › {t('Treinos Especiais')}</Link></td>
            </tr>
            <tr>
              <td>{t('Ver meu nível por módulo e a ofensiva')}</td>
              <td><Link to="/matriz">{t('Perfil')} › {t('Matriz de nível')}</Link></td>
            </tr>
            <tr>
              <td>{t('Revisar os erros que anotei')}</td>
              <td><Link to="/perfil/erros">{t('Perfil')} › {t('Diário de erros')}</Link></td>
            </tr>
            <tr>
              <td>{t('Trocar o idioma, a chave do mentor ou o bot')}</td>
              <td><Link to="/config">{t('Perfil')} › {t('Ajustes')}</Link></td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 className="secao">{t('As réguas')}</h2>
      <ul className="lista">
        <li>
          <b>Nível 0–5 (as coroas).</b> 0 desconheço · 1 reconheço · 2 explico · <b>3 aplico</b> ·
          4 diagnostico · 5 ensino. A meta do plano é <b>3</b> na maioria e 4 no que você usa todo dia.
          As coroas de um módulo são o nível <i>médio</i> dos termos dele.
        </li>
        <li>
          <b>Ofensiva.</b> O dia conta quando você faz <b>10 avaliações</b>. Isso não mudou — XP é uma
          régua secundária, do dia e da lição.
        </li>
        <li>
          <b>Revisão espaçada (SM-2).</b> Cada nota reagenda o termo. Termo vencido entra primeiro na
          próxima lição, sempre.
        </li>
        <li>
          <b>Pré-requisito é sugestão.</b> Se você abrir um módulo antes da hora, o app avisa e deixa
          entrar. O plano é seu.
        </li>
      </ul>

      <h2 className="secao">{t('Adicionar conteúdo')}</h2>
      <p className="dim small">
        Tudo é arquivo em <code>content/</code>: um termo é uma entrada em <code>decks/*.json</code>, um
        exercício em <code>praticas/*.json</code>, um curso em <code>cursos/*.md</code>, um chefão em{' '}
        <code>treinos/*.json</code>. Quem amarra por tema é <code>content/estrutura.json</code>. Para
        gerar com outra IA, use <code>content/PROMPT-MASTER.md</code>. Não precisa de build nem restart.
      </p>
    </div>
  )
}
