<?php

declare(strict_types=1);

namespace Gastos\Api\Services;

use Gastos\Api\MoneyHelper;
use Gastos\Api\Response;
use PDO;

final class AccountService
{
    public static function validateAccountId(
        PDO $pdo,
        int $planningId,
        int $accountId,
        ?string $type = null
    ): int {
        if ($accountId <= 0) {
            Response::error('Selecione a conta do lançamento.', 422);
        }
        $sql = 'SELECT id, type FROM financial_accounts WHERE id = ? AND planning_id = ? AND active = 1';
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$accountId, $planningId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            Response::error('Conta não encontrada.', 422);
        }
        if ($type !== null && ($row['type'] ?? '') !== $type) {
            $label = $type === 'bank' ? 'bancária' : 'de investimento';
            Response::error("Selecione uma conta {$label}.", 422);
        }

        return $accountId;
    }

    /** @return array{bankAccountId: int, investmentAccountId: int} */
    public static function validateInvestmentTransfer(
        PDO $pdo,
        int $planningId,
        int $bankAccountId,
        int $investmentAccountId
    ): array {
        $bank = self::validateAccountId($pdo, $planningId, $bankAccountId, 'bank');
        $investment = self::validateAccountId($pdo, $planningId, $investmentAccountId, 'investment');
        if ($bank === $investment) {
            Response::error('Conta de origem e destino devem ser diferentes.', 422);
        }

        return [
            'bankAccountId' => $bank,
            'investmentAccountId' => $investment,
        ];
    }

    /** @param array<string, mixed> $account */
    public static function computeBalance(PDO $pdo, array $account, ?float $eurToBrl = null): float
    {
        $planningId = (int) $account['planning_id'];
        $eurToBrl ??= MoneyHelper::getEurToBrlFallback($pdo, $planningId);
        $accountId = (int) $account['id'];
        $since = (string) $account['initial_balance_date'];
        $currency = (string) ($account['currency'] ?? 'BRL');
        $balance = (float) $account['initial_balance'];

        $stmt = $pdo->prepare(
            'SELECT kind, amount, currency, amount_brl, eur_to_brl FROM transactions
             WHERE account_id = ? AND planning_id = ? AND transaction_date >= ?
             ORDER BY transaction_date, id'
        );
        $stmt->execute([$accountId, $planningId, $since]);
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $amt = self::txAmountInAccountCurrency($row, $currency, $eurToBrl);
            $kind = $row['kind'];
            if ($kind === 'income') {
                $balance += $amt;
            } elseif (in_array($kind, ['expense', 'leisure', 'investment'], true)) {
                $balance -= $amt;
            }
        }

        return round($balance, 2);
    }

    public static function balanceToBrl(float $balance, string $currency, float $eurToBrl): float
    {
        return $currency === 'EUR' ? round($balance * $eurToBrl, 2) : round($balance, 2);
    }

    /** @param array<string, mixed> $row */
    public static function txAmountInAccountCurrency(array $row, string $accountCurrency, float $fallbackEurToBrl): float
    {
        $txCurrency = $row['currency'] ?? 'BRL';
        $rate = isset($row['eur_to_brl']) && (float) $row['eur_to_brl'] > 0
            ? (float) $row['eur_to_brl']
            : $fallbackEurToBrl;
        if ($accountCurrency === $txCurrency) {
            return (float) $row['amount'];
        }
        if ($accountCurrency === 'EUR') {
            return round((float) $row['amount_brl'] / $rate, 2);
        }

        return (float) $row['amount_brl'];
    }

    /** @return list<array<string, mixed>> */
    public static function listActive(PDO $pdo, int $planningId, ?string $type = null): array
    {
        $sql = 'SELECT * FROM financial_accounts WHERE planning_id = ? AND active = 1';
        $params = [$planningId];
        if ($type !== null && in_array($type, ['bank', 'investment'], true)) {
            $sql .= ' AND type = ?';
            $params[] = $type;
        }
        $sql .= ' ORDER BY type, sort_order, name';
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);

        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    /** @param array<string, mixed> $row */
    public static function mapAccount(
        PDO $pdo,
        array $row,
        bool $withStatement = false,
        ?int $year = null,
        ?int $month = null,
        ?string $statementKind = null,
        ?string $statementSearch = null
    ): array {
        $planningId = (int) $row['planning_id'];
        $eurToBrl = MoneyHelper::getEurToBrlFallback($pdo, $planningId);
        $currency = (string) ($row['currency'] ?? 'BRL');
        $balance = self::computeBalance($pdo, $row, $eurToBrl);
        $initialBalance = (float) $row['initial_balance'];

        $mapped = [
            'id' => (int) $row['id'],
            'name' => $row['name'],
            'type' => $row['type'],
            'currency' => $currency,
            'initialBalance' => $initialBalance,
            'initialBalanceBrl' => self::balanceToBrl($initialBalance, $currency, $eurToBrl),
            'initialBalanceDate' => $row['initial_balance_date'],
            'color' => $row['color'],
            'sortOrder' => (int) $row['sort_order'],
            'balance' => $balance,
            'balanceBrl' => self::balanceToBrl($balance, $currency, $eurToBrl),
            'eurToBrl' => $eurToBrl,
        ];
        if ($withStatement) {
            $mapped['statement'] = self::statement(
                $pdo,
                (int) $row['id'],
                $planningId,
                $year,
                $month,
                $eurToBrl,
                $statementKind,
                $statementSearch
            );
        }

        return $mapped;
    }

    /** @return list<array<string, mixed>> */
    public static function statement(
        PDO $pdo,
        int $accountId,
        int $planningId,
        ?int $year = null,
        ?int $month = null,
        ?float $eurToBrl = null,
        ?string $kindFilter = null,
        ?string $search = null
    ): array {
        $stmt = $pdo->prepare(
            'SELECT * FROM financial_accounts WHERE id = ? AND planning_id = ? AND active = 1'
        );
        $stmt->execute([$accountId, $planningId]);
        $account = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$account) {
            return [];
        }

        $eurToBrl ??= MoneyHelper::getEurToBrlFallback($pdo, $planningId);
        $currency = (string) $account['currency'];
        $since = (string) $account['initial_balance_date'];
        $running = (float) $account['initial_balance'];

        $periodStart = $since;
        if ($year !== null && $month !== null) {
            $periodStart = sprintf('%04d-%02d-01', $year, $month);
            if ($periodStart > $since) {
                $running = self::balanceAtDate($pdo, $account, $periodStart, $eurToBrl);
            }
        }
        $runningBrl = self::balanceToBrl($running, $currency, $eurToBrl);

        $sql = 'SELECT t.id, t.transaction_date, t.kind, t.description, t.amount, t.currency, t.amount_brl,
                       t.eur_to_brl, t.category, ic.name AS item_category_name
                FROM transactions t
                LEFT JOIN month_plan_entries mpe ON mpe.transaction_id = t.id
                LEFT JOIN planning_item_categories ic ON ic.id = mpe.item_category_id
                WHERE t.account_id = ? AND t.planning_id = ? AND t.transaction_date >= ?';
        $params = [$accountId, $planningId, $since];
        if ($year !== null && $month !== null) {
            $sql .= ' AND YEAR(t.transaction_date) = ? AND MONTH(t.transaction_date) = ?';
            $params[] = $year;
            $params[] = $month;
        }
        if ($kindFilter !== null && in_array($kindFilter, ['income', 'expense', 'investment', 'leisure'], true)) {
            $sql .= ' AND t.kind = ?';
            $params[] = $kindFilter;
        }
        $search = $search !== null ? trim($search) : '';
        if ($search !== '') {
            $like = '%' . $search . '%';
            $sql .= ' AND (t.description LIKE ? OR t.category LIKE ? OR ic.name LIKE ?)';
            $params[] = $like;
            $params[] = $like;
            $params[] = $like;
        }
        $sql .= ' ORDER BY t.transaction_date ASC, t.id ASC';

        $txStmt = $pdo->prepare($sql);
        $txStmt->execute($params);

        $openingLabel = ($year !== null && $month !== null && $periodStart > $since)
            ? 'Saldo anterior'
            : 'Saldo inicial';
        $openingDate = ($year !== null && $month !== null) ? $periodStart : $since;

        $lines = [[
            'date' => $openingDate,
            'kind' => 'opening',
            'description' => $openingLabel,
            'amount' => round($running, 2),
            'amountBrl' => round($runningBrl, 2),
            'signedAmount' => 0,
            'signedAmountBrl' => 0,
            'balanceAfter' => round($running, 2),
            'balanceAfterBrl' => round($runningBrl, 2),
            'currency' => $currency,
        ]];

        while ($row = $txStmt->fetch(PDO::FETCH_ASSOC)) {
            $amt = self::txAmountInAccountCurrency($row, $currency, $eurToBrl);
            $amtBrl = (float) $row['amount_brl'];
            $signed = $row['kind'] === 'income' ? $amt : -$amt;
            $signedBrl = $row['kind'] === 'income' ? $amtBrl : -$amtBrl;
            if ($row['kind'] === 'income') {
                $running += $amt;
                $runningBrl += $amtBrl;
            } else {
                $running -= $amt;
                $runningBrl -= $amtBrl;
            }
            $line = [
                'id' => (int) $row['id'],
                'date' => $row['transaction_date'],
                'kind' => $row['kind'],
                'description' => $row['description'],
                'category' => $row['item_category_name'] ?? $row['category'],
                'amount' => round($amt, 2),
                'amountBrl' => round($amtBrl, 2),
                'signedAmount' => round($signed, 2),
                'signedAmountBrl' => round($signedBrl, 2),
                'balanceAfter' => round($running, 2),
                'balanceAfterBrl' => round($runningBrl, 2),
                'currency' => $currency,
            ];
            if (($row['currency'] ?? 'BRL') === 'EUR' && isset($row['eur_to_brl']) && $row['eur_to_brl'] !== null) {
                $line['eurToBrl'] = (float) $row['eur_to_brl'];
            }
            $lines[] = $line;
        }

        return $lines;
    }

    /**
     * Saldo na véspera de $date (exclusive).
     *
     * @param array<string, mixed> $account
     */
    public static function balanceAtDate(
        PDO $pdo,
        array $account,
        string $date,
        ?float $eurToBrl = null
    ): float {
        $planningId = (int) $account['planning_id'];
        $eurToBrl ??= MoneyHelper::getEurToBrlFallback($pdo, $planningId);
        $accountId = (int) $account['id'];
        $since = (string) $account['initial_balance_date'];
        $currency = (string) ($account['currency'] ?? 'BRL');
        $balance = (float) $account['initial_balance'];

        if ($date <= $since) {
            return round($balance, 2);
        }

        $stmt = $pdo->prepare(
            'SELECT kind, amount, currency, amount_brl, eur_to_brl FROM transactions
             WHERE account_id = ? AND planning_id = ? AND transaction_date >= ? AND transaction_date < ?
             ORDER BY transaction_date, id'
        );
        $stmt->execute([$accountId, $planningId, $since, $date]);
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $amt = self::txAmountInAccountCurrency($row, $currency, $eurToBrl);
            if ($row['kind'] === 'income') {
                $balance += $amt;
            } elseif (in_array($row['kind'], ['expense', 'leisure', 'investment'], true)) {
                $balance -= $amt;
            }
        }

        return round($balance, 2);
    }
}
