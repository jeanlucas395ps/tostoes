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
                        sfa.type AS source_financial_account_type,
                        ct.name AS custom_tab_name, ic.name AS item_category_name, ic.icon AS item_category_icon,
                        ri.is_installment AS is_installment,
                        " . ResponsibleUser::selectColumns() . "
                 FROM month_plan_entries e
                 LEFT JOIN investment_types it ON it.id = e.investment_type_id
                 LEFT JOIN financial_goals fg ON fg.id = e.financial_goal_id
                 LEFT JOIN financial_accounts fa ON fa.id = e.financial_account_id
                 LEFT JOIN financial_accounts sfa ON sfa.id = e.source_financial_account_id
                 LEFT JOIN planning_custom_tabs ct ON ct.id = e.custom_tab_id
                 LEFT JOIN planning_item_categories ic ON ic.id = e.item_category_id
                 LEFT JOIN recurring_items ri ON ri.id = e.recurring_item_id
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
                    mpe.financial_goal_id AS mpe_financial_goal_id,
                    fg.color AS mpe_financial_goal_color,
                    ri.is_installment AS mpe_is_installment,
                    reg.id AS reg_id, reg.username AS reg_username, reg.name AS reg_name, reg.gender AS reg_gender,
                    " . ResponsibleUser::selectColumns() . "
             FROM transactions t
             LEFT JOIN financial_accounts fa ON fa.id = t.account_id
             LEFT JOIN investment_types it ON it.id = t.investment_type_id
             LEFT JOIN month_plan_entries mpe ON mpe.transaction_id = t.id AND mpe.planning_id = t.planning_id
             LEFT JOIN financial_goals fg ON fg.id = mpe.financial_goal_id
             LEFT JOIN recurring_items ri ON ri.id = mpe.recurring_item_id
             LEFT JOIN users reg ON reg.id = t.registered_by_user_id
             " . ResponsibleUser::joinClause('t') . "
             WHERE t.planning_id = ? AND YEAR(t.transaction_date) = ? AND MONTH(t.transaction_date) = ?
               AND t.kind IN ($placeholders)
               AND NOT (t.kind = 'transfer' AND t.notes LIKE 'Transferência ←%')
               AND NOT (t.kind = 'income' AND t.notes LIKE 'Aporte ←%')
             ORDER BY t.transaction_date ASC, t.id ASC"
        );
        $txStmt->execute(array_merge([$planningId, $year, $month], $kinds));
        $confirmed = array_map(
            [TransactionController::class, 'map'],
            $txStmt->fetchAll(PDO::FETCH_ASSOC)
        );
        $confirmed = self::enrichTransferPairs($pdo, $planningId, $confirmed);

        $creditBills = self::buildCreditBills($pdo, $planningId, $year, $month, $pending, $confirmed);
        $summary = self::buildSummary($pdo, $planningId, $year, $month, $pending, $confirmed);

        Response::json([
            'year' => $year,
            'month' => $month,
            'pending' => $pending,
            'confirmed' => $confirmed,
            'creditBills' => $creditBills,
            'summary' => $summary,
        ]);
    }

    /**
     * Faturas do mês: cartões com vencimento + compras/parcelas vinculadas.
     *
     * @param list<array<string, mixed>> $pending
     * @param list<array<string, mixed>> $confirmed
     * @return list<array<string, mixed>>
     */
    private static function buildCreditBills(
        PDO $pdo,
        int $planningId,
        int $year,
        int $month,
        array $pending,
        array $confirmed
    ): array {
        $stmt = $pdo->prepare(
            "SELECT * FROM financial_accounts
             WHERE planning_id = ? AND active = 1 AND type = 'credit'
             ORDER BY due_day IS NULL, due_day, name"
        );
        $stmt->execute([$planningId]);
        $cards = $stmt->fetchAll(PDO::FETCH_ASSOC);
        if ($cards === []) {
            return [];
        }

        $bills = [];
        foreach ($cards as $card) {
            $accountId = (int) $card['id'];
            $forecast = \Gastos\Api\Services\AccountService::creditMonthForecast(
                $pdo,
                $planningId,
                $accountId,
                $year,
                $month
            );
            $items = [];
            foreach ($pending as $p) {
                if ((int) ($p['sourceFinancialAccountId'] ?? 0) !== $accountId) {
                    continue;
                }
                if (!in_array($p['kind'] ?? '', ['expense', 'leisure'], true)) {
                    continue;
                }
                $items[] = [
                    'id' => $p['id'],
                    'name' => $p['name'],
                    'amountBrl' => (float) ($p['suggestedAmountBrl'] ?? 0),
                    'isInstallment' => !empty($p['isInstallment']),
                    'status' => 'pending',
                    'dueDay' => $p['dueDay'] ?? null,
                    'monthPlanEntryId' => (int) $p['id'],
                    'canCancel' => true,
                ];
            }
            foreach ($confirmed as $c) {
                if ((int) ($c['accountId'] ?? 0) !== $accountId) {
                    continue;
                }
                if (!in_array($c['kind'] ?? '', ['expense', 'leisure'], true)) {
                    continue;
                }
                $mpeId = isset($c['monthPlanEntryId']) && $c['monthPlanEntryId'] !== null
                    ? (int) $c['monthPlanEntryId'] : null;
                $items[] = [
                    'id' => $c['id'],
                    'name' => $c['description'] ?? $c['name'] ?? '',
                    'amountBrl' => (float) ($c['amountBrl'] ?? 0),
                    'isInstallment' => !empty($c['isInstallment']),
                    'status' => 'confirmed',
                    'dueDay' => null,
                    'monthPlanEntryId' => $mpeId,
                    'canCancel' => $mpeId !== null || !empty($c['canUnconfirm']),
                ];
            }

            $paidBrl = 0.0;
            foreach ($confirmed as $c) {
                if ((int) ($c['accountId'] ?? 0) !== $accountId) {
                    continue;
                }
                if (($c['kind'] ?? '') === 'income') {
                    $paidBrl += (float) ($c['amountBrl'] ?? 0);
                }
            }
            foreach ($confirmed as $c) {
                if (($c['kind'] ?? '') !== 'transfer') {
                    continue;
                }
                $targetId = isset($c['transferTargetAccountId']) ? (int) $c['transferTargetAccountId'] : 0;
                $matchesTarget = $targetId === $accountId
                    || ($c['transferTargetAccountName'] ?? null) === $card['name'];
                if ($matchesTarget) {
                    $paidBrl += (float) ($c['transferInAmountBrl'] ?? $c['amountBrl'] ?? 0);
                    // Inclui o pagamento na fatura para o usuário ver o adiantamento.
                    $items[] = [
                        'id' => $c['id'],
                        'name' => $c['description'] ?? 'Pagamento / adiantamento',
                        'amountBrl' => (float) ($c['transferInAmountBrl'] ?? $c['amountBrl'] ?? 0),
                        'isInstallment' => false,
                        'status' => 'payment',
                        'dueDay' => null,
                        'monthPlanEntryId' => null,
                        'canCancel' => false,
                    ];
                }
            }

            $total = (float) ($forecast['totalBrl'] ?? 0);
            if ($total <= 0 && $items === []) {
                continue;
            }

            $mapped = \Gastos\Api\Services\AccountService::mapAccount($pdo, $card, false);

            $bills[] = [
                'accountId' => $accountId,
                'name' => $card['name'],
                'color' => $card['color'] ?? '#f59e0b',
                'dueDay' => $card['due_day'] !== null ? (int) $card['due_day'] : null,
                'closingDay' => $card['closing_day'] !== null ? (int) $card['closing_day'] : null,
                'creditLimit' => $mapped['creditLimit'] ?? null,
                'usedLimit' => $mapped['usedLimit'] ?? null,
                'availableLimit' => $mapped['availableLimit'] ?? null,
                'forecast' => $forecast,
                'paidBrl' => round($paidBrl, 2),
                'remainingBrl' => round(max(0, $total - $paidBrl), 2),
                'items' => $items,
            ];
        }

        return $bills;
    }

    /**
     * Anexa valor/moeda/conta de entrada nas transferências / aportes (perna de saída).
     *
     * @param list<array<string, mixed>> $confirmed
     * @return list<array<string, mixed>>
     */
    private static function enrichTransferPairs(PDO $pdo, int $planningId, array $confirmed): array
    {
        $linkedIds = [];
        foreach ($confirmed as $c) {
            $notes = (string) ($c['notes'] ?? '');
            $kind = $c['kind'] ?? '';
            $isPairOut = ($kind === 'transfer' && str_contains($notes, 'Transferência →'))
                || ($kind === 'investment' && str_contains($notes, 'Aporte →'));
            if (!$isPairOut) {
                continue;
            }
            if (preg_match('/\(#(\d+)\)/', $notes, $m)) {
                $linkedIds[(int) $c['id']] = (int) $m[1];
            }
        }
        if ($linkedIds === []) {
            return $confirmed;
        }

        $uniqueInIds = array_values(array_unique(array_values($linkedIds)));
        $placeholders = implode(',', array_fill(0, count($uniqueInIds), '?'));
        $stmt = $pdo->prepare(
            "SELECT t.id, t.amount, t.currency, t.amount_brl, t.eur_to_brl, t.account_id,
                    fa.name AS account_name, fa.type AS account_type
             FROM transactions t
             LEFT JOIN financial_accounts fa ON fa.id = t.account_id
             WHERE t.planning_id = ? AND t.id IN ($placeholders)"
        );
        $stmt->execute(array_merge([$planningId], $uniqueInIds));
        $byId = [];
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $byId[(int) $row['id']] = $row;
        }

        foreach ($confirmed as &$c) {
            $outId = (int) $c['id'];
            $inId = $linkedIds[$outId] ?? null;
            if ($inId === null || !isset($byId[$inId])) {
                continue;
            }
            $in = $byId[$inId];
            $notes = (string) ($c['notes'] ?? '');
            $isAporte = str_contains($notes, 'Aporte →');
            $targetFromNotes = null;
            $pattern = $isAporte
                ? '/^Aporte → (.+?)(?:\s*\(#\d+\))?/'
                : '/^Transferência → (.+?)(?:\s*\(#\d+\))?/';
            if (preg_match($pattern, $notes, $nm)) {
                $targetFromNotes = trim($nm[1]);
                if (str_contains($targetFromNotes, ' · ')) {
                    $targetFromNotes = trim(explode(' · ', $targetFromNotes, 2)[0]);
                }
            }
            $c['transferPairMode'] = $isAporte ? 'aporte' : 'transfer';
            $c['transferLinkedTxId'] = $inId;
            $c['transferSourceAccountId'] = isset($c['accountId']) ? (int) $c['accountId'] : null;
            $c['transferSourceAccountName'] = $c['accountName'] ?? null;
            $c['transferTargetAccountId'] = isset($in['account_id']) ? (int) $in['account_id'] : null;
            $c['transferTargetAccountName'] = $in['account_name'] ?? $targetFromNotes;
            $c['transferTargetAccountType'] = $in['account_type'] ?? null;
            $c['transferOutAmount'] = (float) $c['amount'];
            $c['transferOutCurrency'] = $c['currency'] ?? 'BRL';
            $c['transferOutAmountBrl'] = (float) ($c['amountBrl'] ?? 0);
            $c['transferInAmount'] = (float) $in['amount'];
            $c['transferInCurrency'] = $in['currency'] ?? 'BRL';
            $c['transferInAmountBrl'] = (float) ($in['amount_brl'] ?? 0);
            $c['transferInEurToBrl'] = isset($in['eur_to_brl']) && $in['eur_to_brl'] !== null
                ? (float) $in['eur_to_brl'] : null;
        }
        unset($c);

        return $confirmed;
    }

    /** @return list<string> */
    private static function kindsFromQuery(): array
    {
        $raw = $_GET['kinds'] ?? 'income,expense';
        $kinds = array_filter(array_map('trim', explode(',', $raw)));
        $valid = ['income', 'expense', 'investment', 'leisure', 'transfer'];
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
