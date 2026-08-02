<?php

declare(strict_types=1);

namespace Gastos\Api\Services;

use Gastos\Api\MoneyHelper;
use PDO;

final class ProjectionService
{
    /** @return array{income: float, expense: float, investment: float, goals: float, leisure: float} */
    public static function emptyTotals(): array
    {
        return [
            'income' => 0.0,
            'expense' => 0.0,
            'investment' => 0.0,
            'goals' => 0.0,
            'leisure' => 0.0,
        ];
    }

    /**
     * Aportes de metas usam kind investment no plano, mas ficam em goals (não em investment).
     *
     * @param array{income: float, expense: float, investment: float, goals: float, leisure: float} $totals
     * @param array<string, mixed> $row
     */
    public static function accumulatePlanEntry(
        array &$totals,
        PDO $pdo,
        int $planningId,
        int $year,
        int $month,
        array $row
    ): void {
        if (($row['status'] ?? '') === 'skipped') {
            return;
        }
        $brl = self::entrySuggestedBrl($pdo, $planningId, $year, $month, $row);
        $kind = $row['kind'] ?? '';
        if ($kind === 'investment' && !empty($row['financial_goal_id'])) {
            $totals['goals'] += $brl;

            return;
        }
        if (isset($totals[$kind])) {
            $totals[$kind] += $brl;
        }
    }

    /** @return array{year: int, month: int} */
    public static function currentYearMonth(): array
    {
        return ['year' => (int) date('Y'), 'month' => (int) date('n')];
    }

    /** Mês estritamente anterior ao corrente (meses passados). */
    public static function isBeforeCurrentMonth(int $year, int $month): bool
    {
        ['year' => $nowYear, 'month' => $nowMonth] = self::currentYearMonth();
        if ($year < $nowYear) {
            return true;
        }
        if ($year > $nowYear) {
            return false;
        }

        return $month < $nowMonth;
    }

    public static function isCurrentOrFutureMonth(int $year, int $month): bool
    {
        return !self::isBeforeCurrentMonth($year, $month);
    }

    /** SQL: colunas year/month referem-se à tabela principal do UPDATE/SELECT. */
    public static function sqlCurrentOrFutureMonthClause(string $yearCol = 'year', string $monthCol = 'month'): string
    {
        ['year' => $y, 'month' => $m] = self::currentYearMonth();

        return "({$yearCol} > {$y} OR ({$yearCol} = {$y} AND {$monthCol} >= {$m}))";
    }

    /**
     * Previsto histórico congelado a partir do plano do mês (não recalcula fixos atuais).
     *
     * @return array{income: float, expense: float, investment: float, goals: float, leisure: float}
     */
    public static function projectedTotalsFromPlanEntries(
        PDO $pdo,
        int $planningId,
        int $year,
        int $month
    ): array {
        $totals = self::emptyTotals();
        $stmt = $pdo->prepare(
            'SELECT kind, currency, suggested_amount, suggested_amount_brl, status, financial_goal_id
             FROM month_plan_entries
             WHERE planning_id = ? AND year = ? AND month = ?'
        );
        $stmt->execute([$planningId, $year, $month]);
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            self::accumulatePlanEntry($totals, $pdo, $planningId, $year, $month, $row);
        }

        return array_map(fn ($v) => round($v, 2), $totals);
    }

    /** Data de referência para cotação EUR do mês (hoje no mês corrente, dia 1 nos demais). */
    public static function fxReferenceDate(int $year, int $month): string
    {
        $nowYear = (int) date('Y');
        $nowMonth = (int) date('n');
        if ($year === $nowYear && $month === $nowMonth) {
            return date('Y-m-d');
        }

        return sprintf('%04d-%02d-01', $year, $month);
    }

    public static function amountInBrlForMonth(
        PDO $pdo,
        int $planningId,
        int $year,
        int $month,
        string $currency,
        float $amount,
        ?float $storedBrl = null
    ): float {
        if ($currency !== 'EUR' && $currency !== 'USD') {
            return round($storedBrl ?? $amount, 2);
        }

        $fx = $currency === 'USD'
            ? FxRateService::resolveUsdToBrl($pdo, $planningId, self::fxReferenceDate($year, $month))
            : FxRateService::resolveEurToBrl($pdo, $planningId, self::fxReferenceDate($year, $month));

        return MoneyHelper::toBrl($amount, $currency, $fx['rate']);
    }

    /**
     * @param array<string, mixed> $entry row month_plan_entries
     */
    public static function entrySuggestedBrl(
        PDO $pdo,
        int $planningId,
        int $year,
        int $month,
        array $entry
    ): float {
        $currency = $entry['currency'] ?? 'BRL';
        $amount = isset($entry['suggested_amount']) && $entry['suggested_amount'] !== null
            ? (float) $entry['suggested_amount']
            : (float) ($entry['suggested_amount_brl'] ?? 0);

        return self::amountInBrlForMonth(
            $pdo,
            $planningId,
            $year,
            $month,
            $currency,
            $amount,
            (float) ($entry['suggested_amount_brl'] ?? 0)
        );
    }

    /**
     * Previsto mensal (recebimentos, custos, investimentos, lazer) com câmbio do dia para EUR.
     *
     * @return array<int, array{income: float, expense: float, investment: float, goals: float, leisure: float}>
     */
    public static function monthlyProjectedTotals(PDO $pdo, int $planningId, int $year): array
    {
        $usage = PlanningService::usageStart($pdo, $planningId);
        $byMonth = [];
        for ($m = 1; $m <= 12; $m++) {
            $byMonth[$m] = self::emptyTotals();
            if (PlanningService::isBeforeUsageStart($year, $m, $usage['year'], $usage['month'])) {
                continue;
            }
            if (self::isBeforeCurrentMonth($year, $m)) {
                $byMonth[$m] = self::projectedTotalsFromPlanEntries($pdo, $planningId, $year, $m);
                continue;
            }

            MonthPlanService::syncAllFixedForMonth($pdo, $planningId, $year, $m);

            $stmt = $pdo->prepare(
                'SELECT kind, currency, suggested_amount, suggested_amount_brl, status, financial_goal_id
                 FROM month_plan_entries
                 WHERE planning_id = ? AND year = ? AND month = ?'
            );
            $stmt->execute([$planningId, $year, $m]);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

            if ($rows !== []) {
                foreach ($rows as $row) {
                    self::accumulatePlanEntry($byMonth[$m], $pdo, $planningId, $year, $m, $row);
                }
                continue;
            }

            $byMonth[$m] = self::monthlyTotalsFromRecurring($pdo, $planningId, $year)[$m];
        }

        foreach ($byMonth as $m => &$totals) {
            if (PlanningService::isBeforeUsageStart($year, $m, $usage['year'], $usage['month'])) {
                continue;
            }
            // Dashboard: investimentos = valor mensal dos fixos (não acumula nem ramp de metas).
            $recurring = self::recurringTotalsForMonth($pdo, $planningId, $year, $m);
            $totals['investment'] = $recurring['investment'];
            $totals['goals'] = self::flatGoalsTotalForMonth($pdo, $planningId, $year, $m);
            $totals = array_map(fn ($v) => round($v, 2), $totals);
        }
        unset($totals);

        return $byMonth;
    }

    /**
     * Totais de metas no previsto do dashboard: parcela uniforme (não cresce mês a mês).
     */
    public static function flatGoalsTotalForMonth(
        PDO $pdo,
        int $planningId,
        int $year,
        int $month
    ): float {
        $stmt = $pdo->prepare(
            'SELECT * FROM financial_goals WHERE planning_id = ? AND is_active = 1'
        );
        $stmt->execute([$planningId]);
        $total = 0.0;
        $ym = sprintf('%04d-%02d', $year, $month);
        ['year' => $refYear, 'month' => $refMonth] = self::currentYearMonth();

        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $goal) {
            $start = (string) ($goal['start_date'] ?? '');
            $end = (string) ($goal['end_date'] ?? '');
            if ($start === '' || $end === '') {
                continue;
            }
            $startYm = substr($start, 0, 7);
            $endYm = substr($end, 0, 7);
            if ($ym < $startYm || $ym > $endYm) {
                continue;
            }
            $total += GoalPlanService::uniformMonthlyInstallment(
                $pdo,
                $planningId,
                $goal,
                $refYear,
                $refMonth
            );
        }

        return round($total, 2);
    }

    /**
     * Totais de fixos ativos para um mês (sem pular meses passados).
     *
     * @return array{income: float, expense: float, investment: float, goals: float, leisure: float}
     */
    public static function recurringTotalsForMonth(
        PDO $pdo,
        int $planningId,
        int $year,
        int $month
    ): array {
        $totals = self::emptyTotals();

        $stmt = $pdo->prepare(
            'SELECT id, kind, currency, amount_original, default_amount_brl,
                    is_installment, start_date, end_date
             FROM recurring_items
             WHERE planning_id = ? AND active = 1 AND is_fixed = 1'
        );
        $stmt->execute([$planningId]);
        $items = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $amtStmt = $pdo->prepare(
            'SELECT amount_brl FROM recurring_item_amounts WHERE recurring_item_id = ? AND month = ?'
        );

        foreach ($items as $item) {
            if (!MonthPlanService::recurringAppliesToMonth($item, $year, $month)) {
                continue;
            }
            $kind = $item['kind'];
            if (!isset($totals[$kind])) {
                continue;
            }
            $currency = $item['currency'] ?? 'BRL';
            $original = $item['amount_original'] !== null
                ? (float) $item['amount_original']
                : (float) $item['default_amount_brl'];

            $amtStmt->execute([(int) $item['id'], $month]);
            $override = $amtStmt->fetchColumn();
            if ($override !== false) {
                $amount = (float) $override;
                if ($currency === 'EUR' || $currency === 'USD') {
                    $totals[$kind] += self::amountInBrlForMonth(
                        $pdo,
                        $planningId,
                        $year,
                        $month,
                        $currency,
                        $original,
                        $amount
                    );
                } else {
                    $totals[$kind] += $amount;
                }
            } else {
                $totals[$kind] += self::amountInBrlForMonth(
                    $pdo,
                    $planningId,
                    $year,
                    $month,
                    $currency,
                    $original,
                    (float) $item['default_amount_brl']
                );
            }
        }

        return array_map(fn ($v) => round($v, 2), $totals);
    }

    /**
     * @return array<int, array{income: float, expense: float, investment: float, goals: float, leisure: float}>
     */
    public static function monthlyTotalsFromRecurring(PDO $pdo, int $planningId, int $year): array
    {
        $byMonth = [];
        for ($m = 1; $m <= 12; $m++) {
            $byMonth[$m] = self::emptyTotals();
        }

        $stmt = $pdo->prepare(
            'SELECT id, kind, currency, amount_original, default_amount_brl,
                    is_installment, start_date, end_date
             FROM recurring_items
             WHERE planning_id = ? AND active = 1 AND is_fixed = 1'
        );
        $stmt->execute([$planningId]);
        $items = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $amtStmt = $pdo->prepare(
            'SELECT month, amount_brl FROM recurring_item_amounts WHERE recurring_item_id = ?'
        );

        foreach ($items as $item) {
            $currency = $item['currency'] ?? 'BRL';
            $original = $item['amount_original'] !== null
                ? (float) $item['amount_original']
                : (float) $item['default_amount_brl'];
            $kind = $item['kind'];
            if (!isset($byMonth[1][$kind])) {
                continue;
            }

            $amtStmt->execute([(int) $item['id']]);
            $amounts = [];
            while ($row = $amtStmt->fetch(PDO::FETCH_ASSOC)) {
                $amounts[(int) $row['month']] = (float) $row['amount_brl'];
            }

            for ($m = 1; $m <= 12; $m++) {
                if (self::isBeforeCurrentMonth($year, $m)) {
                    continue;
                }
                if (!MonthPlanService::recurringAppliesToMonth($item, $year, $m)) {
                    continue;
                }
                if (isset($amounts[$m])) {
                    if ($currency === 'EUR' || $currency === 'USD') {
                        $byMonth[$m][$kind] += self::amountInBrlForMonth(
                            $pdo,
                            $planningId,
                            $year,
                            $m,
                            $currency,
                            $original,
                            $amounts[$m]
                        );
                    } else {
                        $byMonth[$m][$kind] += $amounts[$m];
                    }
                } else {
                    $byMonth[$m][$kind] += self::amountInBrlForMonth(
                        $pdo,
                        $planningId,
                        $year,
                        $m,
                        $currency,
                        $original,
                        (float) $item['default_amount_brl']
                    );
                }
            }
        }

        return $byMonth;
    }
}
