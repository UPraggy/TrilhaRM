# Como pedir um curso (ou um módulo) para uma IA

Copie **tudo** que está entre as linhas `=== INÍCIO DO PROMPT ===` e `=== FIM DO PROMPT ===`, cole no
ChatGPT / Gemini / Claude / qualquer outro, troque o assunto na última linha e mande.

Depois: salve a resposta como `content/cursos/NN-assunto.md` e rode

```bash
node scripts/validar-conteudo.mjs
```

Se sair `OK - sem avisos`, é só abrir o app em **Cursos** — não precisa reiniciar nada. Se o validador
reclamar de wikilink inexistente, cole o aviso de volta na IA e peça a correção.

> Dica: antes de mandar, abra o glossário do app (ou `content/decks/<deck>.json`) e cole na IA a lista de
> ids de termos do deck. Ela vai usar ids reais nos `[[wikilinks]]` em vez de inventar.

---

=== INÍCIO DO PROMPT ===

Você vai escrever conteúdo para o **Trilha RM**, um app pessoal de estudo de engenharia de software.
A saída é **um único arquivo Markdown**, sem nenhum texto antes ou depois — nada de "aqui está" nem de
explicação. Só o arquivo, dentro de um bloco de código.

## Formato exato

```markdown
---
id: kebab-case-do-curso
deck: id-do-deck-relacionado
fase: 2
ordem: 1
nivel: 3
tags: [tag, outra]
descricao: Uma frase que aparece no card do curso.
---

# Título do curso

Um parágrafo de abertura: o que a pessoa vai conseguir fazer no fim, sem promessa vazia.

:::objetivo Ao terminar você consegue
- verbo no infinitivo + resultado observável;
- outro;
- outro.
:::

## Nome do módulo

### Nome da lição

Texto normal em Markdown. Termos do app viram links com [[wikilinks]].

:::nota Observação lateral
Texto curto que não cabe no fluxo principal.
:::

:::alerta A armadilha
O erro que todo mundo comete aqui, e por quê.
:::

:::exemplo Um caso concreto
Números de verdade, não "muito" nem "pouco".
:::

:::atividade
id: kebab-case-da-atividade
titulo: Título curto da atividade
termos: [id-do-termo-principal, outro-termo]
nivel: 3
tempoMin: 15
ambiente: node
entrega:
  tipo: saida
  rotulo: Cole a saída do comando
  esperado: |
    linha 1
    linha 2
dicas:
  - Dica que empurra sem entregar.
criterios:
  - O que uma resposta boa precisa ter.
---
O enunciado, em Markdown. Pode ter blocos de código, listas e tabelas.
Termine dizendo **o que entregar**.
---
A solução completa, com o porquê — não só o resultado.
:::

### Outra lição

...
```

## Regras (todas obrigatórias)

1. **Estrutura**: `#` = curso, `##` = módulo, `###` = lição. Nunca pule nível. Cada módulo tem 2–3 lições;
   cada lição dá 5–12 minutos de leitura.
2. **Ids** em kebab-case, sem acento, únicos no arquivo (curso, lição e atividade).
3. **PT-BR**, segunda pessoa ("você"), direto. Sem emoji, sem "vamos embarcar nesta jornada", sem elogio
   ao leitor, sem encher linguiça. Frase curta vence frase bonita.
4. **Código sempre em JavaScript/Node** (CommonJS ou ESM), **nunca TypeScript**, nunca pseudocódigo.
   Bloco de código sempre com a linguagem: ` ```js `, ` ```bash `, ` ```sql `.
5. **Wikilinks**: `[[termo-id]]` para termos do deck indicado no frontmatter, ou
   `[[outro-deck/termo-id]]`. Use **só ids que eu te passei** — se não tiver a lista, não invente: escreva
   o termo como texto normal.
6. **Atividades**: pelo menos **uma por módulo**, e no curso inteiro pelo menos uma de cada tipo
   `saida`, `escolha` e `texto`. A atividade é resolvida **fora do app** (terminal, psql, Docker, papel);
   o app só registra a resposta.
7. **Toda atividade tem gabarito** (o texto depois do segundo `---`), e ele explica o *porquê*.
8. `tipo: saida` só serve quando a saída é **determinística**: não pode depender de tempo, IP, ordem de
   hash ou hardware. Se depender, use `numero` com `tolerancia`, `escolha` ou `texto`.
9. `esperado` com mais de uma linha usa `esperado: |` e bloco indentado. Valor com dois-pontos vai entre
   aspas. Número que é texto vai entre aspas (`esperado: "200"`).
10. `termos:` — o **primeiro** id é o termo principal: a nota da atividade vira a avaliação dele.
11. `ambiente` é um destes: `node` `bash` `postgres` `redis` `docker` `nginx` `browser` `papel` `celular`
    `git` `http`.
12. `nivel` de 1 a 5 nesta escala: 1 reconheço · 2 explico · 3 aplico · 4 diagnostico · 5 ensino/defendo.
13. **Prefira medir a implementar**: `curl -w`, `EXPLAIN ANALYZE`, `--cpu-prof`, `ss`, `autocannon`,
    heap snapshot. Todo conteúdo tem que rodar em Node 22, PostgreSQL local, Redis em Docker, Windows 11
    com Git Bash ou um Android com Termux/PRoot.
14. Sem HTML, sem imagens, sem link para curso pago. Tabelas GFM são bem-vindas quando comparam coisas.
15. Um `:::alerta` por módulo, no mínimo: o erro que trava alguém na vida real.

## Exemplo curto e completo (siga este padrão)

```markdown
---
id: indices-postgres
deck: banco-de-dados
fase: 2
ordem: 3
tags: [postgres, performance]
descricao: Por que um índice às vezes não é usado — e como provar isso em vez de adivinhar.
---

# Índices no PostgreSQL

Índice não é botão de "ficar rápido". É uma estrutura que o planejador **pode** escolher, se achar que
sai mais barato que ler a tabela inteira.

## Quando o índice não entra

### O planejador decide, não você

O `EXPLAIN` mostra o plano escolhido; o `EXPLAIN ANALYZE` mostra o plano **e** o que aconteceu de fato.
A diferença entre os dois é o melhor lugar para procurar um problema de performance.

:::alerta A pegadinha da tabela pequena
Numa tabela com 200 linhas, o Seq Scan quase sempre ganha — o índice só aparece quando o volume
justifica. Testar índice com dados de brinquedo leva à conclusão errada.
:::

:::atividade
id: forcar-o-seq-scan
titulo: Provar que a tabela pequena ignora o índice
termos: [indice-btree, plano-de-execucao]
nivel: 3
tempoMin: 15
ambiente: postgres
entrega:
  tipo: escolha
  rotulo: O que o EXPLAIN mostrou na tabela de 200 linhas?
  opcoes:
    - Index Scan, porque o índice existe.
    - Seq Scan, porque ler a tabela inteira sai mais barato nesse volume.
    - Bitmap Heap Scan, sempre.
  correta: 1
criterios:
  - Rodou o EXPLAIN e leu o plano em vez de supor
---
Crie uma tabela com 200 linhas, um índice B-tree na coluna `email` e rode:

```sql
EXPLAIN ANALYZE SELECT * FROM cliente WHERE email = 'a@b.c';
```

Depois insira 500 mil linhas, rode `ANALYZE` e repita. Compare os dois planos.

Entregue: a opção que descreve o primeiro plano.
---
Na tabela de 200 linhas o planejador escolhe **Seq Scan**: são poucas páginas, e usar o índice custaria
uma leitura extra por linha encontrada. Com 500 mil linhas e estatísticas atualizadas, o mesmo `SELECT`
passa a usar `Index Scan`.

A lição não é "índice é inútil" — é que o plano depende de **volume e estatísticas**, e por isso teste de
performance com dados de brinquedo mente.
:::
```

## Agora escreva

Assunto: **<TROQUE AQUI: ex. "cache com Redis", "observabilidade em Node", "Docker do zero">**
Deck relacionado (frontmatter `deck:`): **<TROQUE AQUI, ou remova a linha se não houver>**
Ids de termos que posso usar em wikilinks: **<COLE AQUI a lista, ou escreva "nenhum">**

Devolva **só** o arquivo Markdown, começando por `---`.

=== FIM DO PROMPT ===
