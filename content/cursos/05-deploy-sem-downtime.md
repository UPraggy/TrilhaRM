---
id: deploy-sem-downtime
deck: testes
fase: 4
ordem: 5
nivel: 4
tags: [testes, deploy, producao, migracao, pm2]
descricao: Testes que pegam bug de verdade, deploy que ninguém percebe e migração de banco em três passos — com PM2 e Nginx, que é o que você já usa.
---

# Deploy sem downtime

Todo deploy é um momento em que **duas versões do seu código rodam ao mesmo tempo**. Durante alguns
segundos ou minutos, a versão antiga e a nova compartilham o mesmo banco, o mesmo cache, a mesma fila.
Quase todo incidente de deploy nasce de ignorar essa frase.

Este curso liga três coisas que costumam ser estudadas separadas e que só funcionam juntas: **teste**
que dá confiança para liberar, **deploy** que não derruba requisição em voo, e **migração de banco** que
sobrevive à convivência das duas versões.

:::objetivo Ao terminar este curso você consegue
- decidir o que vale testar e o que é só espelho do código;
- explicar por que cobertura alta não significa teste bom, e o que medir no lugar;
- executar um rolling restart que não derruba nenhuma requisição, com PM2 e Nginx;
- migrar schema em produção com expand → migrate → contract, sem janela de manutenção;
- responder, antes de cada deploy, em quanto tempo ele é desfeito.
:::

## Testes que valem

### O que vale testar

Unidade é um **comportamento observável**, não uma função. Testar método privado é acoplar o teste à
implementação e travar o refactor.

| Vale testar | Não vale |
| --- | --- |
| Função com decisão: cálculo, parser, validação, máquina de estados | Controller que só chama o service e devolve JSON |
| Regra de negócio com ramificações | Getter, setter, mapeamento trivial |
| Fronteira e caso-limite (zero, nulo, vazio, negativo) | Biblioteca de terceiro (teste o SEU uso dela) |

:::alerta O sinal do teste ruim
Se para testar você precisou de quatro dublês, o problema não é o teste: é o design. A lógica está
entrelaçada com I/O, e o remédio é separar *decidir* de *executar* — a decisão vira função pura, fácil
de testar; a execução fica numa camada fina, coberta por integração.
:::

O teste mais valioso de todos é o que **falha antes** da correção. Se você escreveu um teste e ele
passou de primeira sem você ter mudado nada, você ainda não sabe se ele testa alguma coisa.

### Cobertura mente

Cobertura mede **linhas executadas**, não comportamento verificado. Um teste que chama a função e não
afirma nada cobre 100 % e não pega bug nenhum.

:::exemplo O teste que testa outro programa
Uma armadilha real: um teste que criava um **fake síncrono** para um método que, na produção, era
assíncrono. O teste passava, a cobertura subia — e ele exercitava um fluxo que não existia. O bug de
ordenação que ele deveria pegar só apareceu em produção, porque em produção havia `await` no meio.
Quando o dublê muda a **natureza** do que ele substitui, você testou outro programa.
:::

O que medir no lugar: **mutation score** (o teste falha quando alguém estraga o código de propósito?),
número de **bugs que escaparam** para produção e quantos testes quebram num refactor que não muda
comportamento — se muitos, eles testam estrutura, não comportamento.

:::atividade
id: teste-que-pega-bug
titulo: Qual destes testes pegaria o bug?
termos: [testes/unit-test, testes/coverage]
nivel: 3
tempoMin: 15
ambiente: papel
entrega:
  tipo: escolha
  rotulo: Qual teste teria pegado o bug de Number(null) === 0?
  opcoes:
    - Um caso com saldo = null, afirmando que a função REJEITA em vez de tratar como zero
    - Um caso com saldo = 100, afirmando que a função aceita
    - Um teste que chama a função com vários valores e só verifica que não lança exceção
    - Um teste de integração que sobe o servidor e faz uma requisição válida
  correta: 0
criterios:
  - Entendeu que o teste precisa cobrir o caso-limite E afirmar o comportamento esperado
---
Um bug real: `Number(null) === 0`. Uma função recebia o saldo lido de uma API; quando a leitura falhava,
o valor chegava `null`, virava `0` silenciosamente e o sistema concluía **"saldo zero confirmado"** em
vez de **"não consegui ler o saldo"**.

```js
function podeComprar(saldoBruto, preco) {
  const saldo = Number(saldoBruto)     // null vira 0
  return saldo >= preco
}
```

Qual teste teria pegado isso **antes** de chegar à produção?
---
**O caso com `null` afirmando que a função REJEITA.** As duas partes importam: cobrir o caso-limite *e*
afirmar o comportamento certo.

- O caso feliz (saldo = 100) nunca encontraria o bug: `null` não aparece ali.
- "Não lança exceção" é o antipadrão clássico — cobertura sobe, comportamento não é verificado, e o bug
  passa justamente porque ele **não** lança exceção: ele mente em silêncio.
- Integração com requisição válida também não chega perto: o `null` vem de uma **falha** da API externa,
  que o caminho feliz não exercita.

A lição transferível: os casos-limite que valem ouro são os que vêm da **fronteira** do sistema —
`null`, `undefined`, string vazia, zero, negativo, número acima de 2^53, data no fim do mês, fuso na
virada do dia. E há uma correção de design junto do teste: distinguir "não sei" de "zero" no **tipo**.
Devolver `null` e forçar quem chama a decidir, ou devolver `{ ok: false, motivo }`, elimina a classe
inteira de bug em vez de tampar um caso.

```js
function podeComprar(saldoBruto, preco) {
  if (saldoBruto === null || saldoBruto === undefined || saldoBruto === '') {
    throw new Error('saldo não lido: decisão indisponível')
  }
  const saldo = Number(saldoBruto)
  if (!Number.isFinite(saldo)) throw new Error('saldo inválido')
  return saldo >= preco
}
```
:::

### Flaky: o teste que destrói a confiança

Um teste que falha às vezes é pior que nenhum teste: ele treina o time a reexecutar o pipeline até ficar
verde — e quando o teste verdadeiro falhar, alguém vai reexecutar também.

Causas em ordem de frequência: **tempo** (`sleep` em vez de esperar condição, dependência do relógio de
parede), **ordem** (estado compartilhado entre testes), **concorrência** (corrida real que o teste às
vezes ganha) e **rede** (chamada externa não isolada).

A regra dura: teste flaky é **quarentenado imediatamente** e vira bug com dono. Deixá-lo no pipeline
"até alguém olhar" é a decisão que corrói a suíte inteira.

## Deploy que ninguém percebe

### Duas versões ao mesmo tempo

Em rolling restart (o que o `pm2 reload` faz) as instâncias são substituídas aos poucos. Durante a
troca, requisições chegam **nas duas versões**. Isso impõe uma regra que resolve a maioria dos
incidentes:

> Toda mudança precisa ser compatível com a versão anterior, **nos dois sentidos**, porque por alguns
> minutos as duas estarão no ar.

Mudanças seguras: adicionar campo opcional, adicionar endpoint, aceitar entrada nova opcional.
Quebradiças: remover ou renomear campo, mudar tipo, tornar opcional obrigatório — e a pior de todas,
**mudar o significado mantendo o nome**, que não quebra nada e corrompe em silêncio.

### O contrato do desligamento gracioso

`pm2 reload` sobe a instância nova, espera ficar pronta, manda **SIGTERM** na velha e aguarda
`kill_timeout`. Se o seu código não trata SIGTERM, o "reload" vira "restart" e o usuário leva 502.

A sequência correta, em ordem:

1. marcar o health check como **não-pronto** (o balanceador tira a instância do rodízio);
2. **esperar** o intervalo de checagem — senão ainda chega tráfego;
3. `server.close()` — para de aceitar conexões novas, mantém as abertas;
4. terminar as requisições em voo, com prazo;
5. fechar pool do banco, consumidores de fila e timers — **depois** do passo 4, nunca antes;
6. sair.

:::alerta Keep-alive ocioso segura o close()
`server.close()` espera **todas** as conexões, inclusive as keep-alive ociosas — e o callback pode nunca
ser chamado. Node 18+ tem `server.closeIdleConnections()` (fecha as ociosas, preserva as em uso) e
`closeAllConnections()` para o fim do prazo. Sem isso, o processo só sai no timeout duro.
:::

:::atividade
id: ordem-do-shutdown
titulo: A ordem certa do desligamento gracioso
termos: [linux-processos/graceful-shutdown, resiliencia/health-check]
nivel: 4
tempoMin: 15
ambiente: papel
entrega:
  tipo: escolha
  rotulo: O que acontece se você fechar o pool do banco ANTES de drenar as requisições em voo?
  opcoes:
    - As requisições em voo falham no meio, e o usuário recebe erro num deploy que deveria ser invisível
    - Nada — o pool reabre sozinho quando alguém precisar
    - O processo sai mais rápido e é isso que se quer
    - As requisições ficam em fila até o pool voltar
  correta: 0
criterios:
  - Entendeu que os recursos se fecham DEPOIS que o trabalho em voo termina
---
Uma implementação comum de desligamento gracioso:

```js
process.on('SIGTERM', async () => {
  await pool.end()          // fecha o pool do banco
  server.close(() => process.exit(0))
})
```

O que acontece com as requisições que já estavam sendo processadas?
---
**Elas falham no meio.** As requisições em voo ainda precisam do banco: ao fechar o pool primeiro, cada
uma recebe erro de conexão e o usuário leva 500 num deploy que deveria ser invisível — pior, um erro
*intermitente*, que só acontece durante o deploy e é difícil de reproduzir depois.

A ordem certa inverte os dois e coloca o readiness na frente:

```js
let saindo = false
app.get('/pronto', (_req, res) => res.status(saindo ? 503 : 200).end())

process.on('SIGTERM', async () => {
  saindo = true                                  // 1. sai do rodízio do balanceador
  await esperar(INTERVALO_DO_BALANCEADOR)        // 2. deixa ele perceber
  server.closeIdleConnections?.()                // 3. solta keep-alive ocioso
  await new Promise((r) => server.close(r))      // 4. drena o que está em voo
  await pool.end()                               // 5. SÓ AGORA fecha os recursos
  process.exit(0)
})
setTimeout(() => process.exit(1), 15000).unref() // prazo duro, sempre
```

Dois detalhes que completam: o **prazo duro** com `.unref()` impede que uma requisição travada segure o
processo para sempre; e, em container, nada disso roda se o processo for PID 1 sem init ou se o `CMD`
estiver na forma shell — o SIGTERM é ignorado e vem SIGKILL no fim do prazo.
:::

### Reversibilidade importa mais que perfeição

A pergunta que decide o risco de um deploy não é "vai funcionar?" — é **"se não funcionar, quanto tempo
até desfazer?"**.

Rollback de código é fácil. O que fecha a janela de rollback é o **estado**: migração destrutiva, dado
gravado em formato que a versão antiga não lê, cache com estrutura nova, mensagem publicada em esquema
novo.

As três alavancas: **expand/migrate/contract** (compatibilidade nos dois sentidos durante a transição),
**feature flag** (separa "deploy" de "release" — o código vai para produção desligado, e ligar/desligar
é instantâneo) e **dual read** (a versão nova lê o formato antigo e o novo).

:::nota Versione a chave do cache
Se o formato do que você guarda em cache mudou, use `v2:usuario:123` em vez de `usuario:123`. A versão
antiga simplesmente não acha a chave e recalcula, em vez de interpretar errado o que a nova gravou.
:::

## Migrar o banco em produção

### Expand → migrate → contract

Renomear uma coluna em um passo quebra a versão antiga que ainda está no ar. O caminho seguro tem três
deploys:

1. **EXPAND** — adicionar o novo **sem remover o velho**: `ADD COLUMN` (barato desde o PG 11 mesmo com
   default), escrever nos dois (dual write), constraint como `NOT VALID`.
2. **MIGRATE** — backfill **em lotes** com commit a cada N linhas, nunca num UPDATE gigante que segura
   lock e estoura o WAL; depois `VALIDATE CONSTRAINT`, que pede um lock fraco.
3. **CONTRACT** — depois que a versão antiga saiu do ar: parar de escrever no campo velho e removê-lo.

```sql
-- MIGRATE em lotes, interrompível e observável
UPDATE t SET novo = velho
 WHERE id IN (SELECT id FROM t WHERE novo IS NULL ORDER BY id LIMIT 5000);
-- repetir até 0 linhas afetadas, com commit por rodada
```

### O ALTER que derruba o site

O incidente mais caro de migração não tem a ver com o tamanho da tabela. `ALTER TABLE` pede
**ACCESS EXCLUSIVE**, que conflita com tudo — inclusive `SELECT`. Se houver uma transação longa em
curso, o ALTER entra na **fila** de locks; e como a fila é ordenada, **todo SELECT que chegar depois
fica atrás dele**.

Resultado: uma migração de 2 ms derruba a leitura por minutos. O culpado aparente é o ALTER; o culpado
real é a transação esquecida.

:::alerta O `lock_timeout` é obrigatório em migração
```sql
BEGIN;
SET LOCAL lock_timeout = '3s';
ALTER TABLE pedidos ADD COLUMN canal text;
COMMIT;
```
Se o lock não vier em 3 s, a migração **falha** e você tenta de novo daqui a pouco — em vez de formar
fila e transformar o deploy em incidente. Índice novo sempre com `CREATE INDEX CONCURRENTLY` (que não
roda dentro de transação e pode deixar índice `INVALID` se falhar — confira `pg_index.indisvalid`).
:::

:::atividade
id: migracao-em-tres-passos
titulo: Planejar a troca de uma coluna sem downtime
termos: [postgres-internals/migracao-sem-downtime, postgres-internals/lock-fila, resiliencia/rollback]
nivel: 5
tempoMin: 30
ambiente: papel
entrega:
  tipo: texto
  rotulo: Seu plano, deploy por deploy
  minimoChars: 400
dicas:
  - Pergunte-se, a cada passo "se eu precisar voltar AGORA, o que acontece?".
  - O passo destrutivo é sempre o último, e só depois que a versão antiga saiu do ar.
criterios:
  - Separa explicitamente os três deploys (expand, migrate, contract)
  - Mantém a versão antiga funcionando durante todo o processo
  - Faz o backfill em lotes, não num UPDATE único
  - Usa lock_timeout e/ou operações não-bloqueantes nos passos com ALTER
  - Diz, em cada passo, se o rollback ainda é possível e sem perda
---
A tabela `pedido` tem a coluna `valor_centavos` (inteiro). O time decidiu trocar por `valor` (numeric,
em reais). A aplicação lê e escreve essa coluna em várias rotas, roda em 4 instâncias PM2 e **não pode
ter janela de manutenção**.

Escreva o plano, deploy por deploy. Para cada passo diga: o que muda no **banco**, o que muda no
**código**, e se o **rollback** ainda é possível sem perda.

Cuidado com a armadilha: manter o nome e mudar a unidade é a pior mudança possível — não quebra nada e
deixa todos os números 100× errados.
---
**Deploy 1 — EXPAND.**
Banco: `ALTER TABLE pedido ADD COLUMN valor numeric;` com `SET LOCAL lock_timeout = '3s'` (o `ADD COLUMN`
sem default é praticamente instantâneo — o risco é só a fila de locks).
Código: escreve nos **dois** campos (`valor_centavos` e `valor`), lê ainda do antigo.
Rollback: total e sem perda — a coluna nova é ignorada pela versão anterior.

**Deploy 2 — MIGRATE.**
Banco: backfill em lotes de 5.000, com commit por rodada, até zero linhas; opcionalmente
`ALTER TABLE pedido ADD CONSTRAINT valor_nao_nulo CHECK (valor IS NOT NULL) NOT VALID;` seguido de
`VALIDATE CONSTRAINT` (lock fraco).
Código: começa a **ler** de `valor`, continua escrevendo nos dois.
Rollback: ainda possível — o campo antigo continua sendo escrito e está correto.

**Deploy 3 — CONTRACT.**
Código: para de escrever em `valor_centavos`.
Banco: só depois de alguns dias de observação, `ALTER TABLE pedido DROP COLUMN valor_centavos;`.
Rollback: a partir do momento em que a escrita no campo antigo para, voltar significa perder os pedidos
gravados nesse intervalo. **Aqui a janela fecha** — e é por isso que o passo destrutivo é o último e
acontece bem depois, nunca no mesmo dia.

**Três detalhes que fazem a diferença:**

- **Nunca** mude a unidade mantendo o nome. `valor_centavos` → `valor` é um nome novo *de propósito*: se
  alguém ler o campo errado, o resultado é evidente, não silenciosamente 100× errado.
- Com 4 instâncias PM2, durante cada `pm2 reload` convivem duas versões. É por isso que o dual write
  existe: a instância antiga continua gravando o campo antigo enquanto a nova já grava os dois.
- Verifique a migração com **dado**, não com fé: `SELECT count(*) FROM pedido WHERE valor IS DISTINCT
  FROM (valor_centavos / 100.0);` precisa dar zero antes do passo 3.
:::

### Fechando: o hábito de uma frase

Antes de cada deploy, escreva **uma frase** dizendo como desfazê-lo. Se a frase demora mais que a
explicação da funcionalidade, o plano de rollback é o trabalho que ainda falta fazer — e vale mais
gastar essa meia hora agora do que descobrir às 3 da manhã que não havia plano.
