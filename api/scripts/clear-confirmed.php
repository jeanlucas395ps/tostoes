<?php

declare(strict_types=1);

/**
 * Remove todos os lançamentos confirmados (transações) e reabre o plano do mês.
 * Mantém: usuários, fixos, contas, categorias, configurações.
 *
 * Uso: php api/scripts/clear-confirmed.php
 *      php api/scripts/clear-confirmed.php --planning-id=1
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

$planningId = null;
foreach ($argv ?? [] as $arg) {
    if (str_starts_with($arg, '--planning-id=')) {
        $planningId = (int) substr($arg, 14);
    }
}

echo "→ Limpando lançamentos confirmados…\n";

$pdo->beginTransaction();
try {
    if ($planningId !== null && $planningId > 0) {
        $tx = $pdo->prepare('DELETE FROM transactions WHERE planning_id = ?');
        $tx->execute([$planningId]);
        echo "  transações removidas: {$tx->rowCount()}\n";

        $mpe = $pdo->prepare(
            "UPDATE month_plan_entries
             SET status = 'pending',
                 transaction_id = NULL,
                 confirmed_amount_brl = NULL,
                 confirmed_amount = NULL
             WHERE planning_id = ? AND status = 'confirmed'"
        );
        $mpe->execute([$planningId]);
        echo "  itens do plano reabertos (confirmado → pendente): {$mpe->rowCount()}\n";
    } else {
        $txCount = $pdo->exec('DELETE FROM transactions');
        echo '  transações removidas: ' . ($txCount === false ? 0 : $txCount) . "\n";

        $mpe = $pdo->exec(
            "UPDATE month_plan_entries
             SET status = 'pending',
                 transaction_id = NULL,
                 confirmed_amount_brl = NULL,
                 confirmed_amount = NULL
             WHERE status = 'confirmed'"
        );
        echo "  itens do plano reabertos (confirmado → pendente): {$mpe}\n";
    }

    $pdo->commit();
} catch (Throwable $e) {
    $pdo->rollBack();
    throw $e;
}

echo "✓ Confirmados zerados. Fixos, contas e configurações mantidos.\n";
echo "  Confirme de novo em Movimentos quando for usar de verdade.\n";
