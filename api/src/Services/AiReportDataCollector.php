<?php

declare(strict_types=1);

namespace Gastos\Api\Services;

use DateTimeImmutable;
use DateTimeZone;
use Gastos\Api\Config;
use PDO;

/**
 * Monta o payload financeiro de um período (1–3 meses) para o ChatGPT.
 */
final class AiReportDataCollector
{
    private const MONTH_LABELS = [
        1 => 'Janeiro', 2 => 'Fevereiro', 3 => 'Março', 4 => 'Abril',
        5 => 'Maio', 6 => 'Junho', 7 => 'Julho', 8 => 'Agosto',
        9 => 'Setembro', 10 => 'Outubro', 11 => 'Novembro', 12 => 'Dezembro',
    ];

    /**
     * @return array{periodStart: string, periodEnd: string, months: list<array{year: int, month: int}>}
     */
    public static function parsePeriod(string $periodStart, string $periodEnd): array
    {
        if (!preg_match('/^(\d{4})-(\d{2})$/', $periodStart, $a)
            || !preg_match('/^(\d{4})-(\d{2})$/', $periodEnd, $b)
        ) {
            throw new \InvalidArgumentException('Período inválido. Use YYYY-MM.');
        }

        $startY = (int) $a[1];
        $startM = (int) $a[2];
        $endY = (int) $b[1];
        $endM = (int) $b[2];

        if ($startM < 1 || $startM > 12 || $endM < 1 || $endM > 12) {
            throw new \InvalidArgumentException('Mês inválido no período.');
        }

        $startIdx = $startY * 12 + ($startM - 1);
        $endIdx = $endY * 12 + ($endM - 1);
        if ($endIdx < $startIdx) {
            throw new \InvalidArgumentException('O período final deve ser maior ou igual ao inicial.');
        }

        $count = $endIdx - $startIdx + 1;
        if ($count < 1 || $count > 3) {
            throw new \InvalidArgumentException('Escolha de 1 a 3 meses.');
        }

        $months = [];
        for ($i = 0; $i < $count; $i++) {
            $idx = $startIdx + $i;
            $y = intdiv($idx, 12);
            $m = ($idx % 12) + 1;
            $months[] = ['year' => $y, 'month' => $m];
        }

        return [
            'periodStart' => sprintf('%04d-%02d', $startY, $startM),
            'periodEnd' => sprintf('%04d-%02d', $endY, $endM),
            'months' => $months,
        ];
    }

    /**
     * @param list<array{year: int, month: int}> $months
     * @return array<string, mixed>
     */
    public static function collect(PDO $pdo, int $planningId, array $months): array
    {
        $first = $months[0];
        $last = $months[count($months) - 1];
        $rangeStart = sprintf('%04d-%02d-01', $first['year'], $first['month']);
        $rangeEndExclusive = (new DateTimeImmutable(
            sprintf('%04d-%02d-01', $last['year'], $last['month'])
        ))->modify('+1 month')->format('Y-m-d');

        [$currentYear, $currentMonth] = self::currentYearMonth();
        $currentIdx = $currentYear * 12 + ($currentMonth - 1);

        $monthSummaries = [];
        $periodTotals = [
            'income' => 0.0,
            'expense' => 0.0,
            'investment' => 0.0,
            'goals' => 0.0,
            'leisure' => 0.0,
            'balance' => 0.0,
        ];
        $periodProjected = [
            'income' => 0.0,
            'expense' => 0.0,
            'investment' => 0.0,
            'goals' => 0.0,
            'leisure' => 0.0,
            'balance' => 0.0,
        ];
        $kinds = [];
        $projectedCache = [];

        foreach ($months as $ym) {
            $idx = $ym['year'] * 12 + ($ym['month'] - 1);
            if ($idx > $currentIdx) {
                $kind = 'forecast';
            } elseif ($idx === $currentIdx) {
                $kind = 'current';
            } else {
                $kind = 'historical';
            }
            $kinds[$kind] = true;

            $summary = self::monthCashflow($pdo, $planningId, $ym['year'], $ym['month']);
            if (!isset($projectedCache[$ym['year']])) {
                $projectedCache[$ym['year']] = ProjectionService::monthlyProjectedTotals(
                    $pdo,
                    $planningId,
                    $ym['year']
                );
            }
            $proj = $projectedCache[$ym['year']][$ym['month']] ?? ProjectionService::emptyTotals();
            $projBalance = round(
                $proj['income'] - $proj['expense'] - $proj['investment'] - $proj['goals'] - $proj['leisure'],
                2
            );

            $expensesByCategory = self::expensesByCategory(
                $pdo,
                $planningId,
                $ym['year'],
                $ym['month']
            );
            $monthSummaries[] = [
                'year' => $ym['year'],
                'month' => $ym['month'],
                'label' => self::MONTH_LABELS[$ym['month']] . '/' . $ym['year'],
                'kind' => $kind,
                'totals' => $summary,
                'projected' => [
                    'income' => round((float) $proj['income'], 2),
                    'expense' => round((float) $proj['expense'], 2),
                    'investment' => round((float) $proj['investment'], 2),
                    'goals' => round((float) $proj['goals'], 2),
                    'leisure' => round((float) $proj['leisure'], 2),
                    'balance' => $projBalance,
                ],
                'expensesByCategory' => $expensesByCategory,
            ];
            foreach (['income', 'expense', 'investment', 'goals', 'leisure'] as $k) {
                $periodTotals[$k] += $summary[$k];
                $periodProjected[$k] += (float) $proj[$k];
            }
        }
        $periodTotals['balance'] = round(
            $periodTotals['income']
            - $periodTotals['expense']
            - $periodTotals['investment']
            - $periodTotals['goals']
            - $periodTotals['leisure'],
            2
        );
        $periodProjected['balance'] = round(
            $periodProjected['income']
            - $periodProjected['expense']
            - $periodProjected['investment']
            - $periodProjected['goals']
            - $periodProjected['leisure'],
            2
        );
        foreach (['income', 'expense', 'investment', 'goals', 'leisure'] as $k) {
            $periodTotals[$k] = round($periodTotals[$k], 2);
            $periodProjected[$k] = round($periodProjected[$k], 2);
        }

        $hasForecast = isset($kinds['forecast']);
        $hasHistorical = isset($kinds['historical']) || isset($kinds['current']);
        if ($hasForecast && $hasHistorical) {
            $analysisMode = 'mixed';
        } elseif ($hasForecast) {
            $analysisMode = 'forecast';
        } else {
            $analysisMode = 'historical';
        }

        return [
            'currency' => 'BRL',
            'analysisMode' => $analysisMode,
            'referenceNow' => [
                'year' => $currentYear,
                'month' => $currentMonth,
                'label' => self::MONTH_LABELS[$currentMonth] . '/' . $currentYear,
            ],
            'period' => [
                'start' => sprintf('%04d-%02d', $first['year'], $first['month']),
                'end' => sprintf('%04d-%02d', $last['year'], $last['month']),
                'monthsCount' => count($months),
                'labels' => array_map(
                    static fn (array $m): string => self::MONTH_LABELS[$m['month']] . '/' . $m['year'],
                    $months
                ),
                'includesFutureMonths' => $hasForecast,
            ],
            'periodTotals' => $periodTotals,
            'periodProjected' => $periodProjected,
            'months' => $monthSummaries,
            'topExpenses' => self::topExpenses($pdo, $planningId, $rangeStart, $rangeEndExclusive, 25),
            'incomes' => self::incomesSummary($pdo, $planningId, $rangeStart, $rangeEndExclusive),
            'investments' => self::investmentsSummary($pdo, $planningId, $rangeStart, $rangeEndExclusive),
            'installments' => self::installmentsInPeriod($pdo, $planningId, $months),
            'goals' => self::goalsSnapshot($pdo, $planningId, $last['year'], $last['month']),
            'portfolio' => InvestmentPortfolioService::portfolio(
                $pdo,
                $planningId,
                $last['year'],
                $last['month']
            ),
        ];
    }

    /** @return array{0: int, 1: int} */
    private static function currentYearMonth(): array
    {
        $tzName = (string) Config::get('APP_TIMEZONE', 'America/Sao_Paulo');
        try {
            $tz = new DateTimeZone($tzName);
        } catch (\Throwable) {
            $tz = new DateTimeZone('America/Sao_Paulo');
        }
        $now = new DateTimeImmutable('now', $tz);

        return [(int) $now->format('Y'), (int) $now->format('n')];
    }

    /**
     * @return array{income: float, expense: float, investment: float, goals: float, leisure: float, balance: float}
     */
    private static function monthCashflow(PDO $pdo, int $planningId, int $year, int $month): array
    {
        $stmt = $pdo->prepare(
            'SELECT
                SUM(CASE WHEN t.kind = "income" THEN t.amount_brl ELSE 0 END) AS income,
                SUM(CASE WHEN t.kind = "expense" THEN t.amount_brl ELSE 0 END) AS expense,
                SUM(CASE WHEN t.kind = "investment" AND (e.financial_goal_id IS NULL) THEN t.amount_brl ELSE 0 END) AS investment,
                SUM(CASE WHEN t.kind = "leisure" THEN t.amount_brl ELSE 0 END) AS leisure
             FROM transactions t
             LEFT JOIN month_plan_entries e
               ON e.transaction_id = t.id AND e.planning_id = t.planning_id
             WHERE t.planning_id = ? AND YEAR(t.transaction_date) = ? AND MONTH(t.transaction_date) = ?'
        );
        $stmt->execute([$planningId, $year, $month]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC) ?: [];

        $goalStmt = $pdo->prepare(
            'SELECT COALESCE(SUM(t.amount_brl), 0) AS goals
             FROM transactions t
             INNER JOIN month_plan_entries e
               ON e.transaction_id = t.id AND e.planning_id = t.planning_id
             WHERE t.planning_id = ? AND YEAR(t.transaction_date) = ? AND MONTH(t.transaction_date) = ?
               AND t.kind = "investment" AND e.financial_goal_id IS NOT NULL'
        );
        $goalStmt->execute([$planningId, $year, $month]);
        $goals = (float) ($goalStmt->fetchColumn() ?: 0);

        $income = (float) ($row['income'] ?? 0);
        $expense = (float) ($row['expense'] ?? 0);
        $investment = (float) ($row['investment'] ?? 0);
        $leisure = (float) ($row['leisure'] ?? 0);

        return [
            'income' => round($income, 2),
            'expense' => round($expense, 2),
            'investment' => round($investment, 2),
            'goals' => round($goals, 2),
            'leisure' => round($leisure, 2),
            'balance' => round($income - $expense - $investment - $goals - $leisure, 2),
        ];
    }

    /** @return list<array{category: string, totalBrl: float, count: int}> */
    private static function expensesByCategory(PDO $pdo, int $planningId, int $year, int $month): array
    {
        $stmt = $pdo->prepare(
            'SELECT COALESCE(NULLIF(TRIM(t.category), ""), "Geral") AS category,
                    SUM(t.amount_brl) AS total_brl,
                    COUNT(*) AS cnt
             FROM transactions t
             WHERE t.planning_id = ? AND t.kind = "expense"
               AND YEAR(t.transaction_date) = ? AND MONTH(t.transaction_date) = ?
             GROUP BY category
             ORDER BY total_brl DESC
             LIMIT 20'
        );
        $stmt->execute([$planningId, $year, $month]);
        $out = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $out[] = [
                'category' => (string) $row['category'],
                'totalBrl' => round((float) $row['total_brl'], 2),
                'count' => (int) $row['cnt'],
            ];
        }

        return $out;
    }

    /** @return list<array<string, mixed>> */
    private static function topExpenses(
        PDO $pdo,
        int $planningId,
        string $rangeStart,
        string $rangeEndExclusive,
        int $limit
    ): array {
        $stmt = $pdo->prepare(
            'SELECT t.transaction_date, t.description, t.category, t.amount_brl, t.currency
             FROM transactions t
             WHERE t.planning_id = ? AND t.kind = "expense"
               AND t.transaction_date >= ? AND t.transaction_date < ?
             ORDER BY t.amount_brl DESC
             LIMIT ' . (int) $limit
        );
        $stmt->execute([$planningId, $rangeStart, $rangeEndExclusive]);
        $out = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $out[] = [
                'date' => $row['transaction_date'],
                'description' => $row['description'] ?? '',
                'category' => $row['category'] ?? 'Geral',
                'amountBrl' => round((float) $row['amount_brl'], 2),
                'currency' => $row['currency'] ?? 'BRL',
            ];
        }

        return $out;
    }

    /** @return list<array<string, mixed>> */
    private static function incomesSummary(
        PDO $pdo,
        int $planningId,
        string $rangeStart,
        string $rangeEndExclusive
    ): array {
        $stmt = $pdo->prepare(
            'SELECT COALESCE(NULLIF(TRIM(t.category), ""), "Geral") AS category,
                    SUM(t.amount_brl) AS total_brl,
                    COUNT(*) AS cnt
             FROM transactions t
             WHERE t.planning_id = ? AND t.kind = "income"
               AND t.transaction_date >= ? AND t.transaction_date < ?
             GROUP BY category
             ORDER BY total_brl DESC'
        );
        $stmt->execute([$planningId, $rangeStart, $rangeEndExclusive]);
        $out = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $out[] = [
                'category' => (string) $row['category'],
                'totalBrl' => round((float) $row['total_brl'], 2),
                'count' => (int) $row['cnt'],
            ];
        }

        return $out;
    }

    /** @return list<array<string, mixed>> */
    private static function investmentsSummary(
        PDO $pdo,
        int $planningId,
        string $rangeStart,
        string $rangeEndExclusive
    ): array {
        $stmt = $pdo->prepare(
            'SELECT COALESCE(it.name, "Investimento") AS name,
                    SUM(t.amount_brl) AS total_brl,
                    COUNT(*) AS cnt
             FROM transactions t
             LEFT JOIN investment_types it ON it.id = t.investment_type_id
             LEFT JOIN month_plan_entries e
               ON e.transaction_id = t.id AND e.planning_id = t.planning_id
             WHERE t.planning_id = ? AND t.kind = "investment"
               AND e.financial_goal_id IS NULL
               AND t.transaction_date >= ? AND t.transaction_date < ?
             GROUP BY name
             ORDER BY total_brl DESC'
        );
        $stmt->execute([$planningId, $rangeStart, $rangeEndExclusive]);
        $out = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $out[] = [
                'name' => (string) $row['name'],
                'totalBrl' => round((float) $row['total_brl'], 2),
                'count' => (int) $row['cnt'],
            ];
        }

        return $out;
    }

    /**
     * @param list<array{year: int, month: int}> $months
     * @return list<array<string, mixed>>
     */
    private static function installmentsInPeriod(PDO $pdo, int $planningId, array $months): array
    {
        $stmt = $pdo->prepare(
            'SELECT id, name, currency, default_amount_brl, amount_original, start_date, end_date, due_day
             FROM recurring_items
             WHERE planning_id = ? AND active = 1 AND is_installment = 1
             ORDER BY name'
        );
        $stmt->execute([$planningId]);
        $items = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $charges = [];
            foreach ($months as $ym) {
                $entryStmt = $pdo->prepare(
                    'SELECT suggested_amount_brl, status
                     FROM month_plan_entries
                     WHERE planning_id = ? AND recurring_item_id = ? AND year = ? AND month = ?
                     LIMIT 1'
                );
                $entryStmt->execute([$planningId, (int) $row['id'], $ym['year'], $ym['month']]);
                $entry = $entryStmt->fetch(PDO::FETCH_ASSOC);
                if ($entry) {
                    $charges[] = [
                        'year' => $ym['year'],
                        'month' => $ym['month'],
                        'amountBrl' => round((float) $entry['suggested_amount_brl'], 2),
                        'status' => $entry['status'],
                    ];
                }
            }
            if ($charges === []) {
                continue;
            }
            $items[] = [
                'name' => $row['name'],
                'installmentAmountBrl' => round((float) ($row['default_amount_brl'] ?? 0), 2),
                'amountOriginal' => isset($row['amount_original']) ? (float) $row['amount_original'] : null,
                'currency' => $row['currency'] ?? 'BRL',
                'startDate' => $row['start_date'],
                'endDate' => $row['end_date'],
                'chargesInPeriod' => $charges,
            ];
        }

        return $items;
    }

    /** @return list<array<string, mixed>> */
    private static function goalsSnapshot(PDO $pdo, int $planningId, int $year, int $month): array
    {
        $stmt = $pdo->prepare(
            'SELECT * FROM financial_goals
             WHERE planning_id = ? AND is_active = 1
             ORDER BY sort_order, name'
        );
        $stmt->execute([$planningId]);
        $out = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $goalId = (int) $row['id'];
            $current = GoalPlanService::currentAmountForGoal($pdo, $planningId, $row);
            $target = (float) $row['target_amount_brl'];
            $confirmed = GoalPlanService::confirmedContributions($pdo, $planningId, $goalId);
            $projected = GoalPlanService::projectedForMonth($pdo, $planningId, $goalId, $year, $month);
            $remaining = max(0, $target - $current);
            $out[] = [
                'name' => $row['name'],
                'targetAmountBrl' => round($target, 2),
                'currentAmountBrl' => round($current, 2),
                'confirmedContributionsBrl' => round($confirmed, 2),
                'remainingAmountBrl' => round($remaining, 2),
                'projectedMonthBrl' => round($projected, 2),
                'startDate' => $row['start_date'],
                'endDate' => $row['end_date'],
                'pct' => $target > 0 ? round(($current / $target) * 100, 1) : 0,
            ];
        }

        return $out;
    }
}
