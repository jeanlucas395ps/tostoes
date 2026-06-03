#!/bin/sh
set -e

cd /var/www/html

echo "→ Aguardando MySQL (${DB_HOST}:${DB_PORT})..."
until php -r "
  try {
    new PDO(
      'mysql:host=' . getenv('DB_HOST') . ';port=' . getenv('DB_PORT') . ';dbname=' . getenv('DB_NAME'),
      getenv('DB_USER'),
      getenv('DB_PASS')
    );
    exit(0);
  } catch (Throwable \$e) {
    exit(1);
  }
" 2>/dev/null; do
  sleep 2
done

echo "→ Executando migrações..."
php scripts/migrate.php

mkdir -p /var/www/html/storage
chown -R www-data:www-data /var/www/html/storage
chmod -R 775 /var/www/html/storage

echo "→ API pronta em :80"
exec apache2-foreground
