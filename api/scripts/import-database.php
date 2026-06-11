<?php

declare(strict_types=1);

/**
 * Importa um dump .sql no banco configurado em .env.
 *
 * Uso:
 *   php scripts/import-database.php /caminho/para/gastos_data.sql
 */

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "Execute apenas via CLI.\n");
    exit(1);
}

$dumpPath = $argv[1] ?? '';
if ($dumpPath === '' || !is_file($dumpPath)) {
    fwrite(STDERR, "Uso: php scripts/import-database.php /caminho/gastos_data.sql\n");
    exit(1);
}

$root = dirname(__DIR__);

spl_autoload_register(function (string $class) use ($root): void {
    $prefix = 'Gastos\\Api\\';
    if (!str_starts_with($class, $prefix)) {
        return;
    }
    $relative = str_replace('\\', '/', substr($class, strlen($prefix)));
    $file = $root . '/src/' . $relative . '.php';
    if (is_file($file)) {
        require $file;
    }
});

use Gastos\Api\Config;
use Gastos\Api\Database;

Config::load($root);
$pdo = Database::connection();

echo "→ Importando: {$dumpPath}\n";
echo '→ Banco: ' . Config::get('DB_NAME') . ' @ ' . Config::get('DB_HOST') . "\n";

$host = Config::get('DB_HOST');
$port = Config::get('DB_PORT', '3306');
$user = Config::get('DB_USER');
$pass = Config::get('DB_PASS');
$db = Config::get('DB_NAME');

$mysqlBin = trim((string) shell_exec('command -v mysql 2>/dev/null'));
if ($mysqlBin !== '') {
    $cmd = sprintf(
        '%s -h %s -P %s -u %s -p%s %s < %s 2>&1',
        escapeshellarg($mysqlBin),
        escapeshellarg($host),
        escapeshellarg($port),
        escapeshellarg($user),
        escapeshellarg($pass),
        escapeshellarg($db),
        escapeshellarg($dumpPath)
    );
    passthru($cmd, $exitCode);
    if ($exitCode === 0) {
        echo "✓ Importação via mysql CLI concluída.\n";
        exit(0);
    }
    fwrite(STDERR, "mysql CLI falhou (código {$exitCode}), tentando PDO…\n");
}

$sql = file_get_contents($dumpPath);
if ($sql === false) {
    fwrite(STDERR, "Não foi possível ler o arquivo.\n");
    exit(1);
}

$pdo->exec('SET FOREIGN_KEY_CHECKS=0');
$pdo->exec('SET NAMES utf8mb4');

$statements = preg_split('/;\s*\n/', $sql) ?: [];
$executed = 0;
foreach ($statements as $stmt) {
    $stmt = trim($stmt);
    if ($stmt === '' || str_starts_with($stmt, '--')) {
        continue;
    }
    try {
        $pdo->exec($stmt);
        $executed++;
    } catch (Throwable $e) {
        fwrite(STDERR, 'Erro: ' . $e->getMessage() . "\n");
        fwrite(STDERR, substr($stmt, 0, 240) . "…\n");
        exit(1);
    }
}

$pdo->exec('SET FOREIGN_KEY_CHECKS=1');
echo "✓ Concluído ({$executed} statements via PDO).\n";
