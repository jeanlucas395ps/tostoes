<?php

declare(strict_types=1);

namespace Gastos\Api\Services;

use Gastos\Api\MoneyHelper;
use Gastos\Api\Response;
use Gastos\Api\ResponsibleUser;
use PDO;

final class GoalPlanService
{
    /** @param array<string, mixed> $body */
    public static function parseDates(array $body): array
    {
        $start = trim((string) ($body['startDate'] ?? ''));
        $end = trim((string) ($body['endDate'] ?? $body['deadlineDate'] ?? ''));
        if ($start === '' || $end === '') {
            Response::error('Informe a data de início e a data de fim da meta.', 422);
        }
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $start) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $end)) {
            Response::error('Datas inválidas.', 422);
        }
        if ($start > $end) {
            Response::error('A data de início deve ser anterior à data de fim.', 422);
        }

        return ['start' => $start, 'end' => $end];
    }

    public static function monthCount(string $startDate, string $endDate): int
    {
        $start = new \DateTimeImmutable($startDate);
        $end = new \DateTimeImmutable($endDate);
        $months = ($end->format('Y') - $start->format('Y')) * 12
            + (int) $end->format('n') - (int) $start->format('n') + 1;

        return max(1, $months);
    }

    public static function monthlyAmount(float $startAmount, float $targetAmount, int $monthCount): float
    {
        $gap = max(0, $targetAmount - $startAmount);

        return round($gap / $monthCount, 2);
    }

    /**
     * Valor atual da meta: saldo da conta de destino (referência dinâmica) ou só aportes confirmados.
     *
     * @param array<string, mixed> $goal
     */
    public static function currentAmountForGoal(
        PDO $pdo,
        int $planningId,
        array $goal,
        ?string $asOf = null
    ): float {
        $asOf ??= date('Y-m-d');
        $accountId = !empty($goal['target_financial_account_id'])
            ? (int) $goal['target_financial_account_id']
            : 0;

        if ($accountId > 0) {
            $stmt = $pdo->prepare(
                'SELECT * FROM financial_accounts WHERE id = ? AND planning_id = ? AND active = 1'
            );
            $stmt->execute([$accountId, $planningId]);
            $account = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($account) {
                $accCurrency = (string) ($account['currency'] ?? 'BRL');
                $rate = MoneyHelper::getFxFallback(
                    $pdo,
                    $planningId,
                    $accCurrency === 'BRL' ? 'EUR' : $accCurrency
                );
                $bal = AccountService::balanceAtDate($pdo, $account, $asOf, $rate);

                return round(AccountService::balanceToBrl($bal, $accCurrency, $rate), 2);
            }
        }

        $goalId = (int) ($goal['id'] ?? 0);
        if ($goalId <= 0) {
            return 0.0;
        }

        return round(self::confirmedContributions($pdo, $planningId, $goalId), 2);
    }

    /** Quanto falta para a meta: valor alvo − valor atual (conta ou aportes). */
    public static function remainingGap(PDO $pdo, int $planningId, array $goal): float
    {
        $target = (float) $goal['target_amount_brl'];
        $current = self::currentAmountForGoal($pdo, $planningId, $goal);

        return round(max(0, $target - $current), 2);
    }

    /** Meses do plano a partir de (year, month) até o fim da meta (inclusive). */
    public static function monthsLeftFrom(
        string $startDate,
        string $endDate,
        int $year,
        int $month
    ): int {
        $count = 0;
        foreach (self::monthsInRange($startDate, $endDate) as $ym) {
            if ($ym['year'] < $year || ($ym['year'] === $year && $ym['month'] < $month)) {
                continue;
            }
            $count++;
        }

        return $count;
    }

    /**
     * Parcela mensal uniforme: falta atual ÷ meses restantes a partir do mês de referência.
     * Mesmo valor em todos os meses do plano/dashboard até novo recálculo (ex.: saldo da conta mudou).
     *
     * @param array<string, mixed> $goal
     */
    public static function uniformMonthlyInstallment(
        PDO $pdo,
        int $planningId,
        array $goal,
        ?int $refYear = null,
        ?int $refMonth = null
    ): float {
        $remaining = self::remainingGap($pdo, $planningId, $goal);
        if ($remaining <= 0) {
            return 0.0;
        }

        $startDate = (string) ($goal['start_date'] ?? '');
        $endDate = (string) ($goal['end_date'] ?? '');
        if ($startDate === '' || $endDate === '') {
            return 0.0;
        }

        $refYear ??= (int) date('Y');
        $refMonth ??= (int) date('n');
        $monthsLeft = self::monthsLeftFrom($startDate, $endDate, $refYear, $refMonth);
        if ($monthsLeft <= 0) {
            return 0.0;
        }

        return round($remaining / $monthsLeft, 2);
    }

    /**
     * Aporte sugerido para pendências (mesma parcela em todos os meses; recalcula com saldo da conta).
     *
     * @param array<string, mixed> $goal
     */
    public static function suggestedAmountForEntry(
        PDO $pdo,
        int $planningId,
        array $goal,
        int $entryYear,
        int $entryMonth
    ): float {
        return self::uniformMonthlyInstallment($pdo, $planningId, $goal);
    }

    public static function recalculatePendingAmounts(PDO $pdo, int $planningId, int $goalId): void
    {
        $stmt = $pdo->prepare(
            'SELECT * FROM financial_goals WHERE id = ? AND planning_id = ? AND is_active = 1'
        );
        $stmt->execute([$goalId, $planningId]);
        $goal = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$goal || empty($goal['start_date']) || empty($goal['end_date'])) {
            return;
        }

        $pending = $pdo->prepare(
            'SELECT id, year, month FROM month_plan_entries
             WHERE planning_id = ? AND financial_goal_id = ? AND status = ?
             ORDER BY year, month'
        );
        $pending->execute([$planningId, $goalId, 'pending']);

        $update = $pdo->prepare(
            'UPDATE month_plan_entries
             SET suggested_amount_brl = ?, suggested_amount = ?
             WHERE id = ? AND planning_id = ? AND status = ?'
        );

        $amount = self::uniformMonthlyInstallment($pdo, $planningId, $goal);

        foreach ($pending->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $update->execute([
                $amount,
                $amount,
                (int) $row['id'],
                $planningId,
                'pending',
            ]);
        }

        $current = self::currentAmountForGoal($pdo, $planningId, $goal);
        $pdo->prepare(
            'UPDATE financial_goals SET current_amount_brl = ? WHERE id = ? AND planning_id = ?'
        )->execute([$current, $goalId, $planningId]);
    }

    /** Atualiza valores pendentes de todas as metas ativas do planejamento. */
    public static function refreshAllPendingAmounts(PDO $pdo, int $planningId): void
    {
        $stmt = $pdo->prepare(
            'SELECT id FROM financial_goals WHERE planning_id = ? AND is_active = 1'
        );
        $stmt->execute([$planningId]);
        foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $goalId) {
            self::recalculatePendingAmounts($pdo, $planningId, (int) $goalId);
        }
    }

    /** Recalcula metas vinculadas à conta (ex.: recebimento variável na PicPay). */
    public static function refreshGoalsForAccount(PDO $pdo, int $planningId, int $accountId): void
    {
        if ($accountId <= 0) {
            return;
        }
        $stmt = $pdo->prepare(
            'SELECT id FROM financial_goals
             WHERE planning_id = ? AND is_active = 1 AND target_financial_account_id = ?'
        );
        $stmt->execute([$planningId, $accountId]);
        foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $goalId) {
            self::recalculatePendingAmounts($pdo, $planningId, (int) $goalId);
        }
    }

    /** @return list<array{year: int, month: int}> */
    public static function monthsInRange(string $startDate, string $endDate): array
    {
        $cursor = new \DateTimeImmutable($startDate);
        $end = new \DateTimeImmutable($endDate);
        $cursor = $cursor->modify('first day of this month');
        $endMonth = $end->modify('first day of this month');
        $out = [];

        while ($cursor <= $endMonth) {
            $out[] = [
                'year' => (int) $cursor->format('Y'),
                'month' => (int) $cursor->format('n'),
            ];
            $cursor = $cursor->modify('+1 month');
        }

        return $out;
    }

    /**
     * Estimativa linear até uma data: parte do saldo da conta no início do período até o alvo.
     *
     * @param array<string, mixed> $goal
     */
    public static function plannedAmountAtDate(
        PDO $pdo,
        int $planningId,
        array $goal,
        ?string $asOf = null
    ): float {
        $asOf = $asOf ?? date('Y-m-d');
        $targetAmount = (float) $goal['target_amount_brl'];
        $startDate = (string) ($goal['start_date'] ?? '');
        $endDate = (string) ($goal['end_date'] ?? '');
        if ($startDate === '' || $endDate === '') {
            return self::currentAmountForGoal($pdo, $planningId, $goal, $asOf);
        }

        if ($asOf < $startDate) {
            return self::currentAmountForGoal($pdo, $planningId, $goal, $startDate);
        }
        if ($asOf >= $endDate) {
            return $targetAmount;
        }

        $baseline = self::currentAmountForGoal($pdo, $planningId, $goal, $startDate);
        $months = self::monthCount($startDate, $endDate);
        $monthly = self::monthlyAmount($baseline, $targetAmount, $months);
        $start = new \DateTimeImmutable($startDate);
        $asOfDt = new \DateTimeImmutable($asOf);
        $elapsed = ($asOfDt->format('Y') - $start->format('Y')) * 12
            + (int) $asOfDt->format('n') - (int) $start->format('n') + 1;
        $elapsed = max(0, min($months, $elapsed));

        return round(min($targetAmount, $baseline + $monthly * $elapsed), 2);
    }

    public static function syncPlanEntries(PDO $pdo, int $planningId, int $goalId): void
    {
        $stmt = $pdo->prepare(
            'SELECT * FROM financial_goals WHERE id = ? AND planning_id = ? AND is_active = 1'
        );
        $stmt->execute([$goalId, $planningId]);
        $goal = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$goal || empty($goal['start_date']) || empty($goal['end_date'])) {
            return;
        }

        $startDate = (string) $goal['start_date'];
        $endDate = (string) $goal['end_date'];
        $dueDay = $goal['due_day'] !== null ? min(28, max(1, (int) $goal['due_day'])) : 1;
        $ownerId = PlanningService::ownerUserId($pdo, $planningId);

        $rangeMonths = self::monthsInRange($startDate, $endDate);
        $keepKeys = [];

        $insert = $pdo->prepare(
            'INSERT INTO month_plan_entries
             (user_id, planning_id, year, month, recurring_item_id, financial_goal_id, kind, name, category, region,
              responsible, responsible_user_id, due_day, investment_type_id, financial_account_id,
              source_financial_account_id, suggested_amount_brl, currency, suggested_amount, status)
             VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, ?, ?, ?, ?, ?, ?)'
        );

        $updatePending = $pdo->prepare(
            'UPDATE month_plan_entries SET
               name = ?, category = ?, due_day = ?, financial_account_id = ?,
               source_financial_account_id = ?, suggested_amount_brl = ?, suggested_amount = ?
             WHERE id = ? AND planning_id = ? AND status = ?'
        );

        foreach ($rangeMonths as $ym) {
            $key = $ym['year'] . '-' . $ym['month'];
            $keepKeys[$key] = true;
            $monthly = self::suggestedAmountForEntry($pdo, $planningId, $goal, $ym['year'], $ym['month']);

            $check = $pdo->prepare(
                'SELECT id, status FROM month_plan_entries
                 WHERE planning_id = ? AND year = ? AND month = ? AND financial_goal_id = ?'
            );
            $check->execute([$planningId, $ym['year'], $ym['month'], $goalId]);
            $existing = $check->fetch(PDO::FETCH_ASSOC);

            if ($existing) {
                if ($existing['status'] === 'pending') {
                    $updatePending->execute([
                        $goal['name'],
                        'Meta',
                        $dueDay,
                        $goal['target_financial_account_id'],
                        $goal['source_financial_account_id'],
                        $monthly,
                        $monthly,
                        (int) $existing['id'],
                        $planningId,
                        'pending',
                    ]);
                }
                continue;
            }

            $insert->execute([
                $ownerId,
                $planningId,
                $ym['year'],
                $ym['month'],
                $goalId,
                'investment',
                $goal['name'],
                'Meta',
                'geral',
                ResponsibleUser::JOINT_LABEL,
                $dueDay,
                $goal['target_financial_account_id'],
                $goal['source_financial_account_id'],
                $monthly,
                'BRL',
                $monthly,
                'pending',
            ]);
        }

        self::removeOrphanPending($pdo, $planningId, $goalId, $keepKeys);
        self::recalculatePendingAmounts($pdo, $planningId, $goalId);
    }

    /** @param array<string, true> $keepKeys year-month keys to retain */
    private static function removeOrphanPending(
        PDO $pdo,
        int $planningId,
        int $goalId,
        array $keepKeys
    ): void {
        $stmt = $pdo->prepare(
            'SELECT id, year, month FROM month_plan_entries
             WHERE planning_id = ? AND financial_goal_id = ? AND status = ?'
        );
        $stmt->execute([$planningId, $goalId, 'pending']);
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $key = $row['year'] . '-' . $row['month'];
            if (!isset($keepKeys[$key])) {
                $pdo->prepare('DELETE FROM month_plan_entries WHERE id = ?')->execute([(int) $row['id']]);
            }
        }
    }

    public static function removeFuturePending(PDO $pdo, int $planningId, int $goalId): void
    {
        $when = ProjectionService::sqlCurrentOrFutureMonthClause('year', 'month');
        $pdo->prepare(
            "DELETE FROM month_plan_entries
             WHERE planning_id = ? AND financial_goal_id = ? AND status = 'pending' AND {$when}"
        )->execute([$planningId, $goalId]);
    }

    public static function confirmedContributions(PDO $pdo, int $planningId, int $goalId): float
    {
        $stmt = $pdo->prepare(
            "SELECT COALESCE(SUM(COALESCE(confirmed_amount_brl, suggested_amount_brl)), 0)
             FROM month_plan_entries
             WHERE planning_id = ? AND financial_goal_id = ? AND status = 'confirmed'"
        );
        $stmt->execute([$planningId, $goalId]);

        return (float) $stmt->fetchColumn();
    }

    public static function projectedForMonth(PDO $pdo, int $planningId, int $goalId, int $year, int $month): float
    {
        $stmt = $pdo->prepare(
            "SELECT COALESCE(SUM(suggested_amount_brl), 0) FROM month_plan_entries
             WHERE planning_id = ? AND financial_goal_id = ? AND year = ? AND month = ?
               AND status IN ('pending', 'confirmed')"
        );
        $stmt->execute([$planningId, $goalId, $year, $month]);

        return (float) $stmt->fetchColumn();
    }
}
