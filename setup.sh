#!/usr/bin/env bash
# Primeira configuração local — copia .env.example e sobe Docker.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"

cp -n "$ROOT/api/.env.example" "$ROOT/api/.env" 2>/dev/null || true
cp -n "$ROOT/gastos-app/.env.example" "$ROOT/gastos-app/.env" 2>/dev/null || true

echo "→ Subindo MySQL + API (Docker)…"
docker compose -f "$ROOT/docker-compose.yml" up -d --build

echo ""
echo "✓ API: http://localhost:8090/api"
echo "✓ Login: admin / admin"
echo ""
echo "Frontend:"
echo "  cd gastos-app && npm install && npm start"
echo "  App: http://localhost:4200"
