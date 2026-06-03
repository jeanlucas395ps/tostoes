<?php

declare(strict_types=1);

namespace Gastos\Api\Controllers;

use Gastos\Api\Auth;
use Gastos\Api\Database;
use Gastos\Api\Response;
use Gastos\Api\Services\PlanningService;
use Gastos\Api\Services\ProjectionService;
use PDO;

final class DashboardController
{
    public static function summary(): void
    {
        Auth::requireUser();
        $planningId = Auth::requirePlanningId();
        $year = isset($_GET['year']) ? (int) $_GET['year'] : (int) date('Y');

        $pdo = Database::connection();
        $usage = PlanningService::usageStart($pdo, $planningId);

        // Totais reais por mês (investimentos sem aportes de metas)
        $stmt = $pdo->prepare(
            'SELECT MONTH(t.transaction_date) AS m,
                    SUM(CASE WHEN t.kind = "income" THEN t.amount_brl ELSE 0 END) AS income,
                    SUM(CASE WHEN t.kind = "expense" THEN t.amount_brl ELSE 0 END) AS expense,
                    SUM(CASE WHEN t.kind = "investment" AND (e.financial_goal_id IS NULL) THEN t.amount_brl ELSE 0 END) AS investment,
                    SUM(CASE WHEN t.kind = "leisure" THEN t.amount_brl ELSE 0 END) AS leisure
             FROM transactions t
             LEFT JOIN month_plan_entries e
               ON e.transaction_id = t.id AND e.planning_id = t.planning_id
             WHERE t.planning_id = ? AND YEAR(t.transaction_date) = ?
             GROUP BY MONTH(t.transaction_date)
             ORDER BY m'
        );
        $stmt->execute([$planningId, $year]);
        $realByMonth = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $m = (int) $row['m'];
            $realByMonth[$m] = [
                'income' => (float) $row['income'],
                'expense' => (float) $row['expense'],
                'investment' => (float) $row['investment'],
                'goals' => 0.0,
                'leisure' => (float) $row['leisure'],
            ];
        }

        $goalStmt = $pdo->prepare(
            'SELECT MONTH(t.transaction_date) AS m, SUM(t.amount_brl) AS goals
             FROM transactions t
             INNER JOIN month_plan_entries e
               ON e.transaction_id = t.id AND e.planning_id = t.planning_id
             WHERE t.planning_id = ? AND YEAR(t.transaction_date) = ?
               AND t.kind = "investment" AND e.financial_goal_id IS NOT NULL
             GROUP BY MONTH(t.transaction_date)'
        );
        $goalStmt->execute([$planningId, $year]);
        foreach ($goalStmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $m = (int) $row['m'];
            if (!isset($realByMonth[$m])) {
                $realByMonth[$m] = ProjectionService::emptyTotals();
            }
            $realByMonth[$m]['goals'] = (float) $row['goals'];
        }

        // Previsto do mês (plano + fixos) com câmbio EUR do dia
        $projectedByMonth = ProjectionService::monthlyProjectedTotals($pdo, $planningId, $year);

        // Investimentos por tipo (real no ano)
        $stmt = $pdo->prepare(
            'SELECT it.id, it.name, it.color, it.target_monthly_brl,
                    COALESCE(SUM(t.amount_brl), 0) AS total_real
             FROM investment_types it
             LEFT JOIN transactions t ON t.investment_type_id = it.id
               AND t.planning_id = it.planning_id AND t.kind = "investment"
               AND YEAR(t.transaction_date) = ?
             WHERE it.planning_id = ? AND it.is_active = 1
             GROUP BY it.id
             ORDER BY it.sort_order, it.name'
        );
        $stmt->execute([$year, $planningId]);
        $investmentTypes = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $investmentTypes[] = [
                'id' => (int) $row['id'],
                'name' => $row['name'],
                'color' => $row['color'],
                'targetMonthlyBrl' => (float) $row['target_monthly_brl'],
                'totalRealYear' => (float) $row['total_real'],
                'targetYear' => (float) $row['target_monthly_brl'] * 12,
            ];
        }

        $months = [];
        $labels = [
            1 => 'Janeiro', 2 => 'Fevereiro', 3 => 'Março', 4 => 'Abril',
            5 => 'Maio', 6 => 'Junho', 7 => 'Julho', 8 => 'Agosto',
            9 => 'Setembro', 10 => 'Outubro', 11 => 'Novembro', 12 => 'Dezembro',
        ];

        $yearReal = ['income' => 0, 'expense' => 0, 'investment' => 0, 'goals' => 0, 'leisure' => 0];
        $yearProjected = ['income' => 0, 'expense' => 0, 'investment' => 0, 'goals' => 0, 'leisure' => 0];

        for ($m = 1; $m <= 12; $m++) {
            $beforeStart = PlanningService::isBeforeUsageStart(
                $year,
                $m,
                $usage['year'],
                $usage['month']
            );
            if ($beforeStart) {
                $real = ProjectionService::emptyTotals();
                $proj = ProjectionService::emptyTotals();
            } else {
                $real = $realByMonth[$m] ?? ProjectionService::emptyTotals();
                $proj = $projectedByMonth[$m] ?? ProjectionService::emptyTotals();
            }
            $balance = $real['income'] - $real['expense'] - $real['investment'] - $real['goals'] - $real['leisure'];
            $balanceProjected = $proj['income'] - $proj['expense'] - $proj['investment'] - $proj['goals'] - $proj['leisure'];

            if (!$beforeStart) {
                foreach (['income', 'expense', 'investment', 'goals', 'leisure'] as $k) {
                    $yearReal[$k] += $real[$k];
                    if (!ProjectionService::isBeforeCurrentMonth($year, $m)) {
                        $yearProjected[$k] += $proj[$k];
                    }
                }
            }

            $months[] = [
                'month' => $m,
                'label' => $labels[$m],
                'real' => $real,
                'projected' => $proj,
                'balanceReal' => round($balance, 2),
                'balanceProjected' => round($balanceProjected, 2),
                'beforePlanningStart' => $beforeStart,
            ];
        }

        Response::json([
            'year' => $year,
            'planningUsageStart' => [
                'year' => $usage['year'],
                'month' => $usage['month'],
                'date' => $usage['date'],
            ],
            'months' => $months,
            'yearTotals' => [
                'real' => $yearReal,
                'projected' => $yearProjected,
                'balanceReal' => round(
                    $yearReal['income'] - $yearReal['expense']
                    - $yearReal['investment'] - $yearReal['goals'] - $yearReal['leisure'],
                    2
                ),
            ],
            'investmentTypes' => $investmentTypes,
        ]);
    }
}
