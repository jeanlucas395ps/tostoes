#!/usr/bin/env bash
# Exporta o MySQL local (Docker) e importa no banco do cPanel.
#
# Modos:
#   1) REMOTE_DB_HOST no .env.hosting (MySQL remoto liberado no cPanel)
#   2) SSH_HOST + SSH_USER (envia dump e importa no servidor)
#   3) Só gera o dump em deploy/out/gastos_data.sql
#
# Uso: ./scripts/sync-db-to-cpanel.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/.env.hosting}"
DUMP="$ROOT/deploy/out/gastos_data.sql"
# Dump fica ao lado do pacote public_html, não dentro de out/ (não enviar por FTP)

# Local (Docker)
LOCAL_HOST="${LOCAL_DB_HOST:-127.0.0.1}"
LOCAL_PORT="${LOCAL_DB_PORT:-3308}"
LOCAL_USER="${LOCAL_DB_USER:-root}"
LOCAL_PASS="${LOCAL_DB_PASS:-root}"
LOCAL_DB="${LOCAL_DB_NAME:-gastos}"

read_env_var() {
  local key="$1"
  local line
  line=$(grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | tail -1 | sed 's/\r$//')
  if [[ -z "$line" ]]; then
    return 1
  fi
  echo "${line#*=}" | sed -e 's/^["'\'']//' -e 's/["'\'']$//'
}

load_env() {
  if [[ ! -f "$ENV_FILE" ]]; then
    echo "Arquivo não encontrado: $ENV_FILE"
    exit 1
  fi
  REMOTE_HOST="$(read_env_var REMOTE_DB_HOST 2>/dev/null || true)"
  if [[ -z "$REMOTE_HOST" ]]; then
    REMOTE_HOST="$(read_env_var DB_HOST || echo '')"
  fi
  REMOTE_PORT="$(read_env_var REMOTE_DB_PORT 2>/dev/null || read_env_var DB_PORT 2>/dev/null || echo 3306)"
  REMOTE_USER="$(read_env_var DB_USERNAME 2>/dev/null || read_env_var DB_USER 2>/dev/null || echo '')"
  REMOTE_PASS="$(read_env_var DB_PASSWORD 2>/dev/null || read_env_var DB_PASS 2>/dev/null || echo '')"
  REMOTE_DB="$(read_env_var DB_DATABASE 2>/dev/null || read_env_var DB_NAME 2>/dev/null || echo '')"
  SSH_HOST="$(read_env_var SSH_HOST 2>/dev/null || true)"
  SSH_USER="$(read_env_var SSH_USER 2>/dev/null || true)"
  SSH_PORT="$(read_env_var SSH_PORT 2>/dev/null || echo 22)"
  SSH_REMOTE_PUBLIC_HTML="$(read_env_var SSH_REMOTE_PUBLIC_HTML 2>/dev/null || echo public_html)"
}

load_env

mkdir -p "$(dirname "$DUMP")"

echo "→ Exportando banco local ($LOCAL_DB @ $LOCAL_HOST:$LOCAL_PORT)…"
mysqldump \
  -h "$LOCAL_HOST" \
  -P "$LOCAL_PORT" \
  -u "$LOCAL_USER" \
  -p"$LOCAL_PASS" \
  --single-transaction \
  --routines \
  --triggers \
  --set-gtid-purged=OFF \
  --no-create-db \
  --add-drop-table \
  --default-character-set=utf8mb4 \
  "$LOCAL_DB" \
  > "$DUMP"

{
  echo "-- Tostoes: dump gerado em $(date -Iseconds)"
  echo "SET NAMES utf8mb4;"
  echo "SET FOREIGN_KEY_CHECKS=0;"
  echo "SET SQL_MODE='NO_AUTO_VALUE_ON_ZERO';"
} | cat - "$DUMP" > "${DUMP}.tmp" && mv "${DUMP}.tmp" "$DUMP"
echo "SET FOREIGN_KEY_CHECKS=1;" >> "$DUMP"

BYTES=$(wc -c < "$DUMP" | tr -d ' ')
echo "   Dump: $DUMP ($BYTES bytes)"

mysql_client_cmd() {
  if command -v docker >/dev/null 2>&1 && docker ps --format '{{.Names}}' 2>/dev/null | grep -qx 'gastos-mysql'; then
    echo "docker exec -i gastos-mysql mysql"
    return 0
  fi
  if command -v mysql >/dev/null 2>&1; then
    echo "mysql"
    return 0
  fi
  return 1
}

import_remote_mysql() {
  echo "→ Importando em $REMOTE_DB @ $REMOTE_HOST:$REMOTE_PORT …"
  local client
  client="$(mysql_client_cmd)" || {
    echo "mysql ou container gastos-mysql não encontrado." >&2
    return 1
  }

  if [[ "$client" == docker* ]]; then
    if ! $client \
      -h "$REMOTE_HOST" \
      -P "$REMOTE_PORT" \
      -u "$REMOTE_USER" \
      -p"$REMOTE_PASS" \
      "$REMOTE_DB" < "$DUMP"; then
      return 1
    fi
  elif ! mysql \
    -h "$REMOTE_HOST" \
    -P "$REMOTE_PORT" \
    -u "$REMOTE_USER" \
    -p"$REMOTE_PASS" \
    "$REMOTE_DB" < "$DUMP"; then
    return 1
  fi

  echo "✓ Importação remota concluída."
  return 0
}

import_via_ssh() {
  local ssh_host="${SSH_HOST:?Defina SSH_HOST em .env.hosting (ex.: servidor.alphamedia.com.br)}"
  local ssh_user="${SSH_USER:?Defina SSH_USER em .env.hosting (ex.: seu_usuario_cpanel)}"
  local ssh_port="${SSH_PORT:-22}"
  local remote_dir="${SSH_REMOTE_PUBLIC_HTML:-public_html}"
  local remote_dump="/tmp/gastos_data_$$.sql"

  echo "→ Enviando dump via SSH ($ssh_user@$ssh_host)…"
  scp -P "$ssh_port" "$DUMP" "$ssh_user@$ssh_host:$remote_dump"

  echo "→ Importando no MySQL do servidor (localhost)…"
  # MYSQL_PWD evita problemas com @ e outros caracteres na senha
  ssh -p "$ssh_port" -o StrictHostKeyChecking=accept-new "$ssh_user@$ssh_host" \
    "MYSQL_PWD=$(printf '%q' "$REMOTE_PASS") mysql -h localhost -u $(printf '%q' "$REMOTE_USER") $(printf '%q' "$REMOTE_DB") < $(printf '%q' "$remote_dump") && rm -f $(printf '%q' "$remote_dump") && echo OK"
  echo "✓ Importação via SSH concluída."
}

if [[ -n "$REMOTE_HOST" && "$REMOTE_HOST" != "localhost" && "$REMOTE_HOST" != "127.0.0.1" ]]; then
  if import_remote_mysql; then
    exit 0
  fi
  echo "⚠ Importação remota falhou." >&2
  echo "  cPanel → MySQL remoto → adicione o host: $(curl -s --max-time 5 ifconfig.me 2>/dev/null || echo 'seu IP público')" >&2
fi

if [[ -n "${SSH_HOST:-}" && -n "${SSH_USER:-}" ]]; then
  import_via_ssh
  exit 0
fi

echo ""
echo "Dump pronto. Não foi possível importar automaticamente (cPanel usa localhost só no servidor)."
echo ""
echo "Opção A — Terminal do cPanel / SSH:"
echo "  1. Envie $DUMP para o servidor (ex.: ~/gastos_data.sql)"
echo "  2. mysql -h localhost -u $REMOTE_USER -p '$REMOTE_DB' < ~/gastos_data.sql"
echo ""
echo "Opção B — PHP no servidor (após enviar API para public_html):"
echo "  cd ~/public_html && php scripts/import-database.php ~/gastos_data.sql"
echo ""
echo "Opção C — Configure em .env.hosting e rode de novo:"
echo "  SSH_HOST=usuario@servidor.alphamedia..."
echo "  SSH_USER=seu_usuario_cpanel"
echo "  ou REMOTE_DB_HOST=<hostname MySQL remoto do cPanel>"
