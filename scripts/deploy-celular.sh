#!/usr/bin/env bash
# Deploy do Trilha RM no celular (Termux/PRoot, PM2), rodado A PARTIR DO PC (Git Bash).
# Pré-requisitos no aparelho: /root/TrilhaRM clonado com acesso SSH ao GitHub, node >= 20, pm2, cloudflared.
# Uso: scripts/deploy-celular.sh            (pull + ci + build + restart)
#      scripts/deploy-celular.sh --primeira (clona e sobe o PM2 pela primeira vez)
#      scripts/deploy-celular.sh --status   (só mostra pm2 ls + URL do túnel)
set -euo pipefail

HOST="${TRILHA_SSH_HOST:-root@192.168.15.49}"
PORTA="${TRILHA_SSH_PORT:-2222}"
CHAVE="${TRILHA_SSH_KEY:-/c/Users/rafae/.ssh/id_rsa}"
DIR="${TRILHA_DIR:-/root/TrilhaRM}"
REPO="${TRILHA_REPO:-git@github.com:UPraggy/TrilhaRM.git}"

SSH=(ssh -o ConnectTimeout=15 -o BatchMode=yes -i "$CHAVE" -p "$PORTA" "$HOST")

case "${1:-}" in
  --status)
    "${SSH[@]}" "pm2 ls; echo; echo 'URL do túnel:'; cat $DIR/data/tunnel-url.txt 2>/dev/null || echo '(sem túnel ativo)'; echo; curl -s localhost:8790/api/saude"
    ;;
  --primeira)
    "${SSH[@]}" "set -e
      if [ ! -d $DIR/.git ]; then git clone $REPO $DIR; fi
      cd $DIR && npm ci --no-audit --no-fund && npm run build
      pm2 start ecosystem.config.cjs && pm2 save
      sleep 6; pm2 ls; cat data/tunnel-url.txt 2>/dev/null || echo '(túnel ainda subindo - rode --status daqui a pouco)'"
    ;;
  *)
    "${SSH[@]}" "set -e
      cd $DIR
      git pull --ff-only
      npm ci --no-audit --no-fund
      npm run build
      pm2 restart trilharm --update-env
      sleep 2; pm2 ls; curl -s localhost:8790/api/saude; echo; cat data/tunnel-url.txt 2>/dev/null || true"
    ;;
esac
