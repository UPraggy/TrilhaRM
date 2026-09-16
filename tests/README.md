# Testes

Só `node --test` (Node 22+) e `node:assert`. **Nenhuma dependência nova** — nada de vitest/jest.

```bash
npm test                 # tudo (180 testes)
npm run test:conteudo    # valida content/ (decks, praticas, cursos) + content/treinos
```

> O script é `node --test "tests/*.test.js"` e não `node --test tests/`: no Node 26 um diretório solto
> vira "módulo não encontrado". O glob (expandido pelo próprio Node, não pelo shell) funciona nos dois.

Um arquivo só, ou um teste só:

```bash
node --test tests/sm2.test.js
node --test --test-name-pattern "milhar" tests/praticas.test.js
node --test --test-only tests/api.test.js     # se você marcar { only: true } em algum teste
```

## O que cada arquivo cobre

| arquivo | cobre |
| --- | --- |
| `sm2.test.js` | escala 0–5 (≥ 3 é acerto), intervalo 1 → 6 → ×facilidade, nota 0 volta o intervalo a 0 (revisar hoje), facilidade presa entre 1,3 e 3,0, teto de 365 dias, `proximaRevisao` em data **local** (23:30 não pode pular um dia) e `vencido()` para termo nunca visto |
| `progresso.test.js` | escrita atômica (sem `.tmp` sobrando) e recarga, ofensiva (10 avaliações fecham o dia, 9 não; dia seguinte continua, dois dias de buraco zeram, `melhor` nunca diminui), histórico de 28 dias, práticas/cursos e **retrocompatibilidade** do `data/progresso.json` antigo (sem `praticas`/`cursos`) |
| `praticas.test.js` | correção de `saida` (espaços, CRLF, maiúsculas, `esperadoQualquer`), `numero` (tolerância, faixa, vírgula decimal, separador de milhar), `escolha` (única, múltipla, ordem, repetido), `checklist` e a nota automática (4 · 3 · 2 · 1) |
| `markdown.test.js` | `parseFrontmatter`, `parseYaml`, blocos (tabela GFM, lista aninhada, código com linguagem, citação, callout, wikilinks) e `parseCurso` (`#`/`##`/`###`, id `{#id}`, `:::atividade`, container mal fechado → erro legível) |
| `treinos.test.js` | carga e validação dos treinos reais, versão pública **sem gabarito** (desafio, cronometrado, simulado), `gabaritoEtapa` e a entrega de **cada tipo de etapa** via `progresso-treinos.js` |
| `api.test.js` | o Express de verdade: `/api/saude`, `/api/decks`, 404, `POST /api/progresso/avaliar` com nota inválida, gabarito que não vaza em `GET /api/praticas/:deck/:ex` e o fluxo completo de uma prática (iniciar → errar → dica → acertar → nota) |

## Regras da casa

- **Nunca escreva no `data/` do projeto.** Todo teste que persiste usa `dirTemp()` (`tests/_ajuda.mjs`),
  que cria uma pasta em `os.tmpdir()` e apaga no fim.
- **Porta 0.** `api.test.js` abre um socket na porta 0, lê `server.address().port` e passa essa porta
  para o servidor — 5173/8790/8796/8797/8799 estão ocupadas na máquina do Rafael.
  Como `server/index.js` não exporta o `app` (ele resolve a raiz pelo próprio `__dirname` e sobe sozinho),
  o teste monta uma raiz descartável — cópia de `server/*.js` + junctions para `content/` e `node_modules/`
  + um `data/` vazio — e roda o servidor lá dentro. O servidor é encerrado no `after` (nada pendurado).
- **Teste novo para cada bug que aparecer.** Bug encontrado = primeiro um teste que falha reproduzindo
  o sintoma, depois o conserto. O teste fica, com um comentário curto dizendo o que ele protege.
- Bugs que estes testes já pegaram (cada um tem o seu teste): `nota: null` no `POST /api/progresso/avaliar`
  virava nota 0 (`Number(null) === 0`) e zerava o termo · número com separador de milhar (`1.900.020`)
  e resposta em branco eram lidos errado na entrega `numero` · `:::` sem fechar engolia o resto do curso
  em silêncio.
- `tests/_ajuda.mjs` não é arquivo de teste (por isso o `.mjs` e o `_`): ali ficam `dirTemp`,
  `apagarTemp`, `diaRelativo`, `repoFalso` e `deckFalso`.
