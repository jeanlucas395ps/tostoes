<?php

declare(strict_types=1);

/**
 * Zera dados de meses anteriores ao início operacional.
 * Ex.: php api/scripts/clear-months-before.php --year=2026 --start-month=6
 */

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

$year = 2026;
$startMonth = 6;
$householdId = 1;

foreach ($argv ?? [] as $arg) {
    if (str_starts_with($arg, '--year=')) {
        $year = (int) substr($arg, 7);
    }
    if (str_starts_with($arg, '--start-month=')) {
        $startMonth = (int) substr($arg, 14);
    }
}

if ($startMonth < 2 || $startMonth > 12) {
    fwrite(STDERR, "start-month deve ser entre 2 e 12.\n");
    exit(1);
}

$clearMonths = range(1, $startMonth - 1);
$monthList = implode(',', $clearMonths);

echo "→ Zerando meses {$monthList}/{$year} (início em " . monthLabel($startMonth) . ")\n";

$stmt = $pdo->prepare(
    "DELETE FROM transactions
     WHERE user_id = ? AND YEAR(transaction_date) = ? AND MONTH(transaction_date) IN ($monthList)"
);
$stmt->execute([$householdId, $year]);
echo "  transações removidas: {$stmt->rowCount()}\n";

$stmt = $pdo->prepare(
    "DELETE FROM month_plan_entries
     WHERE user_id = ? AND year = ? AND month IN ($monthList)"
);
$stmt->execute([$householdId, $year]);
echo "  entradas do plano removidas: {$stmt->rowCount()}\n";

$stmt = $pdo->prepare(
    "DELETE FROM monthly_projections
     WHERE user_id = ? AND year = ? AND month IN ($monthList)"
);
$stmt->execute([$householdId, $year]);
echo "  projeções manuais removidas: {$stmt->rowCount()}\n";

$recurringIds = $pdo->query(
    "SELECT id FROM recurring_items WHERE user_id = $householdId AND active = 1"
)->fetchAll(PDO::FETCH_COLUMN);

$upsert = $pdo->prepare(
    'INSERT INTO recurring_item_amounts (recurring_item_id, month, amount_brl)
     VALUES (?, ?, 0)
     ON DUPLICATE KEY UPDATE amount_brl = 0'
);

$zeroed = 0;
foreach ($recurringIds as $recurringId) {
    foreach ($clearMonths as $month) {
        $upsert->execute([(int) $recurringId, $month]);
        $zeroed++;
    }
}
echo "  valores fixos zerados (itens × meses): {$zeroed}\n";

echo "✓ Sistema operacional a partir de " . monthLabel($startMonth) . "/{$year}.\n";

function monthLabel(int $month): string
{
    static $labels = [
        1 => 'Janeiro', 2 => 'Fevereiro', 3 => 'Março', 4 => 'Abril',
        5 => 'Maio', 6 => 'Junho', 7 => 'Julho', 8 => 'Agosto',
        9 => 'Setembro', 10 => 'Outubro', 11 => 'Novembro', 12 => 'Dezembro',
    ];
    return $labels[$month] ?? (string) $month;
}
