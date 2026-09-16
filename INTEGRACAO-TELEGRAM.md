# Integração do bot de Telegram — a fiação que falta

O bot está escrito e testado (57 testes num harness com mock da API do Telegram, porta 8796). De
propósito **não toquei** em `server/index.js`, `src/api.js`, `src/pages/Config.jsx`,
`ecosystem.config.cjs` nem no `README.md`. Aqui estão os trechos prontos para colar.

**Arquivos novos** (nenhum existente foi alterado):

```
server/telegram.js                 o bot: long polling, comandos, avisos, config do token
src/components/ConfigTelegram.jsx  bloco da tela /config (auto-contido, fala com /api/telegram)
src/telegram.css                   estilos do bloco (importado pelo componente)
content/PROMPT-MASTER.md           prompt único para qualquer IA gerar OU editar conteúdo
INTEGRACAO-TELEGRAM.md             este arquivo
```

Arquivos que o bot cria em runtime (todos já cobertos pelo `.gitignore`, regra `data/*.json`):

```
data/telegram.json     offset do polling, chatId, horário do lembrete, o que já foi avisado hoje
data/config.json       ganha a chave "telegramToken" ao lado da "openrouterKey"
```

---

## 1. `server/index.js`

### 1.1 import (junto dos outros, no topo)

```js
import { criarTelegram } from './telegram.js'
```

### 1.2 instância — depois de `const progTreinos = criarProgressoTreinos(...)`

```js
const telegram = criarTelegram({
  arquivoConfig: ARQ_CONFIG, // data/config.json - o token mora ao lado da key do OpenRouter
  arquivoEstado: path.join(RAIZ, 'data', 'telegram.json'),
  arquivoTunnel: path.join(RAIZ, 'data', 'tunnel-url.txt'), // o mesmo que tunnel.cjs escreve
  repo,
  praticas,
  cursos,
  treinos,
  progresso,
  progTreinos,
  porta: PORT,
})
```

### 1.3 rotas — cole depois do `api.get('/tunnel', …)`, antes do `api.use((_req, res) => …404)`

```js
// ---- bot do Telegram ------------------------------------------------------
// A API nunca devolve o token inteiro (só `tokenMascarado`) e o bot só atende o chat conectado.
api.get('/telegram', (_req, res) => {
  res.json(telegram.obterConfig())
})

// body { telegramToken?, lembrete?, avisos?, chat? } - "__apagar__" no token remove e para o bot
api.put('/telegram', async (req, res) => {
  const { telegramToken, lembrete, avisos, chat } = req.body || {}
  const r = await telegram.salvarConfig({ telegramToken, lembrete, avisos, chat })
  if (!r.ok) return res.status(400).json({ erro: r.erro })
  res.json({ ok: true, config: r.config })
})

// religar depois de corrigir o token (o 409 para o polling de propósito)
api.post('/telegram/iniciar', async (_req, res) => {
  const r = await telegram.iniciar()
  res.json({ ok: Boolean(r.ok), config: telegram.obterConfig() })
})

api.post('/telegram/parar', async (_req, res) => {
  await telegram.parar()
  res.json({ ok: true, config: telegram.obterConfig() })
})

api.post('/telegram/teste', async (_req, res) => {
  res.json(await telegram.enviarTeste())
})
```

### 1.4 subir o bot junto com o servidor — dentro do callback do `app.listen`

```js
const server = app.listen(PORT, '0.0.0.0', () => {
  const erros = repo.erros()
  console.log(`[trilharm] http://localhost:${PORT}  decks=${repo.listar().length}  dist=${fs.existsSync(DIST) ? 'sim' : 'não'}`)
  if (erros.length) console.warn('[trilharm] avisos de conteúdo:\n  - ' + erros.join('\n  - '))
  telegram.iniciar().then((r) => {
    if (r.ok) console.log('[trilharm] telegram: ligado')
    else console.log('[trilharm] telegram:', r.erro || 'não ligou')
  })
})
```

### 1.5 desligamento — a única linha que muda no `desligar()`

```js
function desligar(sinal) {
  console.log(`[trilharm] ${sinal} - encerrando`)
  telegram.parar() // para o long polling e aborta o fetch pendente
  server.close(() => {
    Promise.all([progresso.aguardarEscrita(), mentor.aguardarEscrita(), telegram.aguardarEscrita()]).then(() => process.exit(0))
  })
  setTimeout(() => process.exit(0), 3000).unref()
}
```

> Sem o `telegram.parar()` o `getUpdates` fica 50 s pendurado e o PM2 mata o processo no timeout —
> e, pior, se o processo novo subir antes do antigo morrer, os dois fazem polling do mesmo bot e você
> ganha o **409 Conflict** de brinde.

### 1.6 `/saude` (opcional, uma linha)

```js
    telegram: telegram.estado(),
```

---

## 2. `src/api.js` (opcional)

O `ConfigTelegram.jsx` é auto-contido — ele já fala com `/api/telegram` por um `fetch` interno, então
**funciona sem mexer no api.js**. Se você quiser centralizar, acrescente dentro do objeto `api`:

```js
  // bot do Telegram
  telegram: () => req('/api/telegram'),
  telegramSalvar: (patch) => req('/api/telegram', { method: 'PUT', body: JSON.stringify(patch) }),
  telegramIniciar: () => req('/api/telegram/iniciar', { method: 'POST', body: '{}' }),
  telegramParar: () => req('/api/telegram/parar', { method: 'POST', body: '{}' }),
  telegramTeste: () => req('/api/telegram/teste', { method: 'POST', body: '{}' }),
```

e, se quiser o mesmo atalho do mentor, na última linha do arquivo:

```js
export const { obterConfig, salvarConfig, listarModelos, avaliarComMentor, telegram, telegramSalvar, telegramIniciar, telegramParar, telegramTeste } = api
```

Depois, em `ConfigTelegram.jsx`, troque as quatro chamadas `req('/api/telegram…')` pelas funções do
`api.js` e apague o helper `req` do topo do componente.

---

## 3. `src/pages/Config.jsx` — onde encaixar

Import no topo, junto dos outros:

```js
import ConfigTelegram from '../components/ConfigTelegram.jsx'
```

E o componente **depois do card "Testar"**, antes do parágrafo final `dim small`:

```jsx
      <ConfigTelegram mostrarAviso={mostrarAviso} />

      <p className="dim small" style={{ marginTop: 14 }}>
        Esta tela não tem senha — o app roda atrás do túnel do dono. …
```

O `mostrarAviso` já existe naquele arquivo (`const { termos, mostrarAviso } = useStore()`). A prop é
opcional: sem ela o componente mostra o recado na própria caixa de feedback.

Se quiser separar em duas telas depois, o bloco é um `<div className="card">` inteiro — dá para mover
para uma página nova sem tocar em nada.

---

## 4. `ecosystem.config.cjs` — o que muda

**Nada é obrigatório.** O bot roda dentro do processo `trilharm` (é só um `fetch` em loop; não é um
processo novo). Dois ajustes que valem a pena:

```js
      env: {
        NODE_ENV: 'production',
        PORT: 8790,
        // opcional: token pelo ambiente em vez do data/config.json (o ambiente vence o arquivo)
        // TELEGRAM_BOT_TOKEN: '...',
      },
      max_memory_restart: '250M', // era 200M: o long polling segura um fetch aberto o tempo todo
      kill_timeout: 8000,          // dá tempo do desligar() abortar o getUpdates antes do SIGKILL
```

> `kill_timeout` é o detalhe que evita o 409 no `pm2 restart`: sem ele o PM2 manda SIGKILL depois de
> 1,6 s, o processo velho pode morrer com o poll aberto e o novo já estar perguntando ao Telegram.

Se preferir o token no ambiente, ele também pode ir no `.env` da raiz (o `carregarEnv` do `mentor.js`
já é chamado no boot e lê o arquivo inteiro): `TELEGRAM_BOT_TOKEN=123456789:AA…`.

---

## 5. Primeiro uso (5 passos)

1. `@BotFather` → `/newbot` → copie o token. **Crie um bot novo**; reaproveitar o token do bot do
   AutoTrade derruba os dois com 409.
2. Cole o token em **Config → Bot do Telegram** e salve. O estado deve virar `ligado`.
3. No Telegram, abra o seu bot e mande `/start`. A tela passa a mostrar o chat conectado.
4. Botão **Mandar mensagem de teste** — deve chegar a URL atual do túnel.
5. Ajuste o horário do lembrete (ou mande `/lembrete 07:30` no chat).

## 6. O que o bot faz

| comando | responde |
| --- | --- |
| `/link` | URL pública atual + botão para abrir o app |
| `/hoje` | vencidos + ofensiva + **uma** sugestão (exercício, treino ou lição, girando o tipo) |
| `/revisar` | quantos termos vencidos, por deck, com link para `/estudar/misto?fonte=revisao` |
| `/pratica` | um exercício não concluído, no nível certo, com link direto |
| `/treino` | continua o Treino Especial em andamento ou sugere um do seu nível |
| `/curso` | a lição onde você parou |
| `/matriz` | nível médio, % em nível ≥3, vencidos e os decks mais fortes |
| `/ofensiva` | dias de ofensiva e quantas avaliações faltam hoje |
| `/lembrete HH:MM` | muda o horário do lembrete diário |
| `/parar` | pausa os avisos automáticos (os comandos continuam) |
| `/ajuda` | o menu |

Sozinho, sem você pedir:

- **URL nova do túnel** — observa `data/tunnel-url.txt` e manda a URL nova assim que o `cloudflared`
  reinicia (e avisa quando o túnel cai). É a função mais importante do bot.
- **Lembrete diário** no horário configurado, com o resumo do dia e um botão.
- **Ofensiva em risco** a partir das 20h, se faltarem avaliações para as 10 do dia.
- **Parabéns** quando o dia fecha.
- **Deck acima de 70%** em nível ≥3 (uma vez por deck).

Tudo isso é controlado por `data/telegram.json` (o que já foi mandado hoje), com **um tick por
minuto** — nada de `setInterval` de 1 s.

## 7. Segurança

- O token fica em `data/config.json` (`chmod 600`, escrita atômica temp + rename) e o chatId em
  `data/telegram.json`. Os dois caem na regra `data/*.json` do `.gitignore` — conferido.
- `GET /api/telegram` devolve só `tokenMascarado` (`111222333:…Dsaw`). O token inteiro nunca sai da API.
- O bot **só atende o chatId conectado**. O primeiro `/start` conecta; qualquer outro chat é ignorado
  em silêncio (nem "não te conheço" ele responde — resposta é confirmação de que o bot existe).
- Para trocar de chat: `PUT /api/telegram` com `{ "chat": "__apagar__" }` e mande `/start` de novo.

## 8. Quando aparecer o 409

O estado da tela vira **`erro 409 · token em uso`** e o polling **para** (não existe retry: dois
pollings no mesmo token quebram os dois bots). A mensagem na tela é:

> Este token já está em uso por outro bot (provavelmente o do AutoTrade): o Telegram respondeu 409
> Conflict porque duas instâncias não podem fazer polling do mesmo bot. Crie um bot novo no
> @BotFather só para o Trilha RM e cole o token dele aqui.

Se você tiver certeza de que o token é exclusivo e mesmo assim deu 409, é uma instância velha do
próprio Trilha RM ainda viva: `pm2 list`, mate a duplicada e clique em **Tentar ligar de novo**.
