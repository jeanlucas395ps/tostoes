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
            $labels = [
                'bank' => 'bancária',
                'investment' => 'de investimento',
                'credit' => 'de cartão de crédito',
            ];
            $label = $labels[$type] ?? $type;
            Response::error("Selecione uma conta {$label}.", 422);
        }

        return $accountId;
    }

    /** Conta de pagamento de gasto: banco ou cartão. */
    public static function validatePaymentSourceAccountId(
        PDO $pdo,
        int $planningId,
        int $accountId
    ): int {
        if ($accountId <= 0) {
            Response::error('Selecione a conta do lançamento.', 422);
        }
        $stmt = $pdo->prepare(
            'SELECT id, type FROM financial_accounts WHERE id = ? AND planning_id = ? AND active = 1'
        );
        $stmt->execute([$accountId, $planningId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            Response::error('Conta não encontrada.', 422);
        }
        if (!in_array($row['type'] ?? '', ['bank', 'credit'], true)) {
            Response::error('Selecione uma conta bancária ou cartão de crédito.', 422);
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

    /** @return array{sourceAccountId: int, targetAccountId: int} */
    public static function validateAccountTransfer(
        PDO $pdo,
        int $planningId,
        int $sourceAccountId,
        int $targetAccountId
    ): array {
        $source = self::validateAccountId($pdo, $planningId, $sourceAccountId);
        $target = self::validateAccountId($pdo, $planningId, $targetAccountId);
        if ($source === $target) {
            Response::error('Conta de saída e entrada devem ser diferentes.', 422);
        }

        return [
            'sourceAccountId' => $source,
            'targetAccountId' => $target,
        ];
    }

    /** Transferência: entrada se notes tem "←", senão saída. */
    public static function isTransferInflow(array $row): bool
    {
        return ($row['kind'] ?? '') === 'transfer'
            && str_contains((string) ($row['notes'] ?? ''), 'Transferência ←');
    }

    /**
     * Aplica lançamento ao saldo (conta bancária/investimento ou dívida do cartão).
     *
     * @param array<string, mixed> $row
     */
    public static function applyTxToBalance(
        float $balance,
        array $row,
        float $amt,
        bool $isCredit = false
    ): float {
        $kind = $row['kind'] ?? '';
        $isIn = $kind === 'income' || self::isTransferInflow($row);
        $isOut = in_array($kind, ['expense', 'leisure', 'investment', 'transfer'], true) && !$isIn;

        if ($isCredit) {
            // Saldo do cartão = dívida (uso do limite): compra sobe, pagamento desce
            if ($isOut) {
                return $balance + $amt;
            }
            if ($isIn) {
                return $balance - $amt;
            }

            return $balance;
        }

        if ($isIn) {
            return $balance + $amt;
        }
        if ($isOut) {
            return $balance - $amt;
        }

        return $balance;
    }

    /** @param array<string, mixed> $account */
    public static function computeBalance(PDO $pdo, array $account, ?float $eurToBrl = null): float
    {
        $planningId = (int) $account['planning_id'];
        $currency = (string) ($account['currency'] ?? 'BRL');
        $eurToBrl ??= MoneyHelper::getFxFallback($pdo, $planningId, $currency === 'BRL' ? 'EUR' : $currency);
        $accountId = (int) $account['id'];
        $since = (string) $account['initial_balance_date'];
        $balance = (float) $account['initial_balance'];
        $isCredit = ($account['type'] ?? '') === 'credit';

        $stmt = $pdo->prepare(
            'SELECT kind, amount, currency, amount_brl, eur_to_brl, notes FROM transactions
             WHERE account_id = ? AND planning_id = ? AND transaction_date >= ?
             ORDER BY transaction_date, id'
        );
        $stmt->execute([$accountId, $planningId, $since]);
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $amt = self::txAmountInAccountCurrency($row, $currency, $eurToBrl);
            $balance = self::applyTxToBalance($balance, $row, $amt, $isCredit);
        }

        return round($balance, 2);
    }

    public static function balanceToBrl(float $balance, string $currency, float $rateToBrl): float
    {
        if ($currency === 'EUR' || $currency === 'USD') {
            return round($balance * $rateToBrl, 2);
        }

        return round($balance, 2);
    }

    /** @param array<string, mixed> $row */
    public static function txAmountInAccountCurrency(array $row, string $accountCurrency, float $fallbackRateToBrl): float
    {
        $txCurrency = $row['currency'] ?? 'BRL';
        $rate = isset($row['eur_to_brl']) && (float) $row['eur_to_brl'] > 0
            ? (float) $row['eur_to_brl']
            : $fallbackRateToBrl;
        if ($accountCurrency === $txCurrency) {
            return (float) $row['amount'];
        }
        if ($accountCurrency === 'EUR' || $accountCurrency === 'USD') {
            return $rate > 0 ? round((float) $row['amount_brl'] / $rate, 2) : 0.0;
        }

        return (float) $row['amount_brl'];
    }

    /** @return list<array<string, mixed>> */
    public static function listActive(PDO $pdo, int $planningId, ?string $type = null): array
    {
        $sql = 'SELECT * FROM financial_accounts WHERE planning_id = ? AND active = 1';
        $params = [$planningId];
        if ($type !== null && in_array($type, ['bank', 'investment', 'credit'], true)) {
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
        $currency = (string) ($row['currency'] ?? 'BRL');
        $fxRate = MoneyHelper::getFxFallback($pdo, $planningId, $currency === 'BRL' ? 'EUR' : $currency);
        $eurToBrl = MoneyHelper::getEurToBrlFallback($pdo, $planningId);
        $usdToBrl = MoneyHelper::getUsdToBrlFallback($pdo, $planningId);
        $balance = self::computeBalance($pdo, $row, $fxRate);
        $initialBalance = (float) $row['initial_balance'];
        $isCredit = ($row['type'] ?? '') === 'credit';
        $creditLimit = isset($row['credit_limit']) && $row['credit_limit'] !== null
            ? (float) $row['credit_limit'] : null;
        $futureInstallments = $isCredit
            ? self::futureInstallmentsCommitted(
                $pdo,
                $planningId,
                (int) $row['id'],
                $currency,
                $fxRate
            )
            : 0.0;
        // Limite usado = dívida atual + parcelas futuras ainda não lançadas no cartão
        $used = $isCredit ? max(0.0, round($balance + $futureInstallments, 2)) : null;
        $available = ($isCredit && $creditLimit !== null)
            ? round($creditLimit - $used, 2) : null;

        $mapped = [
            'id' => (int) $row['id'],
            'name' => $row['name'],
            'type' => $row['type'],
            'currency' => $currency,
            'initialBalance' => $initialBalance,
            'initialBalanceBrl' => self::balanceToBrl($initialBalance, $currency, $fxRate),
            'initialBalanceDate' => $row['initial_balance_date'],
            'creditLimit' => $creditLimit,
            'creditLimitBrl' => $creditLimit !== null
                ? self::balanceToBrl($creditLimit, $currency, $fxRate) : null,
            'closingDay' => isset($row['closing_day']) && $row['closing_day'] !== null
                ? (int) $row['closing_day'] : null,
            'dueDay' => isset($row['due_day']) && $row['due_day'] !== null
                ? (int) $row['due_day'] : null,
            'color' => $row['color'],
            'sortOrder' => (int) $row['sort_order'],
            'balance' => $balance,
            'balanceBrl' => self::balanceToBrl($balance, $currency, $fxRate),
            'usedLimit' => $used,
            'usedLimitBrl' => $used !== null
                ? self::balanceToBrl($used, $currency, $fxRate) : null,
            'futureInstallments' => $isCredit ? $futureInstallments : null,
            'futureInstallmentsBrl' => $isCredit
                ? self::balanceToBrl($futureInstallments, $currency, $fxRate) : null,
            'availableLimit' => $available,
            'availableLimitBrl' => $available !== null
                ? self::balanceToBrl($available, $currency, $fxRate) : null,
            'limitUsagePercent' => ($isCredit && $creditLimit !== null && $creditLimit > 0)
                ? round(min(100, max(0, ($used / $creditLimit) * 100)), 1) : null,
            'eurToBrl' => $eurToBrl,
            'usdToBrl' => $usdToBrl,
        ];

        if ($isCredit) {
            $nowY = (int) date('Y');
            $nowM = (int) date('n');
            $mapped['monthForecast'] = self::creditMonthForecast(
                $pdo,
                $planningId,
                (int) $row['id'],
                $nowY,
                $nowM,
                $fxRate
            );
        }

        if ($withStatement) {
            $mapped['statement'] = self::statement(
                $pdo,
                (int) $row['id'],
                $planningId,
                $year,
                $month,
                $fxRate,
                $statementKind,
                $statementSearch
            );
            if ($isCredit && $year !== null && $month !== null) {
                $mapped['monthForecast'] = self::creditMonthForecast(
                    $pdo,
                    $planningId,
                    (int) $row['id'],
                    $year,
                    $month,
                    $eurToBrl
                );
            }
        }

        return $mapped;
    }

    /**
     * Soma das parcelas futuras (mês corrente → fim) ainda não confirmadas neste cartão.
     * Parcelas já confirmadas entram na dívida via transactions e não são somadas de novo.
     */
    public static function futureInstallmentsCommitted(
        PDO $pdo,
        int $planningId,
        int $accountId,
        string $accountCurrency,
        float $eurToBrl
    ): float {
        $stmt = $pdo->prepare(
            "SELECT id, currency, amount_original, default_amount_brl, start_date, end_date
             FROM recurring_items
             WHERE planning_id = ?
               AND active = 1
               AND is_installment = 1
               AND source_financial_account_id = ?
               AND kind IN ('expense', 'leisure')"
        );
        $stmt->execute([$planningId, $accountId]);
        $items = $stmt->fetchAll(PDO::FETCH_ASSOC);
        if ($items === []) {
            return 0.0;
        }

        $nowY = (int) date('Y');
        $nowM = (int) date('n');
        $confirmedStmt = $pdo->prepare(
            "SELECT 1 FROM month_plan_entries
             WHERE planning_id = ? AND recurring_item_id = ? AND year = ? AND month = ?
               AND status = 'confirmed'
             LIMIT 1"
        );
        $amountStmt = $pdo->prepare(
            'SELECT amount_brl FROM recurring_item_amounts
             WHERE recurring_item_id = ? AND month = ?'
        );

        $total = 0.0;
        foreach ($items as $item) {
            $itemId = (int) $item['id'];
            $start = (string) ($item['start_date'] ?? '');
            $end = (string) ($item['end_date'] ?? '');
            if ($start === '' || $end === '') {
                continue;
            }

            $startYm = substr($start, 0, 7);
            $endYm = substr($end, 0, 7);
            $fromYm = sprintf('%04d-%02d', $nowY, $nowM);
            if ($fromYm < $startYm) {
                $fromYm = $startYm;
            }
            if ($fromYm > $endYm) {
                continue;
            }

            $y = (int) substr($fromYm, 0, 4);
            $m = (int) substr($fromYm, 5, 2);
            $endY = (int) substr($endYm, 0, 4);
            $endM = (int) substr($endYm, 5, 2);

            while ($y < $endY || ($y === $endY && $m <= $endM)) {
                $confirmedStmt->execute([$planningId, $itemId, $y, $m]);
                if ($confirmedStmt->fetchColumn() !== false) {
                    $m++;
                    if ($m > 12) {
                        $m = 1;
                        $y++;
                    }
                    continue;
                }

                $amountStmt->execute([$itemId, $m]);
                $override = $amountStmt->fetchColumn();
                if ($override !== false && $override !== null) {
                    $brl = (float) $override;
                } else {
                    $brl = (float) ($item['default_amount_brl'] ?? 0);
                }

                if ($accountCurrency === 'EUR' || $accountCurrency === 'USD') {
                    if (($item['currency'] ?? '') === $accountCurrency && $item['amount_original'] !== null) {
                        $total += (float) $item['amount_original'];
                    } else {
                        $total += $eurToBrl > 0 ? round($brl / $eurToBrl, 2) : 0.0;
                    }
                } else {
                    $total += $brl;
                }

                $m++;
                if ($m > 12) {
                    $m = 1;
                    $y++;
                }
            }
        }

        return round($total, 2);
    }

    /**
     * Previsão do mês no cartão: pendentes + confirmados debitados na conta.
     *
     * @return array{pendingBrl: float, confirmedBrl: float, totalBrl: float}
     */
    public static function creditMonthForecast(
        PDO $pdo,
        int $planningId,
        int $accountId,
        int $year,
        int $month,
        ?float $eurToBrl = null
    ): array {
        $eurToBrl ??= MoneyHelper::getEurToBrlFallback($pdo, $planningId);

        if (!ProjectionService::isBeforeCurrentMonth($year, $month)) {
            MonthPlanService::syncAllFixedForMonth($pdo, $planningId, $year, $month);
        }

        $pending = 0.0;
        $stmt = $pdo->prepare(
            "SELECT e.currency, e.suggested_amount, e.suggested_amount_brl
             FROM month_plan_entries e
             WHERE e.planning_id = ? AND e.year = ? AND e.month = ?
               AND e.status = 'pending'
               AND e.kind IN ('expense', 'leisure')
               AND e.source_financial_account_id = ?"
        );
        $stmt->execute([$planningId, $year, $month, $accountId]);
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $pending += ProjectionService::entrySuggestedBrl($pdo, $planningId, $year, $month, [
                'currency' => $row['currency'] ?? 'BRL',
                'suggested_amount' => $row['suggested_amount'] ?? $row['suggested_amount_brl'],
                'suggested_amount_brl' => $row['suggested_amount_brl'],
            ]);
        }

        $confirmed = 0.0;
        $cStmt = $pdo->prepare(
            "SELECT amount_brl FROM transactions
             WHERE planning_id = ? AND account_id = ?
               AND YEAR(transaction_date) = ? AND MONTH(transaction_date) = ?
               AND kind IN ('expense', 'leisure')"
        );
        $cStmt->execute([$planningId, $accountId, $year, $month]);
        while ($amt = $cStmt->fetchColumn()) {
            $confirmed += (float) $amt;
        }

        return [
            'pendingBrl' => round($pending, 2),
            'confirmedBrl' => round($confirmed, 2),
            'totalBrl' => round($pending + $confirmed, 2),
        ];
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

        $currency = (string) $account['currency'];
        $eurToBrl ??= MoneyHelper::getFxFallback($pdo, $planningId, $currency === 'BRL' ? 'EUR' : $currency);
        $since = (string) $account['initial_balance_date'];
        $running = (float) $account['initial_balance'];
        $isCredit = ($account['type'] ?? '') === 'credit';

        $periodStart = $since;
        if ($year !== null && $month !== null) {
            $periodStart = sprintf('%04d-%02d-01', $year, $month);
            if ($periodStart > $since) {
                $running = self::balanceAtDate($pdo, $account, $periodStart, $eurToBrl);
            }
        }
        $runningBrl = self::balanceToBrl($running, $currency, $eurToBrl);

        $sql = 'SELECT t.id, t.transaction_date, t.kind, t.description, t.amount, t.currency, t.amount_brl,
                       t.eur_to_brl, t.category, t.notes, ic.name AS item_category_name
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
        if ($kindFilter !== null && in_array($kindFilter, ['income', 'expense', 'investment', 'leisure', 'transfer'], true)) {
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
            ? ($isCredit ? 'Fatura / uso anterior' : 'Saldo anterior')
            : ($isCredit ? 'Dívida inicial' : 'Saldo inicial');
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
            $isIn = ($row['kind'] === 'income') || self::isTransferInflow($row);
            // No cartão: compra (+dívida), pagamento (−dívida)
            if ($isCredit) {
                $signed = $isIn ? -$amt : $amt;
                $signedBrl = $isIn ? -$amtBrl : $amtBrl;
                if ($isIn) {
                    $running -= $amt;
                    $runningBrl -= $amtBrl;
                } else {
                    $running += $amt;
                    $runningBrl += $amtBrl;
                }
            } else {
                $signed = $isIn ? $amt : -$amt;
                $signedBrl = $isIn ? $amtBrl : -$amtBrl;
                if ($isIn) {
                    $running += $amt;
                    $runningBrl += $amtBrl;
                } else {
                    $running -= $amt;
                    $runningBrl -= $amtBrl;
                }
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
            if (($row['currency'] ?? 'BRL') === 'USD' && isset($row['eur_to_brl']) && $row['eur_to_brl'] !== null) {
                $line['usdToBrl'] = (float) $row['eur_to_brl'];
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
        $currency = (string) ($account['currency'] ?? 'BRL');
        $eurToBrl ??= MoneyHelper::getFxFallback($pdo, $planningId, $currency === 'BRL' ? 'EUR' : $currency);
        $accountId = (int) $account['id'];
        $since = (string) $account['initial_balance_date'];
        $balance = (float) $account['initial_balance'];
        $isCredit = ($account['type'] ?? '') === 'credit';

        if ($date <= $since) {
            return round($balance, 2);
        }

        $stmt = $pdo->prepare(
            'SELECT kind, amount, currency, amount_brl, eur_to_brl, notes FROM transactions
             WHERE account_id = ? AND planning_id = ? AND transaction_date >= ? AND transaction_date < ?
             ORDER BY transaction_date, id'
        );
        $stmt->execute([$accountId, $planningId, $since, $date]);
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $amt = self::txAmountInAccountCurrency($row, $currency, $eurToBrl);
            $balance = self::applyTxToBalance($balance, $row, $amt, $isCredit);
        }

        return round($balance, 2);
    }
}
