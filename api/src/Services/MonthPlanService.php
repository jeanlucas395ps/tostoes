<?php

declare(strict_types=1);

namespace Gastos\Api\Services;

use Gastos\Api\MoneyHelper;
use Gastos\Api\Response;
use Gastos\Api\ResponsibleUser;
use PDO;

final class MonthPlanService
{
    /** Fixo infinito ou parcela cujo mês está entre start_date e end_date (inclusive). */
    public static function recurringAppliesToMonth(array $row, int $year, int $month): bool
    {
        if (empty($row['is_installment'])) {
            return true;
        }
        $start = $row['start_date'] ?? null;
        $end = $row['end_date'] ?? null;
        if (!$start || !$end) {
            return false;
        }
        $ym = sprintf('%04d-%02d', $year, $month);
        $startYm = substr((string) $start, 0, 7);
        $endYm = substr((string) $end, 0, 7);

        return $ym >= $startYm && $ym <= $endYm;
    }

    /** Gera sugestões de todos os fixos do mês (mesmo antes do vencimento). */
    public static function syncAllFixedForMonth(
        PDO $pdo,
        int $planningId,
        int $year,
        int $month,
        ?array $kinds = null
    ): void {
        $sql = 'SELECT r.*, COALESCE(a.amount_brl, r.default_amount_brl, 0) AS amount_brl
                FROM recurring_items r
                LEFT JOIN recurring_item_amounts a ON a.recurring_item_id = r.id AND a.month = ?
                WHERE r.planning_id = ? AND r.active = 1 AND r.is_fixed = 1';
        $params = [$month, $planningId];
        if ($kinds !== null && $kinds !== []) {
            $placeholders = implode(',', array_fill(0, count($kinds), '?'));
            $sql .= " AND r.kind IN ($placeholders)";
            $params = array_merge($params, $kinds);
        }
        $sql .= ' ORDER BY r.due_day, r.name';

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);

        $ownerId = PlanningService::ownerUserId($pdo, $planningId);
        $insert = $pdo->prepare(
            'INSERT INTO month_plan_entries
             (user_id, planning_id, year, month, recurring_item_id, kind, name, category, region,
              custom_tab_id, item_category_id, responsible, responsible_user_id, due_day, investment_type_id,
              financial_account_id, source_financial_account_id, suggested_amount_brl, currency, suggested_amount, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );

        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            if (!self::recurringAppliesToMonth($row, $year, $month)) {
                continue;
            }
            $check = $pdo->prepare(
                'SELECT id FROM month_plan_entries
                 WHERE planning_id = ? AND year = ? AND month = ? AND recurring_item_id = ?'
            );
            $check->execute([$planningId, $year, $month, (int) $row['id']]);
            if ($check->fetch()) {
                continue;
            }

            $dueDay = $row['due_day'] !== null ? (int) $row['due_day'] : 1;
            $amountBrl = (float) $row['amount_brl'];
            $currency = $row['currency'] ?? 'BRL';
            $original = $row['amount_original'] !== null
                ? (float) $row['amount_original']
                : $amountBrl;
            $insert->execute([
                $ownerId,
                $planningId,
                $year,
                $month,
                (int) $row['id'],
                $row['kind'],
                $row['name'],
                $row['category'],
                $row['region'],
                $row['custom_tab_id'] ?? null,
                $row['item_category_id'] ?? null,
                $row['responsible'],
                $row['responsible_user_id'] ?? null,
                $dueDay,
                $row['investment_type_id'],
                $row['financial_account_id'] ?? null,
                $row['source_financial_account_id'] ?? null,
                $amountBrl,
                $currency,
                $original,
                'pending',
            ]);
        }
    }

    /** Cria sugestões de fixos no dia de vencimento (e atrasados ainda pendentes). */
    public static function syncDueSuggestions(
        PDO $pdo,
        int $planningId,
        int $year,
        int $month,
        int $todayDay
    ): void {
        $stmt = $pdo->prepare(
            'SELECT r.*, COALESCE(a.amount_brl, r.default_amount_brl, 0) AS amount_brl
             FROM recurring_items r
             LEFT JOIN recurring_item_amounts a ON a.recurring_item_id = r.id AND a.month = ?
             WHERE r.planning_id = ? AND r.active = 1 AND r.is_fixed = 1'
        );
        $stmt->execute([$month, $planningId]);

        $ownerId = PlanningService::ownerUserId($pdo, $planningId);
        $insert = $pdo->prepare(
            'INSERT INTO month_plan_entries
             (user_id, planning_id, year, month, recurring_item_id, kind, name, category, region,
              custom_tab_id, item_category_id, responsible, responsible_user_id, due_day, investment_type_id,
              financial_account_id, source_financial_account_id, suggested_amount_brl, currency, suggested_amount, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );

        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $dueDay = $row['due_day'] !== null ? (int) $row['due_day'] : 1;
            if ($dueDay > $todayDay) {
                continue;
            }
            if (!self::recurringAppliesToMonth($row, $year, $month)) {
                continue;
            }

            $check = $pdo->prepare(
                'SELECT id FROM month_plan_entries
                 WHERE planning_id = ? AND year = ? AND month = ? AND recurring_item_id = ?'
            );
            $check->execute([$planningId, $year, $month, (int) $row['id']]);
            if ($check->fetch()) {
                continue;
            }

            $amountBrl = (float) $row['amount_brl'];
            $currency = $row['currency'] ?? 'BRL';
            $original = $row['amount_original'] !== null
                ? (float) $row['amount_original']
                : $amountBrl;
            $insert->execute([
                $ownerId,
                $planningId,
                $year,
                $month,
                (int) $row['id'],
                $row['kind'],
                $row['name'],
                $row['category'],
                $row['region'],
                $row['custom_tab_id'] ?? null,
                $row['item_category_id'] ?? null,
                $row['responsible'],
                $row['responsible_user_id'] ?? null,
                $dueDay,
                $row['investment_type_id'],
                $row['financial_account_id'] ?? null,
                $row['source_financial_account_id'] ?? null,
                $amountBrl,
                $currency,
                $original,
                'pending',
            ]);
        }
    }

    public static function regenerate(PDO $pdo, int $planningId, int $year, int $month): void
    {
        if (ProjectionService::isBeforeCurrentMonth($year, $month)) {
            return;
        }

        $pdo->prepare(
            'DELETE FROM month_plan_entries
             WHERE planning_id = ? AND year = ? AND month = ?
               AND status = ? AND recurring_item_id IS NOT NULL'
        )->execute([$planningId, $year, $month, 'pending']);

        $todayDay = self::todayDayForMonth($year, $month);
        self::syncDueSuggestions($pdo, $planningId, $year, $month, $todayDay);
    }

    /**
     * Propaga alterações do cadastro fixo apenas para sugestões pendentes do mês atual em diante.
     */
    public static function applyRecurringTemplateToPendingEntries(
        PDO $pdo,
        int $planningId,
        int $recurringItemId
    ): void {
        $when = ProjectionService::sqlCurrentOrFutureMonthClause('mpe.year', 'mpe.month');
        $pdo->prepare(
            "UPDATE month_plan_entries mpe
             INNER JOIN recurring_items r ON r.id = mpe.recurring_item_id AND r.planning_id = mpe.planning_id
             LEFT JOIN recurring_item_amounts a ON a.recurring_item_id = r.id AND a.month = mpe.month
             SET mpe.kind = r.kind,
                 mpe.name = r.name,
                 mpe.category = r.category,
                 mpe.region = r.region,
                 mpe.custom_tab_id = r.custom_tab_id,
                 mpe.item_category_id = r.item_category_id,
                 mpe.responsible = r.responsible,
                 mpe.responsible_user_id = r.responsible_user_id,
                 mpe.due_day = r.due_day,
                 mpe.investment_type_id = r.investment_type_id,
                 mpe.financial_account_id = r.financial_account_id,
                 mpe.source_financial_account_id = r.source_financial_account_id,
                 mpe.currency = COALESCE(r.currency, 'BRL'),
                 mpe.suggested_amount_brl = COALESCE(a.amount_brl, r.default_amount_brl, 0),
                 mpe.suggested_amount = COALESCE(r.amount_original, r.default_amount_brl, 0)
             WHERE mpe.planning_id = ? AND mpe.recurring_item_id = ? AND mpe.status = 'pending'
               AND {$when}"
        )->execute([$planningId, $recurringItemId]);
        self::scrubPendingOutsideInstallmentWindow($pdo, $planningId, $recurringItemId);
    }

    /**
     * Remove pendentes fora da janela start/end de uma compra parcelada
     * (e recria meses faltantes dentro da janela via sync sob demanda).
     */
    public static function scrubPendingOutsideInstallmentWindow(
        PDO $pdo,
        int $planningId,
        int $recurringItemId
    ): void {
        $stmt = $pdo->prepare(
            'SELECT is_installment, start_date, end_date FROM recurring_items
             WHERE id = ? AND planning_id = ?'
        );
        $stmt->execute([$recurringItemId, $planningId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row || empty($row['is_installment']) || empty($row['start_date']) || empty($row['end_date'])) {
            return;
        }

        $when = ProjectionService::sqlCurrentOrFutureMonthClause('year', 'month');
        $startYm = substr((string) $row['start_date'], 0, 7);
        $endYm = substr((string) $row['end_date'], 0, 7);
        $pdo->prepare(
            "DELETE FROM month_plan_entries
             WHERE planning_id = ? AND recurring_item_id = ? AND status = 'pending'
               AND {$when}
               AND (
                 DATE_FORMAT(STR_TO_DATE(CONCAT(year,'-',month,'-01'), '%Y-%c-%d'), '%Y-%m') < ?
                 OR DATE_FORMAT(STR_TO_DATE(CONCAT(year,'-',month,'-01'), '%Y-%c-%d'), '%Y-%m') > ?
               )"
        )->execute([$planningId, $recurringItemId, $startYm, $endYm]);
    }

    /** Remove sugestões pendentes futuras ao desativar um fixo (passado permanece intacto). */
    public static function removeFuturePendingForRecurring(
        PDO $pdo,
        int $planningId,
        int $recurringItemId
    ): void {
        $when = ProjectionService::sqlCurrentOrFutureMonthClause('year', 'month');
        $pdo->prepare(
            "DELETE FROM month_plan_entries
             WHERE planning_id = ? AND recurring_item_id = ? AND status = 'pending'
               AND {$when}"
        )->execute([$planningId, $recurringItemId]);
    }

    public static function todayDayForMonth(int $year, int $month): int
    {
        $nowY = (int) date('Y');
        $nowM = (int) date('n');
        $nowD = (int) date('j');

        if ($year === $nowY && $month === $nowM) {
            return $nowD;
        }
        if ($year < $nowY || ($year === $nowY && $month < $nowM)) {
            return 31;
        }
        return 0;
    }

    /** @return array<string, mixed> */
    public static function getPlan(PDO $pdo, int $planningId, int $year, int $month): array
    {
        $todayDay = self::todayDayForMonth($year, $month);
        if ($todayDay > 0) {
            self::syncDueSuggestions($pdo, $planningId, $year, $month, $todayDay);
        }

        $stmt = $pdo->prepare(
            'SELECT e.*, it.name AS investment_type_name, it.color AS investment_type_color,
                    fg.color AS financial_goal_color,
                    fa.name AS financial_account_name,
                    sfa.name AS source_financial_account_name,
                    ct.name AS custom_tab_name, ic.name AS item_category_name, ic.icon AS item_category_icon,
                    ri.is_installment AS is_installment,
                    ' . ResponsibleUser::selectColumns() . '
             FROM month_plan_entries e
             LEFT JOIN investment_types it ON it.id = e.investment_type_id
             LEFT JOIN financial_goals fg ON fg.id = e.financial_goal_id
             LEFT JOIN financial_accounts fa ON fa.id = e.financial_account_id
             LEFT JOIN financial_accounts sfa ON sfa.id = e.source_financial_account_id
             LEFT JOIN planning_custom_tabs ct ON ct.id = e.custom_tab_id
             LEFT JOIN planning_item_categories ic ON ic.id = e.item_category_id
             LEFT JOIN recurring_items ri ON ri.id = e.recurring_item_id
             ' . ResponsibleUser::joinClause('e') . '
             WHERE e.planning_id = ? AND e.year = ? AND e.month = ?
             ORDER BY e.due_day, e.name'
        );
        $stmt->execute([$planningId, $year, $month]);
        $all = array_map([self::class, 'mapEntry'], $stmt->fetchAll(PDO::FETCH_ASSOC));

        $grouped = self::groupEntries($all, $todayDay);
        $forecast = self::buildForecast($pdo, $planningId, $year, $month, $todayDay);

        return [
            'year' => $year,
            'month' => $month,
            'todayDay' => $todayDay > 0 ? $todayDay : null,
            'sections' => $grouped,
            'forecast' => $forecast,
            'summary' => self::buildSummary($pdo, $planningId, $year, $month, $all, $forecast),
            'insights' => self::buildInsights($all, $forecast),
        ];
    }

    /**
     * @param array<int, array<string, mixed>> $entries
     * @return array<string, array<int, array<string, mixed>>>
     */
    private static function groupEntries(array $entries, int $todayDay): array
    {
        $today = [];
        $overdue = [];
        $upcoming = [];
        $variable = [];
        $completed = [];

        foreach ($entries as $e) {
            if ($e['status'] !== 'pending') {
                $completed[] = $e;
                continue;
            }
            if ($e['recurringItemId'] === null) {
                $variable[] = $e;
                continue;
            }
            $due = $e['dueDay'] ?? 1;
            if ($todayDay <= 0) {
                $upcoming[] = $e;
                continue;
            }
            if ($due === $todayDay) {
                $today[] = $e;
            } elseif ($due < $todayDay) {
                $overdue[] = $e;
            } else {
                $upcoming[] = $e;
            }
        }

        return [
            'today' => $today,
            'overdue' => $overdue,
            'upcoming' => $upcoming,
            'variable' => $variable,
            'completed' => $completed,
        ];
    }

    /** @return array<int, array<string, mixed>> */
    private static function buildForecast(
        PDO $pdo,
        int $planningId,
        int $year,
        int $month,
        int $todayDay
    ): array {
        $stmt = $pdo->prepare(
            'SELECT r.id, r.kind, r.name, r.category, r.due_day, r.currency,
                    r.amount_original, r.default_amount_brl,
                    r.is_installment, r.start_date, r.end_date,
                    COALESCE(a.amount_brl, r.default_amount_brl, 0) AS amount_brl
             FROM recurring_items r
             LEFT JOIN recurring_item_amounts a ON a.recurring_item_id = r.id AND a.month = ?
             WHERE r.planning_id = ? AND r.active = 1 AND r.is_fixed = 1
             ORDER BY r.due_day, r.name'
        );
        $stmt->execute([$month, $planningId]);

        $existing = $pdo->prepare(
            'SELECT recurring_item_id FROM month_plan_entries
             WHERE planning_id = ? AND year = ? AND month = ? AND recurring_item_id IS NOT NULL'
        );
        $existing->execute([$planningId, $year, $month]);
        $hasEntry = [];
        while ($row = $existing->fetch(PDO::FETCH_ASSOC)) {
            $hasEntry[(int) $row['recurring_item_id']] = true;
        }

        $forecast = [];
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            if (!self::recurringAppliesToMonth($row, $year, $month)) {
                continue;
            }
            $due = $row['due_day'] !== null ? (int) $row['due_day'] : 1;
            if ($todayDay > 0 && $due <= $todayDay) {
                continue;
            }
            if (isset($hasEntry[(int) $row['id']])) {
                continue;
            }
            $currency = $row['currency'] ?? 'BRL';
            $amount = $row['amount_original'] !== null
                ? (float) $row['amount_original']
                : (float) $row['amount_brl'];
            $forecast[] = [
                'recurringItemId' => (int) $row['id'],
                'kind' => $row['kind'],
                'name' => $row['name'],
                'category' => $row['category'],
                'dueDay' => $due,
                'currency' => $currency,
                'suggestedAmount' => $amount,
                'suggestedAmountBrl' => ProjectionService::amountInBrlForMonth(
                    $pdo,
                    $planningId,
                    $year,
                    $month,
                    $currency,
                    $amount,
                    (float) $row['amount_brl']
                ),
            ];
        }
        return $forecast;
    }

    /**
     * @param array<int, array<string, mixed>> $entries
     * @param array<int, array<string, mixed>> $forecast
     */
    public static function buildSummary(
        PDO $pdo,
        int $planningId,
        int $year,
        int $month,
        array $entries,
        array $forecast
    ): array {
        $kinds = ['income', 'expense', 'investment', 'leisure'];
        $projected = array_fill_keys($kinds, 0.0);
        $confirmed = array_fill_keys($kinds, 0.0);

        $addToProjected = function (string $kind, float $amount) use (&$projected): void {
            if (!array_key_exists($kind, $projected)) {
                return;
            }
            $projected[$kind] += $amount;
        };

        foreach ($entries as $e) {
            if ($e['status'] === 'skipped') {
                continue;
            }
            // Transferências não entram no resumo de receita/despesa
            if (($e['kind'] ?? '') === 'transfer') {
                continue;
            }
            $amt = ProjectionService::entrySuggestedBrl($pdo, $planningId, $year, $month, [
                'currency' => $e['currency'] ?? 'BRL',
                'suggested_amount' => $e['suggestedAmount'] ?? $e['suggestedAmountBrl'],
                'suggested_amount_brl' => $e['suggestedAmountBrl'],
            ]);
            $addToProjected($e['kind'], $amt);
            if ($e['status'] === 'confirmed') {
                if (array_key_exists($e['kind'], $confirmed)) {
                    $confirmed[$e['kind']] += (float) ($e['confirmedAmountBrl'] ?? $amt);
                }
            }
        }
        foreach ($forecast as $f) {
            $addToProjected($f['kind'], (float) $f['suggestedAmountBrl']);
        }

        $pendingFixed = count(array_filter(
            $entries,
            fn ($e) => $e['status'] === 'pending' && $e['recurringItemId'] !== null
        ));
        $pendingVariable = count(array_filter(
            $entries,
            fn ($e) => $e['status'] === 'pending' && $e['recurringItemId'] === null
        ));
        $done = count(array_filter($entries, fn ($e) => $e['status'] !== 'pending'));
        $total = count($entries) + count($forecast);

        $balanceProjected = $projected['income'] - $projected['expense']
            - $projected['investment'] - $projected['leisure'];

        return [
            'projected' => array_map(fn ($v) => round($v, 2), $projected),
            'confirmed' => array_map(fn ($v) => round($v, 2), $confirmed),
            'pendingFixedCount' => $pendingFixed,
            'pendingVariableCount' => $pendingVariable,
            'pendingCount' => $pendingFixed + $pendingVariable,
            'confirmedCount' => count(array_filter($entries, fn ($e) => $e['status'] === 'confirmed')),
            'skippedCount' => count(array_filter($entries, fn ($e) => $e['status'] === 'skipped')),
            'totalEntries' => count($entries),
            'forecastCount' => count($forecast),
            'progressPercent' => count($entries) > 0 ? round(($done / count($entries)) * 100) : 0,
            'balanceProjected' => round($balanceProjected, 2),
            'balanceConfirmed' => round(
                $confirmed['income'] - $confirmed['expense'] - $confirmed['investment'] - $confirmed['leisure'],
                2
            ),
            'balanceAfterLeisure' => round(
                $projected['income'] - $projected['expense'] - $projected['leisure'],
                2
            ),
        ];
    }

    /**
     * @param array<int, array<string, mixed>> $entries
     * @param array<int, array<string, mixed>> $forecast
     */
    private static function buildInsights(array $entries, array $forecast): array
    {
        $byCategory = [];
        $all = array_merge(
            array_filter($entries, fn ($e) => $e['status'] !== 'skipped'),
            $forecast
        );
        foreach ($all as $e) {
            if (in_array($e['kind'], ['expense', 'leisure'], true)) {
                $cat = $e['category'];
                $amt = (float) ($e['suggestedAmountBrl'] ?? 0);
                $byCategory[$cat] = ($byCategory[$cat] ?? 0) + $amt;
            }
        }
        arsort($byCategory);
        $topCategories = [];
        foreach (array_slice($byCategory, 0, 5, true) as $name => $total) {
            $topCategories[] = ['category' => $name, 'amountBrl' => round($total, 2)];
        }

        $todayCount = count(array_filter(
            $entries,
            fn ($e) => $e['status'] === 'pending' && ($e['dueDay'] ?? 1) === (int) date('j')
        ));

        $message = $todayCount > 0
            ? "Hoje você tem {$todayCount} item(ns) fixo(s) para confirmar."
            : 'Revise itens atrasados e registre gastos variáveis quando ocorrerem.';

        return [
            'topExpenseCategories' => $topCategories,
            'message' => $message,
        ];
    }

    /**
     * Desfaz confirmação: remove transações vinculadas e volta o item para pendente.
     *
     * @param array<string, mixed> $entry
     * @return list<int> contas afetadas (para recálculo de metas)
     */
    public static function revertConfirmation(PDO $pdo, int $planningId, array $entry): array
    {
        if (($entry['status'] ?? '') !== 'confirmed') {
            Response::error('Só é possível desfazer itens confirmados.', 422);
        }

        $txId = (int) ($entry['transaction_id'] ?? 0);
        if ($txId <= 0) {
            Response::error('Lançamento sem transação vinculada.', 422);
        }

        $accountIds = self::deleteLinkedTransactions($pdo, $planningId, $txId);

        $pdo->prepare(
            'UPDATE month_plan_entries
             SET status = ?, transaction_id = NULL, confirmed_amount_brl = NULL, confirmed_amount = NULL
             WHERE id = ? AND planning_id = ?'
        )->execute(['pending', (int) $entry['id'], $planningId]);

        if (!empty($entry['financial_goal_id'])) {
            GoalPlanService::recalculatePendingAmounts(
                $pdo,
                $planningId,
                (int) $entry['financial_goal_id']
            );
        }

        return $accountIds;
    }

    /** @return array<string, mixed>|null */
    public static function findEntryForTransaction(PDO $pdo, int $planningId, int $transactionId): ?array
    {
        $stmt = $pdo->prepare(
            'SELECT * FROM month_plan_entries WHERE planning_id = ? AND transaction_id = ?'
        );
        $stmt->execute([$planningId, $transactionId]);
        $entry = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($entry) {
            return $entry;
        }

        $txStmt = $pdo->prepare(
            'SELECT id, notes FROM transactions WHERE id = ? AND planning_id = ?'
        );
        $txStmt->execute([$transactionId, $planningId]);
        $tx = $txStmt->fetch(PDO::FETCH_ASSOC);
        if (!$tx) {
            return null;
        }

        if (preg_match('/\(#(\d+)\)/', (string) ($tx['notes'] ?? ''), $m)) {
            $stmt->execute([$planningId, (int) $m[1]]);
            $entry = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($entry) {
                return $entry;
            }
        }

        return null;
    }

    /** @return list<int> IDs de contas afetadas */
    public static function deleteLinkedTransactions(PDO $pdo, int $planningId, int $primaryTxId): array
    {
        $idsToDelete = [$primaryTxId];
        $accountIds = [];

        $stmt = $pdo->prepare(
            'SELECT id, account_id, notes FROM transactions WHERE id = ? AND planning_id = ?'
        );
        $stmt->execute([$primaryTxId, $planningId]);
        $primary = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$primary) {
            return [];
        }

        $accountIds[] = (int) $primary['account_id'];
        $notes = (string) ($primary['notes'] ?? '');
        if (preg_match('/\(#(\d+)\)/', $notes, $m)) {
            $idsToDelete[] = (int) $m[1];
        }

        $mirrorStmt = $pdo->prepare(
            'SELECT id, account_id FROM transactions
             WHERE planning_id = ? AND id != ? AND notes LIKE ?'
        );
        $mirrorStmt->execute([$planningId, $primaryTxId, '%(#' . $primaryTxId . ')%']);
        foreach ($mirrorStmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $idsToDelete[] = (int) $row['id'];
            $accountIds[] = (int) $row['account_id'];
        }

        $idsToDelete = array_values(array_unique($idsToDelete));
        $placeholders = implode(',', array_fill(0, count($idsToDelete), '?'));
        $pdo->prepare(
            "DELETE FROM transactions WHERE planning_id = ? AND id IN ($placeholders)"
        )->execute(array_merge([$planningId], $idsToDelete));

        return array_values(array_unique($accountIds));
    }

    public static function mapEntry(array $row): array
    {
        $currency = $row['currency'] ?? 'BRL';
        $suggestedAmount = isset($row['suggested_amount'])
            ? (float) $row['suggested_amount']
            : (float) $row['suggested_amount_brl'];

        return ResponsibleUser::enrichMap([
            'id' => (int) $row['id'],
            'recurringItemId' => $row['recurring_item_id'] ? (int) $row['recurring_item_id'] : null,
            'financialGoalId' => !empty($row['financial_goal_id'])
                ? (int) $row['financial_goal_id'] : null,
            'financialGoalColor' => !empty($row['financial_goal_color'])
                ? (string) $row['financial_goal_color'] : null,
            'isGoal' => !empty($row['financial_goal_id']),
            'isInstallment' => !empty($row['is_installment']),
            'isVariable' => $row['recurring_item_id'] === null && empty($row['financial_goal_id']),
            'kind' => $row['kind'],
            'name' => $row['name'],
            'category' => $row['category'],
            'region' => $row['region'],
            'customTabId' => isset($row['custom_tab_id']) && $row['custom_tab_id']
                ? (int) $row['custom_tab_id'] : null,
            'customTabName' => $row['custom_tab_name'] ?? null,
            'itemCategoryId' => isset($row['item_category_id']) && $row['item_category_id']
                ? (int) $row['item_category_id'] : null,
            'itemCategoryName' => $row['item_category_name'] ?? null,
            'itemCategoryIcon' => $row['item_category_icon'] ?? null,
            'responsible' => $row['responsible'],
            'currency' => $currency,
            'suggestedAmount' => $suggestedAmount,
            'dueDay' => $row['due_day'] !== null ? (int) $row['due_day'] : null,
            'investmentTypeId' => $row['investment_type_id'] ? (int) $row['investment_type_id'] : null,
            'investmentTypeName' => $row['investment_type_name'] ?? null,
            'investmentTypeColor' => $row['investment_type_color'] ?? null,
            'financialAccountId' => isset($row['financial_account_id']) && $row['financial_account_id']
                ? (int) $row['financial_account_id'] : null,
            'financialAccountName' => $row['financial_account_name'] ?? null,
            'sourceFinancialAccountId' => isset($row['source_financial_account_id'])
                && $row['source_financial_account_id']
                ? (int) $row['source_financial_account_id'] : null,
            'sourceFinancialAccountName' => $row['source_financial_account_name'] ?? null,
            'sourceFinancialAccountType' => $row['source_financial_account_type'] ?? null,
            'suggestedAmountBrl' => (float) $row['suggested_amount_brl'],
            'confirmedAmountBrl' => $row['confirmed_amount_brl'] !== null
                ? (float) $row['confirmed_amount_brl'] : null,
            'status' => $row['status'],
            'transactionId' => $row['transaction_id'] ? (int) $row['transaction_id'] : null,
            'notes' => $row['notes'],
        ], $row);
    }
}
