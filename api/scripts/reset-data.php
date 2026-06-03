<?php

declare(strict_types=1);

/**
 * Zera dados financeiros (mantém usuários e schema).
 * Opcional: php api/scripts/reset-data.php --dump
 */

$root = dirname(__DIR__);
$doDump = in_array('--dump', $argv ?? [], true);

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

if ($doDump) {
    $dir = $root . '/database/dumps';
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }
    $file = $dir . '/backup-' . date('Y-m-d-His') . '.sql';
    echo "→ Gerando dump em $file …\n";
    $tables = [
        'transactions', 'month_plan_entries', 'recurring_item_amounts',
        'recurring_items', 'monthly_projections', 'investment_types', 'user_settings',
    ];
    $out = "-- Gastos backup " . date('c') . "\n";
    foreach ($tables as $table) {
        $rows = $pdo->query("SELECT * FROM $table")->fetchAll(PDO::FETCH_ASSOC);
        $out .= "\n-- $table (" . count($rows) . " rows)\n";
        foreach ($rows as $row) {
            $cols = implode('`, `', array_keys($row));
            $vals = implode(', ', array_map(function ($v) use ($pdo) {
                if ($v === null) {
                    return 'NULL';
                }
                return $pdo->quote((string) $v);
            }, array_values($row)));
            $out .= "INSERT INTO `$table` (`$cols`) VALUES ($vals);\n";
        }
    }
    file_put_contents($file, $out);
    echo "  dump salvo\n";
}

echo "→ Zerando lançamentos e plano mensal…\n";
$pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
$pdo->exec('DELETE FROM transactions');
$pdo->exec('DELETE FROM month_plan_entries');
$pdo->exec('DELETE FROM recurring_item_amounts');
$pdo->exec('DELETE FROM recurring_items');
$pdo->exec('DELETE FROM monthly_projections');
$pdo->exec('SET FOREIGN_KEY_CHECKS = 1');

echo "→ Zerando metas de investimento…\n";
$pdo->exec('UPDATE investment_types SET target_monthly_brl = 0 WHERE user_id = 1');

echo "→ Resetando configurações (EUR + CDI padrão)…\n";
$pdo->exec(
    'UPDATE user_settings SET eur_to_brl = 6.0000, leisure_monthly_brl = 0, montante_inicial_brl = 0, cdi_monthly_rate = 0.009500 WHERE user_id = 1'
);
$stmt = $pdo->prepare('SELECT user_id FROM user_settings WHERE user_id = 1');
$stmt->execute();
if (!$stmt->fetch()) {
    $pdo->exec(
        'INSERT INTO user_settings (user_id, eur_to_brl, leisure_monthly_brl, montante_inicial_brl, cdi_monthly_rate)
         VALUES (1, 6.0000, 0, 0, 0.009500)'
    );
}

echo "✓ Banco zerado. Usuários mantidos. Cadastre fixos quando quiser.\n";
