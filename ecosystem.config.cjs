// PM2 - roda o Express servindo dist/ + /api na porta 8790.
// No celular (Termux/PRoot): npm run build && pm2 start ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: 'trilharm',
      script: 'server/index.js',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
        PORT: 8790,
      },
      watch: false,
      autorestart: true,
      max_memory_restart: '200M',
      time: true,
    },
    {
      // Tunel Cloudflare (quick tunnel) - opcional. Sobe o cloudflared como filho, grava a URL
      // em data/tunnel-url.txt e o app devolve em GET /api/tunnel. Ver tunnel.cjs.
      name: 'trilharm-tunnel',
      script: 'tunnel.cjs',
      cwd: __dirname,
      env: { PORT: 8790 },
      autorestart: true,
      restart_delay: 5000,
      max_restarts: 50,
      time: true,
    },
  ],
}
