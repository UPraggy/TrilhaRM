# content/praticas/

Exercícios **práticos** ligados aos termos dos decks. A ideia: o app mostra o enunciado, você resolve
**fora dele** (terminal, editor, psql, Docker, papel…) e volta para registrar a resposta. Tipos com
gabarito objetivo (saída de comando, número, múltipla escolha) o servidor corrige sozinho; os abertos
(texto/código, checklist) você se avalia 0–5 e pode pedir a opinião do mentor IA (OpenRouter).

Um arquivo por deck: `content/praticas/<deckId>.json` (o nome do arquivo é livre; o que vale é `deckId`).
O servidor recarrega quando o mtime muda — não precisa de restart.

## Esquema

```json
{
  "deckId": "node-internals",
  "titulo": "Práticas · Node.js internals",
  "exercicios": [
    {
      "id": "ordem-event-loop",
      "titulo": "Ordem de execução: timers, microtasks e I/O",
      "termos": ["event-loop", "microtasks"],
      "nivel": 3,
      "tempoMin": 15,
      "ambiente": "node",
      "enunciado": "Texto do problema. Pode ter blocos de código entre ```.",
      "passos": ["Passo 1", "Passo 2"],
      "entrega": { "tipo": "saida", "esperado": "A\nB\nC", "rotulo": "Cole a saída exata do script" },
      "dicas": ["Dica 1 (custa nota)", "Dica 2"],
      "solucao": "Explicação + código da solução. Só aparece quando você pede (ou acerta).",
      "criterios": ["O que uma resposta boa precisa ter", "…"],
      "postmortem": false
    }
  ]
}
```

| campo | obrigatório | regras |
|---|---|---|
| `id` | sim | kebab-case, único no arquivo |
| `titulo` | sim | curto, começa com verbo ou nome do problema |
| `termos` | sim | ids de termos do deck (`"event-loop"`) ou de outro deck (`"http-networking/keep-alive"`). O **primeiro** é o termo principal: a nota do exercício vira uma avaliação SM-2 nele (modo `pratica`). Ids inválidos geram aviso e o exercício continua |
| `nivel` | sim | 1–5 na escala do Rafael: 2 explico · 3 aplico · 4 diagnostico · 5 ensino/defendo |
| `tempoMin` | sim | estimativa honesta em minutos (10–90) |
| `ambiente` | sim | `node` · `bash` · `postgres` · `redis` · `docker` · `nginx` · `browser` · `papel` · `celular` · `git` · `http` |
| `enunciado` | sim | o problema. Diga **o que entregar**. `\n` quebra linha; blocos ``` viram `<pre>` |
| `passos` | não | lista curta, quando o caminho importa |
| `entrega` | sim | ver tipos abaixo |
| `dicas` | não | 0–3; cada dica usada baixa a nota automática de 4 → 3 |
| `solucao` | sim | gabarito completo. Revelar antes de acertar limita a nota a 1 |
| `criterios` | sim p/ `texto` | rubrica: o que o mentor IA e a auto-avaliação devem cobrar |
| `postmortem` | não | `true` = failure lab; a resposta deve seguir sintoma → evidência → causa → correção → o que muda no processo |

### Tipos de entrega

| `tipo` | campos | correção |
|---|---|---|
| `saida` | `esperado` (string), `normalizar` (default `true`: trim, colapsa espaços, ignora maiúsculas e CRLF) | igualdade após normalizar. Aceita `esperadoQualquer: ["A","B"]` para várias saídas válidas |
| `numero` | `esperado` (number), `tolerancia` (fração, ex. `0.1` = ±10 %) ou `min`/`max` | intervalo |
| `escolha` | `opcoes` (array de strings), `correta` (índice) **ou** `corretas` (array de índices) | igualdade do conjunto |
| `texto` | `criterios` no exercício; `minimoChars` (default 80) | você se dá a nota 0–5 depois de ver solução + critérios; botão "Pedir ao mentor" opcional |
| `checklist` | `itens` (array de strings, 3–8) | nota = proporção marcada × 5, arredondada |

### Nota automática (saida / numero / escolha)

- acertou de primeira, sem dica → **4** (diagnostico)
- acertou com dica ou na 2ª/3ª tentativa → **3**
- acertou depois de 3 erros → **2**
- pediu a solução antes de acertar → **1**
- desistiu sem acertar nem revelar → **0**

Em qualquer tipo, depois de concluir você pode **ajustar a nota** (0–5) se achar que o número não
representa o que aprendeu — o app grava a sua.

### Boas práticas ao escrever

- Exercícios têm que rodar **no que o Rafael já tem**: Node 22, PostgreSQL local, Redis (Docker),
  Nginx, pfSense, o celular S23 com Termux/PRoot (AutoTrade e Trilha RM rodam lá em PM2), Windows 11 + Git Bash.
- Prefira **medir** a "implementar": `--cpu-prof`, `EXPLAIN ANALYZE`, `autocannon`, `ss`, `curl -w`, heap snapshot.
- Saída determinística para `saida`: não dependa de tempo, IPs ou ordem de hash. Se não dá para garantir,
  vire `numero` com tolerância ou `texto`.
- Cada deck: 4–6 exercícios, misturando tipos, do nível 2 ao 4/5, pelo menos 1 failure lab (`postmortem: true`)
  quando o tema pede.
- Enunciado de `texto` sempre termina com "Entregue: …" listando o que colar.
