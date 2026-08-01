#!/usr/bin/env bash
# Setup local: MySQL da máquina + API no Docker.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"

cp -n "$ROOT/api/.env.example" "$ROOT/api/.env" 2>/dev/null || true
cp -n "$ROOT/gastos-app/.env.example" "$ROOT/gastos-app/.env" 2>/dev/null || true

echo "→ Verificando MySQL local (banco tostoes)…"
if ! mysql -u root -proot -e "USE tostoes;" 2>/dev/null; then
  echo "  Criando banco tostoes…"
  mysql -u root -proot -e "CREATE DATABASE IF NOT EXISTS tostoes CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
  if [[ -f "$ROOT/toacljpc_tostoes.sql" ]]; then
    echo "  Importando toacljpc_tostoes.sql…"
    mysql -u root -proot tostoes < "$ROOT/toacljpc_tostoes.sql"
  else
    echo "  Aviso: dump não encontrado. Rode a migração depois: docker exec gastos-api php /var/www/html/scripts/migrate.php"
  fi
fi

echo "→ Subindo API (Docker)…"
docker compose -f "$ROOT/docker-compose.yml" up -d --build

echo ""
echo "✓ API: http://localhost:8090/api"
echo "✓ MySQL local: tostoes @ localhost:3306"
echo ""
echo "Frontend:"
echo "  cd gastos-app && npm install && npm start"
echo "  App: http://localhost:4200"
