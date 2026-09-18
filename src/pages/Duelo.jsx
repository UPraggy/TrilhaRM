// Duelo contra o passado: as vezes em que você fez ESTA lição, lado a lado, item a item.
// Mostra se você melhorou de verdade ou só repetiu — que é a pergunta que o número sozinho não responde.
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api.js'
import { Carregando, Vazio } from '../components/Comuns.jsx'
import { classeNivel, fmtDataCurta } from '../lib/util.js'

/** o item comparável entre duas tentativas: a nota (ou acertou/errou) por referência */
function chaveItem(it) {
  return `${it.tipo}:${it.ref}`
}

function rotuloItem(it) {
  if (it.tipo === 'leitura') return 'leitura'
  if (it.tipo === 'exercicio') return 'exercício'
  return it.ref
}

function valor(it) {
  if (typeof it.nota === 'number') return it.nota
  return it.ok ? 3 : 0
}

export default function Duelo() {
  const { moduloId, n } = useParams()
  const [dados, setDados] = useState(null)

  useEffect(() => {
    api
      .licaoHistorico(moduloId, n)
      .then(setDados)
      .catch(() => setDados({ historico: [] }))
  }, [moduloId, n])

  if (!dados) return <Carregando texto="Buscando as tentativas…" cartoes={2} />

  const hist = dados.historico || []
  if (hist.length < 2) {
    return (
      <div className="page duelo">
        <p className="kicker"><Link to={`/modulo/${moduloId}`}>Voltar ao módulo</Link></p>
        <h1>Duelo contra o passado</h1>
        <Vazio titulo={hist.length ? 'Só uma tentativa até agora' : 'Você ainda não fez esta lição'}>
          O duelo compara você com você mesmo. Refaça esta lição e volte aqui — aí dá para ver, item a
          item, o que melhorou e o que continua igual.
          <div className="acoes" style={{ marginTop: 12 }}>
            <Link to={`/licao/${moduloId}/${n}`} className="btn btn--primary">
              {hist.length ? 'Refazer a lição' : 'Fazer a lição'}
            </Link>
          </div>
        </Vazio>
      </div>
    )
  }

  const atual = hist[hist.length - 1]
  const anterior = hist[hist.length - 2]
  const porRef = new Map()
  for (const it of anterior.itens || []) porRef.set(chaveItem(it), it)

  const linhas = (atual.itens || []).map((it) => {
    const antes = porRef.get(chaveItem(it))
    return { it, antes, delta: antes ? valor(it) - valor(antes) : null }
  })
  const melhoraram = linhas.filter((l) => l.delta > 0).length
  const pioraram = linhas.filter((l) => l.delta < 0).length
  const deltaXp = atual.xp - anterior.xp

  return (
    <div className="page duelo">
      <p className="kicker"><Link to={`/modulo/${moduloId}`}>Voltar ao módulo</Link></p>
      <h1>Duelo contra o passado</h1>
      <p className="lead">
        {fmtDataCurta(anterior.dia)} contra {fmtDataCurta(atual.dia)} — a mesma lição, item a item.
      </p>

      <div className="duelo__placar">
        <div className="stat">
          <b>{anterior.acertos}/{anterior.total}</b>
          <span className="dim small">{fmtDataCurta(anterior.dia)} · {anterior.xp} XP</span>
        </div>
        <div className="duelo__vs">vs</div>
        <div className="stat">
          <b>{atual.acertos}/{atual.total}</b>
          <span className="dim small">{fmtDataCurta(atual.dia)} · {atual.xp} XP</span>
        </div>
      </div>

      <p className={`duelo__veredito ${deltaXp >= 0 ? 'ok' : 'bad'}`}>
        {melhoraram > pioraram
          ? `Você melhorou em ${melhoraram} ${melhoraram === 1 ? 'item' : 'itens'}${pioraram ? ` e caiu em ${pioraram}` : ''}.`
          : melhoraram === pioraram
            ? 'Empate técnico — mesmo desempenho.'
            : `Caiu em ${pioraram} ${pioraram === 1 ? 'item' : 'itens'}. Vale reler a profundidade desses termos.`}
        {' '}
        <span className="dim">({deltaXp >= 0 ? '+' : ''}{deltaXp} XP)</span>
      </p>

      <div className="tabela-wrap">
        <table className="tabela duelo__tabela">
          <thead>
            <tr>
              <th>Item</th>
              <th>{fmtDataCurta(anterior.dia)}</th>
              <th>{fmtDataCurta(atual.dia)}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {linhas.map(({ it, antes, delta }, i) => (
              <tr key={i}>
                <td className="mono small">{rotuloItem(it)}</td>
                <td className={antes ? classeNivel(valor(antes)) : 'dim'}>{antes ? valor(antes) : '–'}</td>
                <td className={classeNivel(valor(it))}>{valor(it)}</td>
                <td className={delta > 0 ? 'green' : delta < 0 ? 'rose' : 'dim'}>
                  {delta == null ? '' : delta > 0 ? `+${delta}` : delta || '='}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {hist.length > 2 && (
        <p className="dim small">
          Esta lição tem {hist.length} tentativas guardadas (as 10 últimas). O melhor XP foi {dados.melhorXp}.
        </p>
      )}

      <div className="acoes acoes--col">
        <Link to={`/licao/${moduloId}/${n}`} className="btn btn--primary btn--block">
          Refazer mais uma vez
        </Link>
        <Link to="/perfil/erros" className="btn btn--ghost btn--block">
          Anotar o que caiu no diário de erros
        </Link>
      </div>
    </div>
  )
}
