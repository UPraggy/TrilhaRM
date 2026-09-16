---
id: postgres-que-nao-trava
deck: concorrencia-performance
fase: 2
ordem: 2
nivel: 4
tags: [postgres, sql, performance, concorrencia, producao]
descricao: Índices, planner, transações, locks e pool — por que a query que voava no dev derruba a produção, e como provar isso com número.
---

# Postgres que não trava

Quase todo incidente de banco que você vai pegar cabe em quatro frases: **o planner mudou de ideia**, **uma
transação ficou aberta**, **a fila de locks parou atrás de um `ALTER TABLE`** ou **o pool acabou**. Este curso
ataca as quatro, sempre no mesmo formato: o mecanismo, onde ele quebra e o comando que mede.

:::objetivo Ao terminar você consegue
- ler um `EXPLAIN (ANALYZE, BUFFERS)` e dizer em qual nó o tempo foi embora;
- explicar por que o planner **abandona** o índice a partir de certa seletividade — com a conta;
- diagnosticar um deadlock e propor a correção que não é "tentar de novo";
- dimensionar o pool de conexões por [[littles-law]] em vez de chutar 100;
- trocar paginação por offset por keyset e provar a diferença.
:::

Pré-requisitos: Docker (ou um Postgres 16 local) e `psql`. O laboratório inteiro cabe em um container:

```bash
docker run --rm -d --name pg-lab -e POSTGRES_PASSWORD=lab -p 5433:5432 postgres:16
docker exec -it pg-lab psql -U postgres
```

## O planner não é mágico

O Postgres não "usa o índice" porque ele existe. Ele **estima** o custo de cada caminho possível e escolhe o
mais barato. Entender essa conta é a diferença entre criar índice no escuro e consertar uma query de verdade.

### Como o índice encontra a linha

O índice padrão é uma [[algoritmos-estruturas/b-tree]]: uma árvore balanceada de páginas de 8 KB. Numa tabela de
1 milhão de linhas, a altura típica é 3 — três leituras de página para chegar ao ponteiro da linha.

Só que o ponteiro (`ctid`) aponta para a **heap**, o arquivo onde as linhas realmente moram. Então um
`Index Scan` custa, por linha: descer a árvore **mais** buscar a página da heap. E essa busca na heap é
**aleatória**: páginas espalhadas pelo disco, uma por linha retornada, no pior caso.

O planner modela isso com dois parâmetros:

| Parâmetro | Padrão | O que representa |
| --- | --- | --- |
| `seq_page_cost` | 1.0 | ler uma página em sequência |
| `random_page_cost` | 4.0 | ler uma página aleatória |
| `cpu_tuple_cost` | 0.01 | processar uma linha já lida |

Repare no que isso significa: **uma página aleatória custa quatro sequenciais**. A partir do momento em que a
query retorna linhas demais, pular de página em página fica mais caro do que varrer a tabela inteira de
cabo a rabo. É aí que o `Seq Scan` ganha — e não é burrice do planner, é aritmética.

:::nota Index Only Scan
Se **todas** as colunas pedidas estão no índice, o Postgres pode nem tocar na heap. Ele ainda precisa
confirmar a visibilidade da linha no *visibility map*; se a tabela está com vacuum atrasado, o "Index Only
Scan" aparece no plano com `Heap Fetches: 812304` e o ganho evapora. O plano diz o nome certo e mente na
promessa — confira sempre a linha de `Heap Fetches`.
:::

:::exemplo O SSD mudou a conta
`random_page_cost = 4` é herança de disco rotativo. Em NVMe, uma leitura aleatória custa quase o mesmo que
uma sequencial. Baixar para `1.1` é uma das poucas mudanças de configuração que muda plano de verdade — e
uma das poucas que vale testar com `EXPLAIN` antes e depois, query por query.
:::

:::atividade
id: onde-o-planner-desiste-do-indice
titulo: Onde o planner desiste do índice
termos: [bottleneck-analysis, hot-path, otimizacao-prematura]
nivel: 3
tempoMin: 20
ambiente: papel
entrega:
  tipo: numero
  esperado: 5000
  tolerancia: 0.02
  unidade: linhas
  rotulo: A partir de quantas linhas retornadas o seq scan fica mais barato
dicas:
  - O custo do seq scan não depende do filtro - ele lê tudo de qualquer jeito.
  - No pior caso o index scan busca uma página aleatória para cada linha retornada.
criterios:
  - Calculou o custo fixo do seq scan e igualou ao custo variável do index scan
---
A tabela `eventos` tem **1.000.000 de linhas** ocupando **10.000 páginas** (100 linhas por página). Os
parâmetros são os padrões: `seq_page_cost = 1`, `random_page_cost = 4`, `cpu_tuple_cost = 0.01`.

Modele assim, como o planner faria no pior caso:

- **Seq Scan** — lê as 10.000 páginas em sequência e processa as 1.000.000 de linhas.
- **Index Scan** — para cada linha que casa com o filtro, uma página **aleatória** da heap.

A partir de quantas linhas retornadas (`N`) o `Seq Scan` fica mais barato que o `Index Scan`?

Entregue: só o número de linhas.
---
```
custo do seq scan  = 10.000 páginas × 1 + 1.000.000 linhas × 0,01 = 10.000 + 10.000 = 20.000
custo do index scan ≈ N × 4 (uma página aleatória por linha)
20.000 = 4 × N  →  N = 5.000 linhas
```

**5.000 linhas — meio por cento da tabela.** É esse o número que surpreende: o índice deixa de valer a pena
muito antes do que a intuição diz. Uma query que filtra `status = 'pendente'` num sistema saudável (poucos
pendentes) usa o índice; a mesma query num dia ruim, com 3 % da base pendente, vira `Seq Scan` sozinha — e
o tempo pula sem ninguém ter mudado uma linha de código.

Duas consequências práticas:

1. **Índice em coluna de baixa cardinalidade** (`ativo`, `tipo` com 3 valores) quase nunca é usado. Um
   índice **parcial** — `CREATE INDEX ... WHERE status = 'pendente'` — resolve, porque indexa só a fatia
   pequena e seletiva.
2. Se você sabe que o storage é NVMe, `random_page_cost = 1.1` empurra o break-even para cerca de 18 mil
   linhas. Mesma query, mesmo índice, plano diferente.
:::

### Ler um EXPLAIN de verdade

`EXPLAIN` sozinho mostra o plano **estimado**: nada executou, os números são chute do planner.
`EXPLAIN (ANALYZE, BUFFERS)` executa a query e traz o que aconteceu. Use sempre a segunda forma — dentro de
uma transação com `ROLLBACK` se a query escreve.

```sql
BEGIN;
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) SELECT 1;
ROLLBACK;
```

Três leituras que resolvem a maioria dos casos:

1. **`rows=` estimado × `actual rows=`.** Divergência de 100× ou mais quer dizer estatística desatualizada
   (`ANALYZE tabela`) ou correlação que o planner não enxerga (duas colunas dependentes pedem
   `CREATE STATISTICS`). Todo plano ruim começa com uma estimativa ruim: o planner escolheu Nested Loop
   porque **acreditou** que viriam 2 linhas.
2. **`loops=`.** O tempo de um nó é `actual time` × `loops`. Um nó com `0.03 ms` e `loops=48000` custa 1,4 s
   — e é o clássico [[n-mais-1]] disfarçado de plano bonito.
3. **`Buffers: shared hit=... read=...`.** `hit` veio do cache do Postgres, `read` foi ao sistema de
   arquivos. É a métrica de trabalho real; tempo varia com a máquina, número de páginas não.

:::alerta O tempo total mente duas vezes
`Execution Time` não inclui o tempo de planejamento (linha `Planning Time`, às vezes maior que a execução em
query com muitos joins) nem o tempo de enviar o resultado pela rede. Um `SELECT *` de 200 MB pode ter
`Execution Time: 40 ms` e demorar 6 s para o cliente. Meça no cliente também.
:::

:::atividade
id: diagnosticar-o-plano-que-explodiu
titulo: Diagnosticar o plano que explodiu
termos: [bottleneck-analysis, n-mais-1, percentis]
nivel: 4
tempoMin: 20
ambiente: postgres
entrega:
  tipo: escolha
  rotulo: Qual é o diagnóstico correto?
  opcoes:
    - O Hash Join é lento por natureza; trocar por Nested Loop com índice resolveria.
    - A estimativa do filtro errou por três ordens de grandeza, o planner escolheu Nested Loop e pagou 48.000 buscas no índice; o conserto começa em ANALYZE / estatísticas.
    - Faltou índice em pedidos.cliente_id, por isso o Index Scan aparece com loops alto.
    - O problema é I/O de disco, porque shared read é maior que shared hit.
  correta: 1
dicas:
  - Compare `rows=` com `actual rows=` no nó de baixo antes de olhar qualquer tempo.
criterios:
  - Lê a divergência entre estimado e real como causa, e o Nested Loop como consequência
---
Este é o plano de uma query que passou de 40 ms para 9 s depois de uma carga grande de dados:

```
Nested Loop  (cost=0.43..812.11 rows=2 width=64)
             (actual time=0.052..8914.203 rows=48000 loops=1)
  Buffers: shared hit=192341 read=8122
  ->  Seq Scan on clientes c  (cost=0.00..18.50 rows=2 width=32)
                              (actual time=0.011..2.104 rows=48000 loops=1)
        Filter: (segmento = 'varejo'::text)
        Rows Removed by Filter: 1200
  ->  Index Scan using pedidos_cliente_id_idx on pedidos p
                              (cost=0.43..396.80 rows=1 width=32)
                              (actual time=0.170..0.185 rows=1 loops=48000)
        Index Cond: (cliente_id = c.id)
Planning Time: 0.41 ms
Execution Time: 8951.77 ms
```

Escolha o diagnóstico correto.
---
A resposta é a **segunda**.

O nó de baixo entrega a chave: `rows=2` estimado contra `actual rows=48000`. O planner acreditou que o
filtro `segmento = 'varejo'` sobraria duas linhas — então o Nested Loop parecia ótimo: dois giros no índice
de `pedidos`, custo estimado 812. Com 48.000 linhas reais, o mesmo plano vira `loops=48000`: cada giro custa
0,185 ms, e `0,185 × 48.000 ≈ 8,9 s`. O plano não ficou lento; ele **sempre foi** esse plano — mudou o volume.

Por que as outras estão erradas:

- **Hash Join lento por natureza**: é o contrário. Com 48 mil linhas do lado de fora, o Hash Join
  construiria a tabela hash uma vez e varreria `pedidos` uma vez só.
- **Falta índice em `pedidos.cliente_id`**: o índice existe e está sendo usado — é justamente ele que roda
  48.000 vezes.
- **I/O de disco**: `shared hit=192341` contra `read=8122`, ou seja, 96 % veio do cache. O gargalo é
  repetição, não disco.

**Correção, na ordem:** (1) `ANALYZE clientes` — a estatística está velha; (2) se a estimativa continuar
errada, `CREATE STATISTICS` para colunas correlacionadas, ou reescrever o filtro de forma que o planner
consiga estimar; (3) só depois pensar em `SET enable_nestloop = off` como experimento de diagnóstico —
nunca como correção permanente.

O padrão que fica: **`loops` alto é quase sempre consequência de uma estimativa errada**, e não se conserta
um plano sem antes consertar a estimativa que o gerou. Veja [[bottleneck-analysis]].
:::

### Índices que não servem para nada

Índice não é grátis: cada `INSERT`/`UPDATE` mantém **todos** os índices da tabela. Um `UPDATE` que antes
escrevia 1 página passa a escrever 5. Os quatro erros que mais aparecem:

- **Coluna dentro de função.** `WHERE lower(email) = 'x'` não usa o índice em `email`. Ou você indexa a
  expressão (`CREATE INDEX ... ON clientes (lower(email))`) ou reescreve a query. O mesmo vale para
  `WHERE criado_em::date = '2026-09-16'`: troque por um intervalo `>= ... AND < ...`.
- **Ordem errada no índice composto.** Um índice em `(status, criado_em)` serve para `WHERE status = 'x'
  ORDER BY criado_em`; um em `(criado_em, status)` não serve para quase nada nesse caso. A regra: colunas de
  igualdade primeiro, a coluna de faixa ou de ordenação por último.
- **Índice redundante.** Se existe `(a, b)`, o índice só em `(a)` é dispensável — o composto atende os dois.
- **Índice que ninguém usa.** `pg_stat_user_indexes` conta:
  `SELECT indexrelname, idx_scan FROM pg_stat_user_indexes WHERE idx_scan = 0;`. Índice com zero scans há um
  mês é custo de escrita puro.

E quando for criar em produção: `CREATE INDEX CONCURRENTLY`. A forma normal pega um lock que bloqueia
escritas na tabela inteira pelo tempo da construção — o assunto do próximo módulo.

## Transações, isolamento e locks

Aqui mora a categoria de bug que não aparece em teste: só existe quando duas coisas acontecem ao mesmo tempo.

### O que o MVCC cobra

O Postgres não sobrescreve linhas. Um `UPDATE` **escreve uma versão nova** e marca a antiga como morta a
partir da transação atual. Cada linha carrega `xmin` (quem criou) e `xmax` (quem matou); cada transação
enxerga um *snapshot* — o conjunto de versões visíveis para ela. É isso que permite leitura sem lock:
leitor nunca bloqueia escritor, escritor nunca bloqueia leitor.

A conta chega depois. As versões mortas ficam no arquivo até o `autovacuum` passar. E o autovacuum **não
pode** remover uma versão que ainda seja visível para alguma transação aberta. Daí o mecanismo mais cruel do
Postgres.

:::alerta A transação esquecida
Uma conexão que abriu `BEGIN`, leu uma linha e foi tomar café — ou um pool que deixou a transação aberta
porque o `commit` ficou depois de um `await` que estourou — **congela o horizonte do vacuum da base
inteira**. As tabelas quentes incham (*bloat*), o índice incha junto, os planos pioram, e o sintoma é
"o banco está lento" sem nenhuma query lenta no log.

O comando que fecha esse diagnóstico em 10 segundos:

```sql
SELECT pid, state, now() - xact_start AS aberta_ha, left(query, 60)
FROM pg_stat_activity
WHERE xact_start IS NOT NULL
ORDER BY xact_start;
```

Se `aberta_ha` tem horas, achou. `idle in transaction` é o estado mais perigoso do Postgres — configure
`idle_in_transaction_session_timeout` e durma melhor.
:::

Regra prática de transação: **abra o mais tarde possível, feche o mais cedo possível, e nunca faça chamada
HTTP dentro de uma transação aberta.** Se o serviço externo travar por 30 s, você acabou de segurar o
horizonte do vacuum por 30 s, com um lock de linha no meio.

### Níveis de isolamento e as anomalias que sobram

O padrão do Postgres é **Read Committed**: cada *comando* vê um snapshot novo. Isso já elimina dirty read,
mas deixa passar coisas que quase todo mundo acha que estão resolvidas.

| Nível | Impede | Ainda deixa passar |
| --- | --- | --- |
| Read Committed (padrão) | dirty read | non-repeatable read, phantom, lost update, write skew |
| Repeatable Read | + non-repeatable read, phantom | write skew; conflitos viram erro 40001 |
| Serializable | tudo | nada — ao custo de abortar com `could not serialize access` |

O caso que derruba saldo em produção é o **lost update**:

```sql
-- transação A e transação B, ao mesmo tempo, em Read Committed
SELECT saldo FROM contas WHERE id = 1;      -- as duas leem 100
UPDATE contas SET saldo = 90 WHERE id = 1;  -- as duas calculam 100 - 10 e escrevem 90
-- resultado: dois saques de 10, saldo final 90 em vez de 80
```

Três correções possíveis, em ordem de preferência:

1. **Deixe o banco fazer a conta**: `UPDATE contas SET saldo = saldo - 10 WHERE id = 1 AND saldo >= 10;` —
   atômico, sem race, sem lock explícito. Veja [[atomicidade]].
2. **Lock pessimista**: `SELECT ... FOR UPDATE` segura a linha até o fim da transação — ver
   [[optimistic-vs-pessimistic-locking]]. Correto, mas serializa quem disputa a mesma linha
   ([[contention]]).
3. **Lock otimista**: coluna `versao`, `UPDATE ... WHERE versao = 7`, e se `rowCount = 0` o cliente refaz.
   Ótimo quando o conflito é raro, péssimo quando é comum.

:::nota Write skew: o que nem Repeatable Read pega
Duas transações leem "há 2 médicos de plantão", cada uma tira **um** médico diferente. Nenhuma viu a
escrita da outra, nenhuma violou a regra no seu snapshot — e o plantão ficou vazio. Não existe linha em
conflito, então só `SERIALIZABLE` (ou uma constraint no banco) impede. É o exemplo canônico de por que
"eu valido antes de gravar" não é o mesmo que "o banco garante".
:::

:::atividade
id: qual-anomalia-e-essa
titulo: Qual anomalia é essa
termos: [race-condition, optimistic-vs-pessimistic-locking, atomicidade]
nivel: 4
tempoMin: 15
ambiente: postgres
entrega:
  tipo: escolha
  rotulo: O que aconteceu, e o que corrige de verdade?
  opcoes:
    - Dirty read - basta subir para Read Committed.
    - Lost update - o UPDATE calculado na aplicação sobrescreveu o da outra transação; corrige com UPDATE relativo no banco, SELECT FOR UPDATE ou coluna de versão.
    - Deadlock - as transações travaram uma na outra e o Postgres matou uma delas.
    - Phantom read - uma linha nova apareceu entre dois SELECTs da mesma transação.
  correta: 1
dicas:
  - Ninguém abortou, ninguém tomou erro - as duas transações deram commit com sucesso. Isso elimina duas opções.
criterios:
  - Identifica que o cálculo feito na aplicação é a causa, não o nível de isolamento
---
Em produção, dois cliques no botão "resgatar cupom" chegaram com 8 ms de diferença. O código faz:

```js
const { rows } = await cliente.query('SELECT usos FROM cupons WHERE id = $1', [id])
if (rows[0].usos >= 1) throw new Error('cupom esgotado')
await cliente.query('UPDATE cupons SET usos = $1 WHERE id = $2', [rows[0].usos + 1, id])
```

As duas requisições responderam **200**, nenhuma transação foi abortada, nenhum erro apareceu no log — e o
cupom de uso único foi resgatado duas vezes. `usos` ficou em `1`.

Escolha o que aconteceu e o que corrige.
---
A resposta é a **segunda**: **lost update**.

As duas transações leram `usos = 0`, as duas passaram na validação, as duas escreveram `usos = 1`. A
segunda escrita sobrescreveu a primeira — por isso o contador ficou em 1 e não em 2, e por isso ninguém
tomou erro. Em Read Committed isso é **comportamento correto** do banco: nada foi violado do ponto de vista
dele. O bug é a decisão ter sido tomada **fora** da transação, na memória do Node, entre o `SELECT` e o
`UPDATE`.

Por que as outras estão erradas: dirty read não existe no Postgres em nenhum nível; deadlock teria abortado
uma das transações com `deadlock detected`; phantom read exige duas leituras na **mesma** transação.

A correção de uma linha, que não precisa de lock nem de nível de isolamento novo:

```sql
UPDATE cupons SET usos = usos + 1 WHERE id = $1 AND usos < 1;
```

Se `rowCount = 0`, o cupom já estava esgotado — responda 409. O banco decide, o banco garante, e a janela de
corrida some porque a leitura e a escrita viraram **um** comando atômico. Se a regra fosse mais complexa que
isso, o próximo degrau seria `SELECT ... FOR UPDATE` no início da transação. E a rede de segurança
definitiva é uma constraint: `UNIQUE (cupom_id, usuario_id)` na tabela de resgates faz o banco recusar o
segundo resgate mesmo que o código erre de novo.
:::

### Locks, fila e deadlock

Locks de linha você quase não vê. Locks de tabela derrubam deploy.

Um `ALTER TABLE ... ADD CONSTRAINT` validado ou um `CREATE INDEX` sem `CONCURRENTLY` pegam
`ACCESS EXCLUSIVE`: incompatível com **tudo**, inclusive `SELECT`. O detalhe cruel é a **fila**: enquanto o
`ALTER` espera para pegar o lock, todas as queries que chegam depois esperam atrás dele, mesmo as que seriam
compatíveis entre si. Uma migração que "não bloqueia nada" pode parar a aplicação inteira porque ficou 40 s
atrás de um `SELECT` longo.

A profilaxia cabe em duas linhas antes de qualquer migração — e é isso que separa uma
[[producao-equipe/migration-sem-downtime]] de um incidente:

```sql
SET lock_timeout = '3s';
SET statement_timeout = '30s';
```

Com isso, a migração **falha rápido** em vez de formar fila. Você tenta de novo em outra janela.

Já o **deadlock** é outra coisa: duas transações que seguram um recurso e pedem o que a outra segura. O
Postgres detecta em cerca de 1 s (`deadlock_timeout`), escolhe uma vítima e a aborta com `40P01`.

```
T1: UPDATE contas SET ... WHERE id = 1;   T2: UPDATE contas SET ... WHERE id = 2;
T1: UPDATE contas SET ... WHERE id = 2;   T2: UPDATE contas SET ... WHERE id = 1;
-- T1 espera T2, T2 espera T1: deadlock detected
```

A correção definitiva não é retry — retry só reduz a dor. É **ordem determinística de aquisição**: se todo
código que mexe em várias contas ordena os ids antes (`ORDER BY id` no `SELECT ... FOR UPDATE`, ou
`ids.sort()` antes do loop), o ciclo não se forma. É o mesmo princípio do [[mutex-lock]] em qualquer
linguagem.

:::atividade
id: postmortem-do-deadlock
titulo: Postmortem — o deadlock das 3h da manhã
termos: [mutex-lock, contention, race-condition]
nivel: 4
tempoMin: 35
ambiente: papel
postmortem: true
entrega:
  tipo: texto
  rotulo: Seu postmortem
  minimoChars: 500
dicas:
  - Comece perguntando em que ORDEM cada transação pediu as linhas. O ciclo está aí.
  - Retry resolve o sintoma; procure a correção que impede o ciclo de existir.
criterios:
  - Separa sintoma (o que o cliente viu) de causa (o ciclo de espera)
  - Usa os números do enunciado como evidência, não adjetivos
  - Identifica a ordem de aquisição como causa raiz, e não "concorrência alta"
  - A correção proposta impede o ciclo (ordenação determinística, comando único ou lock no agregado)
  - Propõe uma mudança de processo verificável, não "ter mais atenção"
---
**O incidente.** 03h12. O job de fechamento noturno roda 8 workers em paralelo transferindo valores entre
contas. Cada worker abre uma transação e faz dois `UPDATE`: primeiro na conta de origem, depois na de
destino. Entre 03h12 e 03h40 apareceram **214 erros** `deadlock detected` (`40P01`); 61 transferências
ficaram sem processar e o relatório das 06h saiu errado. O retry automático era de 1 tentativa, imediato.
CPU do banco em 22 %, nenhuma query no log lento, p99 das rotas da API normal o tempo todo.

Escreva o postmortem no formato da casa:

**sintoma → evidência (números) → causa → correção → o que muda no processo**

Entregue: o texto do postmortem, com pelo menos um número calculado por você — por exemplo, qual a chance
de duas transferências quaisquer caírem no mesmo par de contas se existem apenas 12 contas "quentes"
concentrando o movimento.
---
Um postmortem que passa nos critérios diz, em substância:

**Sintoma.** 61 transferências não processadas e relatório errado às 06h. Nenhum cliente viu erro na API —
o estrago foi silencioso, num job em lote, o que atrasou a detecção em três horas.

**Evidência.** 214 erros `40P01` em 28 minutos (cerca de 7,6 por minuto) com 8 workers concorrentes. CPU em
22 % e p99 das rotas normal: **não é saturação**, é bloqueio mútuo. Com 12 contas quentes concentrando o
movimento, dois workers caem no mesmo par com probabilidade da ordem de `1 / C(12,2) = 1/66` por sorteio e,
dado o mesmo par, a chance de virem em sentidos opostos é 50 %. Com milhares de transferências por minuto,
7,6 deadlocks por minuto é exatamente o esperado — o incidente era estatístico, não excepcional.

**Causa.** Cada worker adquire os locks na ordem **de negócio** (origem, depois destino). Dois workers com o
par {A, B} em sentidos opostos formam o ciclo: um segura A e pede B, o outro segura B e pede A. O Postgres
detecta em 1 s e mata uma vítima. Causa raiz = **ordem de aquisição não determinística**; concorrência alta
só aumentou a frequência de um defeito que já existia.

**Correção.** (1) Ordenar as linhas antes de travar:
`SELECT ... FROM contas WHERE id = ANY($1) ORDER BY id FOR UPDATE` — com ordem global, o ciclo é impossível.
(2) Onde der, virar comando único e atômico
(`UPDATE ... SET saldo = saldo - $1 WHERE id = $2 AND saldo >= $1`), eliminando a janela entre leitura e
escrita. (3) Retry com backoff **e jitter**, no máximo 3 tentativas, e só para `40P01`/`40001`; retry
imediato reincide na mesma corrida. (4) `lock_timeout` no job, para transformar espera longa em falha
rápida e observável.

**Processo.** O job passa a ter alerta sobre `deadlocks` de `pg_stat_database` (não só sobre CPU), e a
transferência falha do lote vira item de fila morta com reprocessamento explícito — em vez de sumir. No code
review entra uma pergunta fixa: "esta transação toca mais de uma linha? em que ordem?". E o teste de
concorrência do job (8 workers sobre 12 contas, 1 minuto) entra na suíte, porque esse bug **não aparece** em
teste sequencial.
:::

## Concorrência que chega no banco

Índice e transação resolvem uma query. Este módulo é sobre o que acontece quando chegam mil por segundo.

### O pool de conexões e o número que ninguém calcula

No Postgres, **cada conexão é um processo do sistema operacional**, com sua própria memória. Isso muda tudo
em relação a bancos com modelo de thread: 500 conexões ociosas não são "só sockets", são 500 processos
concorrendo por CPU e por cache do kernel. Passado certo ponto, o [[throughput]] **cai** enquanto você
adiciona conexões.

O tamanho certo sai da [[littles-law]]:

```
conexões ocupadas = requisições por segundo × tempo médio segurando a conexão
```

Duas armadilhas que tornam essa conta errada na prática:

- **O pool é por processo.** Quatro instâncias PM2 com `max: 20` cada abrem **80** conexões, não 20. Somando
  o outro serviço, o `max_connections = 100` do servidor estoura e o erro que aparece é
  `too many clients already` — num serviço que não mudou nada.
- **`work_mem` é por operação, não por conexão.** Uma query com dois `sort` pode usar `2 × work_mem`. Com
  `work_mem = 64 MB` e 50 conexões ordenando, o pico de memória é de gigabytes.

Quando o número de conexões necessárias passa do que o servidor aguenta, a resposta não é subir
`max_connections`: é **pgbouncer** em modo `transaction`, que multiplexa centenas de clientes em poucas
conexões reais. O preço: nada de estado de sessão (`SET`, prepared statements nomeados, `LISTEN/NOTIFY`).

:::atividade
id: dimensionar-o-pool-pela-lei-de-little
titulo: Dimensionar o pool pela Lei de Little
termos: [connection-pool-sizing, littles-law, throughput]
nivel: 3
tempoMin: 20
ambiente: papel
entrega:
  tipo: numero
  esperado: 10
  tolerancia: 0.05
  unidade: conexões
  rotulo: Conexões simultaneamente ocupadas no estado saudável
dicas:
  - Converta o tempo para segundos antes de multiplicar.
  - A conta é a mesma da Lei de Little - só que aqui o "sistema" é o pool.
criterios:
  - Aplicou L = lambda x W com as unidades coerentes
---
Um serviço Node atende **250 requisições por segundo**. Cada requisição pega uma conexão do pool, faz duas
queries e devolve; medido no p50, a conexão fica retida por **40 ms** no total.

1. Quantas conexões ficam ocupadas ao mesmo tempo, em média, no estado saudável?
2. (para pensar, não entra na resposta) O banco degrada e o tempo de retenção vai a 400 ms. Quantas seriam
   necessárias?

Entregue: só o número da pergunta 1.

***

Depois de responder, compare com o `max` que você configurou no seu `pg.Pool` mais recente.
---
```
L = lambda × W = 250 req/s × 0,04 s = 10 conexões
```

**Dez.** É esse o número que assusta: o pool de 100 que quase todo mundo configura está dimensionado para um
mundo que não existe. No estado saudável, 10 conexões dão conta de 250 req/s — e provavelmente 20 já
absorvem o pico.

A segunda conta é a que interessa no plantão: com 400 ms de retenção, `250 × 0,4 = 100` conexões. Ou seja,
**o pool grande não protege de nada**: ele só transfere o colapso do seu serviço para o banco, que agora tem
100 processos brigando por CPU e fica ainda mais lento — realimentando o ciclo. Pool pequeno com fila e
timeout curto (`connectionTimeoutMillis`) falha rápido, dá 503 em parte do tráfego e mantém o banco de pé
([[contention]]).

O número que você quer no dashboard não é "conexões abertas", é **saturação do pool** (`em uso / max`) e
**tempo de espera na fila**. Quando a espera na fila começa a subir, você tem minutos de aviso antes de o
timeout aparecer para o usuário.
:::

### Paginação que não degrada

`LIMIT 20 OFFSET 100000` parece barato e não é: o Postgres precisa **produzir e descartar** as 100.000
primeiras linhas para entregar as 20 seguintes. O custo cresce linearmente com a página — a página 1 voa, a
página 5.000 é um incidente. É o [[pagination-offset-keyset]] clássico.

E tem um segundo defeito, pior porque é silencioso: **offset erra o conteúdo**. Se uma linha nova entra no
topo entre a página 1 e a página 2, tudo desloca e o usuário vê um item repetido — e outro nunca aparece.

O keyset (ou *cursor*) pagina pelo **último valor visto**, não pela contagem:

```sql
-- página 1
SELECT id, criado_em, total FROM pedidos
ORDER BY criado_em DESC, id DESC
LIMIT 20;

-- páginas seguintes: passe o último (criado_em, id) da página anterior
SELECT id, criado_em, total FROM pedidos
WHERE (criado_em, id) < ($1, $2)
ORDER BY criado_em DESC, id DESC
LIMIT 20;
```

Três detalhes que fazem a diferença entre funcionar e "quase":

1. **Comparação de tupla**, `(criado_em, id) < ($1, $2)`, e não `criado_em < $1 AND id < $2` — que está
   errado e pula linhas com o mesmo timestamp.
2. **Desempate obrigatório.** Sem o `id` no `ORDER BY`, linhas com o mesmo `criado_em` saem em ordem
   arbitrária e a paginação fura.
3. **Índice que casa com o `ORDER BY`**: `CREATE INDEX ON pedidos (criado_em DESC, id DESC)`. Com ele, o
   plano vira `Index Scan` com `LIMIT` no topo e lê exatamente 20 linhas — o `Buffers` fica constante,
   página 1 ou página 5.000.

:::nota E o total de páginas?
`SELECT count(*)` numa tabela grande é `Seq Scan` — o custo que você acabou de eliminar volta pela porta dos
fundos. Alternativas: não mostrar total (rolagem infinita), mostrar estimativa
(`SELECT reltuples::bigint FROM pg_class WHERE relname = 'pedidos'`) ou contar só até um teto
(`SELECT count(*) FROM (SELECT 1 FROM pedidos LIMIT 1000) t`) e exibir "1000+".
:::

:::atividade
id: migrar-de-offset-para-keyset
titulo: Migrar de offset para keyset e provar a diferença
termos: [pagination-offset-keyset, latencia, benchmark-load-stress-soak]
nivel: 4
tempoMin: 45
ambiente: docker
entrega:
  tipo: checklist
  rotulo: Marque o que você conseguiu comprovar
  itens:
    - Gerei 1.000.000 de linhas com generate_series e rodei ANALYZE na tabela
    - Medi o EXPLAIN (ANALYZE, BUFFERS) do OFFSET 0 e do OFFSET 900000 e anotei os dois shared hit
    - Criei o índice (criado_em DESC, id DESC) e confirmei Index Scan no plano do keyset
    - Medi o keyset na primeira e na última página e vi o shared hit ficar praticamente constante
    - Reproduzi o item repetido do offset inserindo uma linha nova entre a página 1 e a página 2
    - Anotei os quatro números num README de cinco linhas
criterios:
  - Comparou páginas equivalentes (mesmo LIMIT) nas duas estratégias
  - Usou buffers e páginas lidas como métrica, não só tempo de relógio
---
Suba o laboratório e prove, com número, tudo o que a lição afirmou.

```sql
CREATE TABLE pedidos (
  id bigserial PRIMARY KEY,
  criado_em timestamptz NOT NULL,
  total numeric(10,2) NOT NULL
);

INSERT INTO pedidos (criado_em, total)
SELECT now() - (g || ' seconds')::interval, (g % 900)::numeric / 10
FROM generate_series(1, 1000000) g;

ANALYZE pedidos;
```

Agora meça, sempre com `EXPLAIN (ANALYZE, BUFFERS)`:

1. `... ORDER BY criado_em DESC, id DESC LIMIT 20 OFFSET 0`
2. `... ORDER BY criado_em DESC, id DESC LIMIT 20 OFFSET 900000`
3. crie `CREATE INDEX pedidos_criado_id_idx ON pedidos (criado_em DESC, id DESC);` e repita a 1 e a 2
4. a versão keyset da primeira página e a de uma página lá no fim, usando `(criado_em, id) < ($1, $2)`

Anote `shared hit`, `rows` e `Execution Time` de cada uma. Depois reproduza o bug de conteúdo: leia a
página 1, insira uma linha com `criado_em = now()`, leia a página 2 com `OFFSET 20` e procure o item
repetido.

Entregue: marque os itens que você comprovou de verdade, com os números anotados.
---
O que você deve ter visto:

- **`OFFSET 0`** lê cerca de 20 linhas — rápido com ou sem índice, porque o `LIMIT` corta cedo.
- **`OFFSET 900000` sem índice**: `Seq Scan` mais `Sort` da tabela inteira, dezenas de milhares de buffers e
  centenas de milissegundos. Com índice, melhora, mas o plano ainda mostra `rows=900020` **produzidas** para
  devolver 20: o Postgres percorre e descarta. O `shared hit` cresce proporcionalmente ao offset.
- **Keyset com o índice `(criado_em DESC, id DESC)`**: `Index Scan` com `LIMIT`, algo como 5 a 25 buffers
  **em qualquer página**. É esse o ponto do exercício — não é "mais rápido", é **custo constante**. Offset é
  O(n) na página; keyset é O(1).
- **O item repetido**: ao inserir uma linha no topo entre as duas leituras, a página 2 do offset devolve de
  novo o último item da página 1. No keyset isso não acontece, porque o cursor é ancorado em um valor, não
  em uma contagem.

O que o keyset custa: você perde "pular para a página 37" (só dá para avançar e voltar) e precisa carregar o
cursor no cliente. Para feed, listagem infinita, exportação e API pública, é troca boa. Para um back-office
com paginação numerada sobre 2.000 linhas, offset está ótimo — [[otimizacao-prematura]] vale aqui também.
:::

:::objetivo Fechou o curso
Você sabe calcular quando o índice deixa de valer, ler um plano pela divergência entre estimado e real,
identificar lost update e deadlock pelo mecanismo, dimensionar o pool pela [[littles-law]] e provar o ganho
do keyset com `Buffers`. O passo seguinte é levar isso para o deck **Concorrência e Performance
Engineering** e para o Treino Especial da caça ao vazamento.
:::
