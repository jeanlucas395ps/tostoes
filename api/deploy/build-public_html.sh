#!/usr/bin/env bash
# Gera deploy/out/ — envie TODO o conteúdo de out/ para public_html no cPanel.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$(cd "$(dirname "$0")" && pwd)/out"
DENY="$ROOT/hosting/htaccess-deny-all"
ENV_SRC="${ENV_SRC:-$ROOT/.env.hosting}"

echo "→ Limpando $OUT"
rm -rf "$OUT"
mkdir -p "$OUT/storage/avatars"

echo "→ Front controller e Apache"
cp "$ROOT/hosting/public_html/index.php" "$OUT/index.php"
cp "$ROOT/hosting/public_html/.htaccess" "$OUT/.htaccess"

echo "→ Código da API"
cp -R "$ROOT/src" "$ROOT/database" "$OUT/"

echo "→ Scripts CLI (bloqueados na web)"
cp -R "$ROOT/scripts" "$OUT/"
cp "$DENY" "$OUT/scripts/.htaccess"

echo "→ Proteção de pastas sensíveis"
cp "$DENY" "$OUT/src/.htaccess"
cp "$DENY" "$OUT/database/.htaccess"
cp "$DENY" "$OUT/storage/.htaccess"

echo "→ .env de produção (servidor)"
if [[ ! -f "$ENV_SRC" ]]; then
  echo "Arquivo não encontrado: $ENV_SRC" >&2
  exit 1
fi
{
  echo "# Produção — gerado por deploy/build-public_html.sh"
  grep -E '^[A-Z_]+=' "$ENV_SRC" | grep -Ev '^(REMOTE_|SSH_|SETUP_)' \
    | sed 's/^DB_HOST=.*/DB_HOST=localhost/'
} > "$OUT/.env"

if grep -q 'JWT_SECRET=troque-por-segredo' "$OUT/.env" 2>/dev/null; then
  JWT_SECRET="$(openssl rand -hex 32)"
  sed -i '' "s/^JWT_SECRET=.*/JWT_SECRET=${JWT_SECRET}/" "$OUT/.env"
  echo "   JWT_SECRET gerado automaticamente para produção"
fi

touch "$OUT/storage/avatars/.gitkeep"

cat > "$OUT/LEIA-ME.txt" <<'EOF'
Tostoes — API (pacote public_html)

1. Envie TODO o conteúdo desta pasta para public_html no cPanel
   (api.tostoes.com.br ou subdomínio da API).

2. Permissões: storage/ e storage/avatars/ → 755 ou 775 (gravável).

3. .env já vem configurado (banco localhost no servidor).

4. Teste: https://SEU-DOMINIO-API/api/settings (401 sem login = OK).

5. scripts/ está bloqueado por .htaccess; use só se precisar de CLI no servidor.

Banco já importado? Não rode migrate de novo. Para reimportar dados,
use scripts/import-database.php via Terminal do cPanel.
EOF

echo ""
echo "Pacote pronto:"
echo "  $OUT"
echo ""
echo "FTP/cPanel: copie os arquivos DENTRO de out/ para public_html/"
echo "  (index.php, .htaccess, .env, src/, storage/, …)"
