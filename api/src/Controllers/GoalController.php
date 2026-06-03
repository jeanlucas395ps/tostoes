<?php

declare(strict_types=1);

namespace Gastos\Api\Controllers;

use Gastos\Api\Auth;
use Gastos\Api\Database;
use Gastos\Api\Response;
use Gastos\Api\Services\AccountService;
use Gastos\Api\Services\GoalPlanService;
use PDO;

final class GoalController
{
    public static function index(): void
    {
        Auth::requireUser();
        $planningId = Auth::requirePlanningId();
        $year = isset($_GET['year']) ? (int) $_GET['year'] : (int) date('Y');
        $month = isset($_GET['month']) ? (int) $_GET['month'] : (int) date('n');
        $pdo = Database::connection();
        $stmt = $pdo->prepare(
            'SELECT * FROM financial_goals
             WHERE planning_id = ? AND is_active = 1
             ORDER BY sort_order, name'
        );
        $stmt->execute([$planningId]);
        $items = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $items[] = self::map($pdo, $row, $planningId, $year, $month);
        }
        Response::json(['items' => $items, 'year' => $year, 'month' => $month]);
    }

    public static function store(): void
    {
        Auth::requireUser();
        $planningId = Auth::requirePlanningId();
        $body = json_decode(file_get_contents('php://input') ?: '{}', true) ?? [];
        $name = trim((string) ($body['name'] ?? ''));
        if ($name === '') {
            Response::error('Nome obrigatório.', 422);
        }
        $dates = GoalPlanService::parseDates($body);
        $targetAmount = (float) ($body['targetAmountBrl'] ?? 0);
        if ($targetAmount <= 0) {
            Response::error('Informe o valor final da meta.', 422);
        }

        $pdo = Database::connection();
        $sourceId = self::resolveSourceAccountId($pdo, $planningId, $body, true);
        $targetId = self::resolveTargetAccountId($pdo, $planningId, $body, false);
        $dueDay = isset($body['dueDay']) ? min(28, max(1, (int) $body['dueDay'])) : 1;

        $goalStub = [
            'id' => 0,
            'target_financial_account_id' => $targetId,
            'start_date' => $dates['start'],
            'end_date' => $dates['end'],
        ];
        $current = GoalPlanService::currentAmountForGoal($pdo, $planningId, $goalStub);
        if ($targetAmount <= $current) {
            Response::error(
                'O valor final deve ser maior que o saldo atual da conta de destino ('
                . number_format($current, 2, ',', '.') . ').',
                422
            );
        }

        $stmt = $pdo->prepare(
            'INSERT INTO financial_goals
             (planning_id, name, description, color, target_amount_brl, start_amount_brl, current_amount_brl,
              start_date, end_date, deadline_date, due_day, investment_type_id,
              source_financial_account_id, target_financial_account_id, sort_order)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)'
        );
        $stmt->execute([
            $planningId,
            $name,
            trim((string) ($body['description'] ?? '')) ?: null,
            $body['color'] ?? '#00AB55',
            $targetAmount,
            $current,
            $current,
            $dates['start'],
            $dates['end'],
            $dates['end'],
            $dueDay,
            $sourceId,
            $targetId,
            (int) ($body['sortOrder'] ?? 0),
        ]);
        $id = (int) $pdo->lastInsertId();
        GoalPlanService::syncPlanEntries($pdo, $planningId, $id);
        self::show($id, $planningId);
    }

    public static function update(int $id): void
    {
        Auth::requireUser();
        $planningId = Auth::requirePlanningId();
        $body = json_decode(file_get_contents('php://input') ?: '{}', true) ?? [];
        $pdo = Database::connection();
        $row = self::fetch($pdo, $id, $planningId);

        $sourceId = array_key_exists('sourceFinancialAccountId', $body)
            ? self::resolveSourceAccountId($pdo, $planningId, $body, true)
            : null;
        $targetId = array_key_exists('targetFinancialAccountId', $body)
            ? self::resolveTargetAccountId($pdo, $planningId, $body, true)
            : null;

        $startDate = isset($body['startDate']) ? trim((string) $body['startDate']) : null;
        $endDate = isset($body['endDate'])
            ? trim((string) $body['endDate'])
            : (isset($body['deadlineDate']) ? trim((string) $body['deadlineDate']) : null);

        $pdo->prepare(
            'UPDATE financial_goals SET
               name = COALESCE(?, name),
               description = COALESCE(?, description),
               color = COALESCE(?, color),
               target_amount_brl = COALESCE(?, target_amount_brl),
               start_date = COALESCE(?, start_date),
               end_date = COALESCE(?, end_date),
               deadline_date = COALESCE(?, deadline_date),
               due_day = COALESCE(?, due_day),
               source_financial_account_id = COALESCE(?, source_financial_account_id),
               target_financial_account_id = COALESCE(?, target_financial_account_id),
               sort_order = COALESCE(?, sort_order)
             WHERE id = ? AND planning_id = ?'
        )->execute([
            isset($body['name']) ? trim((string) $body['name']) : null,
            array_key_exists('description', $body) ? (trim((string) $body['description']) ?: null) : null,
            $body['color'] ?? null,
            isset($body['targetAmountBrl']) ? (float) $body['targetAmountBrl'] : null,
            $startDate ?: null,
            $endDate ?: null,
            $endDate ?: null,
            isset($body['dueDay']) ? min(28, max(1, (int) $body['dueDay'])) : null,
            $sourceId,
            $targetId,
            isset($body['sortOrder']) ? (int) $body['sortOrder'] : null,
            $id,
            $planningId,
        ]);

        $row = self::fetch($pdo, $id, $planningId);
        $target = (float) $row['target_amount_brl'];
        $current = GoalPlanService::currentAmountForGoal($pdo, $planningId, $row);
        if ($target <= $current) {
            Response::error(
                'O valor final deve ser maior que o saldo atual da conta de destino.',
                422
            );
        }

        GoalPlanService::syncPlanEntries($pdo, $planningId, $id);

        $year = isset($_GET['year']) ? (int) $_GET['year'] : (int) date('Y');
        $month = isset($_GET['month']) ? (int) $_GET['month'] : (int) date('n');
        Response::json([
            'item' => self::map($pdo, self::fetch($pdo, $id, $planningId), $planningId, $year, $month),
        ]);
    }

    public static function destroy(int $id): void
    {
        Auth::requireUser();
        $planningId = Auth::requirePlanningId();
        $pdo = Database::connection();
        self::fetch($pdo, $id, $planningId);
        GoalPlanService::removeFuturePending($pdo, $planningId, $id);
        $pdo->prepare('UPDATE financial_goals SET is_active = 0 WHERE id = ? AND planning_id = ?')
            ->execute([$id, $planningId]);
        Response::json(['ok' => true]);
    }

    private static function show(int $id, int $planningId): void
    {
        $pdo = Database::connection();
        $year = (int) date('Y');
        $month = (int) date('n');
        Response::json([
            'item' => self::map($pdo, self::fetch($pdo, $id, $planningId), $planningId, $year, $month),
        ], 201);
    }

    private static function fetch(PDO $pdo, int $id, int $planningId): array
    {
        $stmt = $pdo->prepare(
            'SELECT * FROM financial_goals WHERE id = ? AND planning_id = ? AND is_active = 1'
        );
        $stmt->execute([$id, $planningId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            Response::error('Meta não encontrada.', 404);
        }

        return $row;
    }

    private static function map(PDO $pdo, array $row, int $planningId, int $year, int $month): array
    {
        $goalId = (int) $row['id'];
        $target = (float) $row['target_amount_brl'];
        $startDate = $row['start_date'] ?? $row['deadline_date'] ?? null;
        $endDate = $row['end_date'] ?? $row['deadline_date'] ?? null;
        $tracksAccount = !empty($row['target_financial_account_id']);

        $monthCount = ($startDate && $endDate)
            ? GoalPlanService::monthCount((string) $startDate, (string) $endDate)
            : 1;

        $confirmed = GoalPlanService::confirmedContributions($pdo, $planningId, $goalId);
        $current = GoalPlanService::currentAmountForGoal($pdo, $planningId, $row);
        $remaining = GoalPlanService::remainingGap($pdo, $planningId, $row);
        $monthly = ($startDate && $endDate)
            ? GoalPlanService::suggestedAmountForEntry($pdo, $planningId, $row, $year, $month)
            : 0.0;
        $plannedToday = ($startDate && $endDate)
            ? GoalPlanService::plannedAmountAtDate($pdo, $planningId, $row)
            : $current;

        $projectedMonth = GoalPlanService::projectedForMonth($pdo, $planningId, $goalId, $year, $month);

        $pct = $target > 0 ? (int) min(100, round(100 * $current / $target)) : 0;
        $plannedPct = $target > 0
            ? (int) min(100, round(100 * $plannedToday / $target))
            : 0;
        $confirmedPct = $tracksAccount
            ? $pct
            : ($target > 0 ? (int) min(100, round(100 * $confirmed / $target)) : 0);

        $timelinePct = 0;
        if ($startDate && $endDate) {
            $start = new \DateTimeImmutable((string) $startDate);
            $end = new \DateTimeImmutable((string) $endDate);
            $today = new \DateTimeImmutable('today');
            if ($today >= $end) {
                $timelinePct = 100;
            } elseif ($today > $start) {
                $totalDays = max(1, $end->diff($start)->days);
                $elapsed = $today->diff($start)->days;
                $timelinePct = (int) min(100, round(($elapsed / $totalDays) * 100));
            }
        }

        $sourceName = !empty($row['source_financial_account_id'])
            ? self::accountName($pdo, $planningId, (int) $row['source_financial_account_id'])
            : null;
        $targetName = !empty($row['target_financial_account_id'])
            ? self::accountName($pdo, $planningId, (int) $row['target_financial_account_id'])
            : null;

        return [
            'id' => $goalId,
            'name' => $row['name'],
            'description' => $row['description'],
            'color' => $row['color'],
            'targetAmountBrl' => $target,
            'currentAmountBrl' => $current,
            'confirmedContributionsBrl' => $confirmed,
            'plannedAmountBrl' => $plannedToday,
            'monthlyAmountBrl' => $monthly,
            'remainingAmountBrl' => $remaining,
            'monthCount' => $monthCount,
            'projectedMonthBrl' => $projectedMonth,
            'tracksAccountBalance' => $tracksAccount,
            'startDate' => $startDate,
            'endDate' => $endDate,
            'deadlineDate' => $endDate,
            'dueDay' => $row['due_day'] !== null ? (int) $row['due_day'] : 1,
            'sourceFinancialAccountId' => !empty($row['source_financial_account_id'])
                ? (int) $row['source_financial_account_id'] : null,
            'sourceFinancialAccountName' => $sourceName,
            'targetFinancialAccountId' => !empty($row['target_financial_account_id'])
                ? (int) $row['target_financial_account_id'] : null,
            'targetFinancialAccountName' => $targetName,
            'sortOrder' => (int) $row['sort_order'],
            'pct' => $pct,
            'plannedPct' => $plannedPct,
            'confirmedBarPct' => $confirmedPct,
            'timelinePct' => $timelinePct,
            'overTarget' => $current >= $target,
            'tracksInvestment' => false,
        ];
    }

    /** @param array<string, mixed> $body */
    private static function resolveSourceAccountId(PDO $pdo, int $planningId, array $body, bool $allowNull = false): ?int
    {
        $id = isset($body['sourceFinancialAccountId']) ? (int) $body['sourceFinancialAccountId'] : 0;
        if ($id <= 0) {
            if ($allowNull) {
                return null;
            }
            Response::error('Selecione a conta bancária de saída.', 422);
        }

        return AccountService::validateAccountId($pdo, $planningId, $id, 'bank');
    }

    /** @param array<string, mixed> $body */
    private static function resolveTargetAccountId(PDO $pdo, int $planningId, array $body, bool $allowNull = false): ?int
    {
        $id = isset($body['targetFinancialAccountId']) ? (int) $body['targetFinancialAccountId'] : 0;
        if ($id <= 0) {
            if ($allowNull) {
                return null;
            }
            Response::error(
                'Selecione a conta de investimento de destino. O progresso da meta usa o saldo atual dessa conta.',
                422
            );
        }

        return AccountService::validateAccountId($pdo, $planningId, $id, 'investment');
    }

    private static function accountName(PDO $pdo, int $planningId, int $accountId): ?string
    {
        $stmt = $pdo->prepare(
            'SELECT name FROM financial_accounts WHERE id = ? AND planning_id = ? AND active = 1'
        );
        $stmt->execute([$accountId, $planningId]);
        $name = $stmt->fetchColumn();

        return $name !== false ? (string) $name : null;
    }
}
