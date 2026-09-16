// Tunel Cloudflare (quick tunnel) para o Trilha RM.
// Sobe o cloudflared como filho, captura a URL https://*.trycloudflare.com que ele imprime
// no stderr e grava em data/tunnel-url.txt (o servidor expoe em GET /api/tunnel).
// Roda como processo PM2 proprio (trilharm-tunnel). Licoes herdadas do AutoTrade docs/51:
// - 'exit' do Node NAO roda quando o processo morre por sinal -> tratamos SIGINT/SIGTERM/SIGHUP
//   e matamos o filho com SIGKILL antes de sair (senao fica um cloudflared orfao).
// - quick tunnel gera URL nova a cada restart; por isso a URL e gravada em arquivo, nao em memoria.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const PORT = process.env.PORT || 8790;
const TARGET = process.env.TUNNEL_TARGET || `http://127.0.0.1:${PORT}`;
const BIN = process.env.CLOUDFLARED_PATH || 'cloudflared';
const DATA_DIR = path.join(__dirname, 'data');
const URL_FILE = path.join(DATA_DIR, 'tunnel-url.txt');
const URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;

fs.mkdirSync(DATA_DIR, { recursive: true });
try { fs.unlinkSync(URL_FILE); } catch {}

const log = (...a) => console.log(new Date().toISOString(), '[tunnel]', ...a);

log('subindo cloudflared ->', TARGET);
const child = spawn(BIN, ['tunnel', '--url', TARGET, '--no-autoupdate'], { stdio: ['ignore', 'pipe', 'pipe'] });

let buf = '';
let urlAtual = null;
function olhar(chunk) {
  buf = (buf + chunk.toString()).slice(-8000);
  const m = buf.match(URL_RE);
  if (m && m[0] !== urlAtual) {
    urlAtual = m[0];
    fs.writeFileSync(URL_FILE, urlAtual + '\n');
    log('URL do tunel:', urlAtual);
  }
}
child.stdout.on('data', olhar);
child.stderr.on('data', olhar);

child.on('exit', (code, sig) => {
  log('cloudflared saiu', { code, sig });
  try { fs.unlinkSync(URL_FILE); } catch {}
  // sai com erro para o PM2 reiniciar este wrapper (e nascer com URL nova)
  process.exit(1);
});
child.on('error', (err) => {
  log('erro ao iniciar cloudflared:', err.message, '- instale ou defina CLOUDFLARED_PATH');
  process.exit(1);
});

for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => {
    log('recebi', sig, '- matando cloudflared');
    try { child.kill('SIGKILL'); } catch {}
    try { fs.unlinkSync(URL_FILE); } catch {}
    process.exit(128 + (sig === 'SIGINT' ? 2 : sig === 'SIGTERM' ? 15 : 1));
  });
}
