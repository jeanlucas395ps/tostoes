<?php

declare(strict_types=1);

namespace Gastos\Api\Controllers;

use Gastos\Api\Auth;
use Gastos\Api\Database;
use Gastos\Api\Response;
use Gastos\Api\ResponsibleUser;
use Gastos\Api\Services\GoalPlanService;
use Gastos\Api\Services\MonthPlanService;
use Gastos\Api\Services\ProjectionService;
use PDO;

final class LedgerController
{
    public static function index(): void
    {
        Auth::requireUser();
        $planningId = Auth::requirePlanningId();
        $year = isset($_GET['year']) ? (int) $_GET['year'] : (int) date('Y');
        $month = isset($_GET['month']) ? (int) $_GET['month'] : (int) date('n');
        if ($month < 1 || $month > 12) {
            Response::error('Mês inválido.', 422);
        }

        $kinds = self::kindsFromQuery();
        $pdo = Database::connection();
        $isPastMonth = ProjectionService::isBeforeCurrentMonth($year, $month);

        if (!$isPastMonth) {
            MonthPlanService::syncAllFixedForMonth($pdo, $planningId, $year, $month, $kinds);
            GoalPlanService::refreshAllPendingAmounts($pdo, $planningId);
        }

        $placeholders = implode(',', array_fill(0, count($kinds), '?'));
        $pending = [];
        if (!$isPastMonth) {
            $stmt = $pdo->prepare(
                "SELECT e.*, it.name AS investment_type_name, it.color AS investment_type_color,
                        fg.color AS financial_goal_color, fg.target_amount_brl AS financial_goal_target,
                        fg.start_amount_brl AS financial_goal_start,
                        fa.name AS financial_account_name,
                        sfa.name AS source_financial_account_name,
                        ct.name AS custom_tab_name, ic.name AS item_category_name, ic.icon AS item_category_icon,
                        " . ResponsibleUser::selectColumns() . "
                 FROM month_plan_entries e
                 LEFT JOIN investment_types it ON it.id = e.investment_type_id
                 LEFT JOIN financial_goals fg ON fg.id = e.financial_goal_id
                 LEFT JOIN financial_accounts fa ON fa.id = e.financial_account_id
                 LEFT JOIN financial_accounts sfa ON sfa.id = e.source_financial_account_id
                 LEFT JOIN planning_custom_tabs ct ON ct.id = e.custom_tab_id
                 LEFT JOIN planning_item_categories ic ON ic.id = e.item_category_id
                 " . ResponsibleUser::joinClause('e') . "
                 WHERE e.planning_id = ? AND e.year = ? AND e.month = ?
                   AND e.kind IN ($placeholders) AND e.status = 'pending'
                 ORDER BY (e.recurring_item_id IS NULL) DESC, e.due_day ASC, e.name ASC"
            );
            $stmt->execute(array_merge([$planningId, $year, $month], $kinds));
            $pending = array_map([MonthPlanService::class, 'mapEntry'], $stmt->fetchAll(PDO::FETCH_ASSOC));
        }

        $txStmt = $pdo->prepare(
            "SELECT t.*, it.name AS investment_type_name, it.color AS investment_type_color,
                    fa.id AS account_row_id, fa.name AS account_name, fa.type AS account_type,
                    mpe.id AS mpe_id, mpe.recurring_item_id AS mpe_recurring_item_id,
                    reg.id AS reg_id, reg.username AS reg_username, reg.name AS reg_name, reg.gender AS reg_gender,
                    " . ResponsibleUser::selectColumns() . "
             FROM transactions t
             LEFT JOIN financial_accounts fa ON fa.id = t.account_id
             LEFT JOIN investment_types it ON it.id = t.investment_type_id
             LEFT JOIN month_plan_entries mpe ON mpe.transaction_id = t.id AND mpe.planning_id = t.planning_id
             LEFT JOIN users reg ON reg.id = t.registered_by_user_id
             " . ResponsibleUser::joinClause('t') . "
             WHERE t.planning_id = ? AND YEAR(t.transaction_date) = ? AND MONTH(t.transaction_date) = ?
               AND t.kind IN ($placeholders)
             ORDER BY t.transaction_date ASC, t.id ASC"
        );
        $txStmt->execute(array_merge([$planningId, $year, $month], $kinds));
        $confirmed = array_map([TransactionController::class, 'map'], $txStmt->fetchAll(PDO::FETCH_ASSOC));

        $summary = self::buildSummary($pdo, $planningId, $year, $month, $pending, $confirmed);

        Response::json([
            'year' => $year,
            'month' => $month,
            'pending' => $pending,
            'confirmed' => $confirmed,
            'summary' => $summary,
        ]);
    }

    /** @return list<string> */
    private static function kindsFromQuery(): array
    {
        $raw = $_GET['kinds'] ?? 'income,expense';
        $kinds = array_filter(array_map('trim', explode(',', $raw)));
        $valid = ['income', 'expense', 'investment', 'leisure'];
        $kinds = array_values(array_intersect($kinds, $valid));
        return $kinds !== [] ? $kinds : ['income', 'expense'];
    }

    /** @param array<int, array<string, mixed>> $pending */
    /** @param array<int, array<string, mixed>> $confirmed */
    private static function buildSummary(
        PDO $pdo,
        int $planningId,
        int $year,
        int $month,
        array $pending,
        array $confirmed
    ): array {
        $realIncome = 0.0;
        $realExpense = 0.0;
        $projIncome = 0.0;
        $projExpense = 0.0;
        $projInvestment = 0.0;

        foreach ($confirmed as $c) {
            if ($c['kind'] === 'income') {
                $realIncome += (float) $c['amountBrl'];
            } elseif (in_array($c['kind'], ['expense', 'leisure'], true)) {
                $realExpense += (float) $c['amountBrl'];
            }
        }

        foreach ($pending as $p) {
            $brl = ProjectionService::entrySuggestedBrl($pdo, $planningId, $year, $month, [
                'currency' => $p['currency'] ?? 'BRL',
                'suggested_amount' => $p['suggestedAmount'] ?? $p['suggestedAmountBrl'],
                'suggested_amount_brl' => $p['suggestedAmountBrl'],
            ]);
            if ($p['kind'] === 'income') {
                $projIncome += $brl;
            } elseif (in_array($p['kind'], ['expense', 'leisure'], true)) {
                $projExpense += $brl;
            } elseif ($p['kind'] === 'investment') {
                $projInvestment += $brl;
            }
        }

        $totalProjIncome = $realIncome + $projIncome;
        $totalProjExpense = $realExpense + $projExpense;

        return [
            'incomeTotal' => round($realIncome, 2),
            'expenseTotal' => round($realExpense, 2),
            'balance' => round($realIncome - $realExpense, 2),
            'pendingCount' => count($pending),
            'confirmedCount' => count($confirmed),
            'projected' => [
                'income' => round($totalProjIncome, 2),
                'expense' => round($totalProjExpense, 2),
                'investment' => round($projInvestment, 2),
                'balance' => round($totalProjIncome - $totalProjExpense - $projInvestment, 2),
            ],
        ];
    }
}
