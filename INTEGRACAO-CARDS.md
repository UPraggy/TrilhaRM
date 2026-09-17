# Integração dos cards PNG (server/index.js)

Os cards já estão prontos e o bot do Telegram já manda todos eles sozinho — **nada aqui é
obrigatório para o Telegram funcionar**. Este arquivo existe só para a parte que eu não posso
fazer: `server/index.js` não é meu. São **3 linhas** para poder abrir os cards no navegador e para
o bloco do Telegram na tela **Config** mostrar o card do link.

## O que foi criado

| arquivo | o que faz |
| --- | --- |
| `server/png.js` | encoder PNG (IHDR/IDAT/IEND, CRC32 próprio, filtro 0, `zlib.deflateSync`) + retângulo/linha/círculo/arco/gradiente + fonte bitmap 5x9 embutida com acentos do PT-BR |
| `server/qrcode.js` | QR Code puro (versões 1-10, nível M, modo byte): GF(256), Reed-Solomon, máscaras por penalidade, formato/versão em BCH. `matrizQR(texto)` devolve a matriz booleana |
| `server/cards.js` | os seis cards 800x418 na identidade do app |
| `server/telegram.js` | manda `sendPhoto` com legenda e botões, com queda para texto; expõe `telegram.card(nome)` |
| `tests/png.test.js`, `tests/qrcode.test.js` | os testes dos dois módulos novos |

Zero dependência nova: só `node:zlib` e `node:buffer`.

## A rota (cole em `server/index.js`)

Coloque **antes** do `api.use((_req, res) => res.status(404)…)`, junto das outras rotas do bot
(depois de `api.post('/telegram/teste', …)`):

```js
// ---- cards PNG (as mesmas imagens que o bot manda no Telegram) -------------
// GET /api/cards/link.png | hoje | ofensiva | matriz | sugestao | treino
api.get('/cards/:nome.png', (req, res) => {
  const r = telegram.card(req.params.nome)
  if (!r.ok) return res.status(404).json({ erro: r.erro })
  res.set('Content-Type', 'image/png')
  res.set('Cache-Control', 'no-store') // o card muda junto com o progresso e com a URL do túnel
  res.send(r.png)
})
```

Três detalhes que importam:

1. **`:nome.png`** — no Express 4 (o que está no `package.json`) o `.png` no meio do path funciona e
   `req.params.nome` vem sem a extensão. Se um dia o projeto for para o Express 5, troque por
   `api.get('/cards/:arquivo', …)` e faça `const nome = String(req.params.arquivo).replace(/\.png$/, '')`.
2. **`res.send(Buffer)`** já manda o binário certo; não use `res.json`.
3. O router `api` já força `Cache-Control: no-store` no middleware de cima — a linha acima é só
   explícita, pode ficar ou sair.

Nome desconhecido devolve **404 JSON** (`{ erro: 'card desconhecido: x' }`), e erro na geração
devolve 404 com a mensagem — a tela do Config trata os dois mostrando o aviso no lugar da imagem.

## Conferir depois de colar

```bash
npm start            # ou npm run dev
curl -s -o card.png -w '%{http_code} %{content_type} %{size_download}\n' http://127.0.0.1:8790/api/cards/link.png
# esperado: 200 image/png ~16000
```

No navegador: `http://127.0.0.1:8790/api/cards/hoje.png` (e `ofensiva`, `matriz`, `sugestao`,
`treino`). Na tela **Config**, o bloco "Bot do Telegram" passa a mostrar o card do link com um botão
"Recarregar o card" e os atalhos para os outros cinco. Sem a rota, o bloco mostra um aviso apontando
para este arquivo — nada quebra.

## O que o bot passou a mandar

| gatilho | card | se a imagem falhar |
| --- | --- | --- |
| `/link`, URL nova do túnel, mensagem de teste | `cardLink` (QR do link) | manda o texto de antes |
| `/hoje`, lembrete do dia, `/start` | `cardHoje` | idem |
| `/ofensiva`, ofensiva em risco (20h) | `cardOfensiva` | idem |
| `/matriz` | `cardMatriz` | idem |
| `/treino` | `cardTreino` (se a temporada já começou) ou `cardSugestao` | idem |
| `/pratica`, `/curso` | `cardSugestao` | idem |

O texto vai na **legenda** (limite 1024: `legendaCurta()` corta em quebra de linha, nunca no meio de
uma tag HTML) e os **botões inline continuam iguais**. `/revisar`, `/lembrete`, `/parar` e `/ajuda`
seguem sendo texto puro, de propósito: são listas e confirmações, não cabem numa imagem.

O PNG do link fica em cache enquanto a URL do túnel não mudar; os outros são gerados na hora
(~40 ms cada, 15-20 KB).
