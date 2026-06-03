<?php

declare(strict_types=1);

namespace Gastos\Api\Controllers;

use Gastos\Api\Auth;
use Gastos\Api\Database;
use Gastos\Api\MoneyHelper;
use Gastos\Api\Response;
use Gastos\Api\ResponsibleUser;
use Gastos\Api\Services\AccountService;
use Gastos\Api\Services\GoalPlanService;
use Gastos\Api\Services\MonthPlanService;
use Gastos\Api\Services\PlanningService;
use PDO;

final class MonthPlanController
{
    public static function index(): void
    {
        Auth::requireUser();
        $planningId = Auth::requirePlanningId();
        [$year, $month] = self::yearMonthFromQuery();

        $pdo = Database::connection();
        Response::json(MonthPlanService::getPlan($pdo, $planningId, $year, $month));
    }

    public static function regenerate(): void
    {
        Auth::requireUser();
        $planningId = Auth::requirePlanningId();
        [$year, $month] = self::yearMonthFromQuery();

        $pdo = Database::connection();
        MonthPlanService::regenerate($pdo, $planningId, $year, $month);
        Response::json(MonthPlanService::getPlan($pdo, $planningId, $year, $month));
    }

    public static function spawn(): void
    {
        Auth::requireUser();
        $planningId = Auth::requirePlanningId();
        $body = json_decode(file_get_contents('php://input') ?: '{}', true) ?? [];

        $year = (int) ($body['year'] ?? 0);
        $month = (int) ($body['month'] ?? 0);
        $recurringId = (int) ($body['recurringItemId'] ?? 0);
        if ($year < 2000 || $month < 1 || $month > 12 || $recurringId <= 0) {
            Response::error('Parâmetros inválidos.', 422);
        }

        $pdo = Database::connection();
        $stmt = $pdo->prepare(
            'SELECT r.*, COALESCE(a.amount_brl, r.default_amount_brl, 0) AS amount_brl
             FROM recurring_items r
             LEFT JOIN recurring_item_amounts a ON a.recurring_item_id = r.id AND a.month = ?
             WHERE r.id = ? AND r.planning_id = ? AND r.active = 1'
        );
        $stmt->execute([$month, $recurringId, $planningId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            Response::error('Item fixo não encontrado.', 404);
        }

        $check = $pdo->prepare(
            'SELECT id FROM month_plan_entries
             WHERE planning_id = ? AND year = ? AND month = ? AND recurring_item_id = ?'
        );
        $check->execute([$planningId, $year, $month, $recurringId]);
        if ($check->fetch()) {
            Response::json(MonthPlanService::getPlan($pdo, $planningId, $year, $month));
            return;
        }

        $money = MoneyHelper::parseInput($pdo, $planningId, array_merge($body, [
            'currency' => $body['currency'] ?? $row['currency'] ?? 'BRL',
            'amount' => $body['amount'] ?? $row['amount_original'] ?? $row['amount_brl'],
        ]));
        $dueDay = $row['due_day'] !== null ? (int) $row['due_day'] : 1;
        $ownerId = PlanningService::ownerUserId($pdo, $planningId);

        $pdo->prepare(
            'INSERT INTO month_plan_entries
             (user_id, planning_id, year, month, recurring_item_id, kind, name, category, region,
              responsible, responsible_user_id, due_day, investment_type_id,
              suggested_amount_brl, currency, suggested_amount, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )->execute([
            $ownerId,
            $planningId,
            $year,
            $month,
            $recurringId,
            $row['kind'],
            $row['name'],
            $row['category'],
            $row['region'],
            $row['responsible'],
            $row['responsible_user_id'] ?? null,
            $dueDay,
            $row['investment_type_id'],
            $money['amountBrl'],
            $money['currency'],
            $money['amount'],
            'pending',
        ]);

        Response::json(MonthPlanService::getPlan($pdo, $planningId, $year, $month), 201);
    }

    public static function store(): void
    {
        Auth::requireUser();
        $planningId = Auth::requirePlanningId();
        $body = json_decode(file_get_contents('php://input') ?: '{}', true) ?? [];

        $year = (int) ($body['year'] ?? 0);
        $month = (int) ($body['month'] ?? 0);
        $kind = $body['kind'] ?? '';
        if ($year < 2000 || $month < 1 || $month > 12) {
            Response::error('Ano/mês inválidos.', 422);
        }
        if (!in_array($kind, ['income', 'expense', 'investment', 'leisure'], true)) {
            Response::error('Tipo inválido.', 422);
        }

        $name = trim((string) ($body['name'] ?? ''));
        if ($name === '') {
            Response::error('Nome obrigatório.', 422);
        }

        $pdo = Database::connection();
        $responsible = ResponsibleUser::parseFromBody($pdo, $body, $planningId);
        $money = MoneyHelper::parseInput($pdo, $planningId, $body);
        $taxonomy = PlanningTaxonomyController::resolveEntryTaxonomy($pdo, $planningId, $body, 'Geral');
        $ownerId = PlanningService::ownerUserId($pdo, $planningId);
        $stmt = $pdo->prepare(
            'INSERT INTO month_plan_entries
             (user_id, planning_id, year, month, kind, name, category, region, custom_tab_id, item_category_id,
              responsible, responsible_user_id, due_day, investment_type_id, financial_account_id,
              suggested_amount_brl, currency, suggested_amount, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $ownerId,
            $planningId,
            $year,
            $month,
            $kind,
            $name,
            $taxonomy['category'],
            $taxonomy['region'],
            $taxonomy['customTabId'],
            $taxonomy['itemCategoryId'],
            $responsible['responsible'],
            $responsible['responsibleUserId'],
            isset($body['dueDay']) ? (int) $body['dueDay'] : (int) date('j'),
            $body['investmentTypeId'] ?? null,
            $body['financialAccountId'] ?? null,
            $money['amountBrl'],
            $money['currency'],
            $money['amount'],
            'pending',
        ]);

        Response::json(
            MonthPlanService::getPlan($pdo, $planningId, $year, $month),
            201
        );
    }

    public static function update(int $id): void
    {
        Auth::requireUser();
        $planningId = Auth::requirePlanningId();
        $body = json_decode(file_get_contents('php://input') ?: '{}', true) ?? [];

        $pdo = Database::connection();
        $entry = self::fetchEntry($pdo, $id, $planningId);
        if ($entry['status'] !== 'pending') {
            Response::error('Só é possível editar itens pendentes.', 422);
        }

        $money = MoneyHelper::parseInput($pdo, $planningId, array_merge($body, [
            'currency' => $body['currency'] ?? $entry['currency'] ?? 'BRL',
            'amount' => $body['suggestedAmount']
                ?? $body['amount']
                ?? ($entry['suggested_amount'] ?: $entry['suggested_amount_brl']),
        ]));

        $isVariable = $entry['recurring_item_id'] === null;
        if ($isVariable) {
            $kind = $body['kind'] ?? $entry['kind'];
            if (!in_array($kind, ['income', 'expense', 'investment', 'leisure'], true)) {
                Response::error('Tipo inválido.', 422);
            }
            $name = trim((string) ($body['name'] ?? $entry['name']));
            if ($name === '') {
                Response::error('Nome obrigatório.', 422);
            }
            $responsible = ResponsibleUser::parseFromBody($pdo, $body, $planningId);
            $taxonomy = PlanningTaxonomyController::resolveEntryTaxonomy($pdo, $planningId, array_merge($body, [
                'category' => $body['category'] ?? $entry['category'],
                'customTabId' => $body['customTabId'] ?? $entry['custom_tab_id'] ?? null,
                'itemCategoryId' => $body['itemCategoryId'] ?? $entry['item_category_id'] ?? null,
                'region' => $body['region'] ?? $entry['region'],
            ]), 'Geral');
            $investmentTypeId = array_key_exists('investmentTypeId', $body)
                ? (!empty($body['investmentTypeId']) ? (int) $body['investmentTypeId'] : null)
                : ($entry['investment_type_id'] ?? null);
            $financialAccountId = array_key_exists('financialAccountId', $body)
                ? (!empty($body['financialAccountId']) ? (int) $body['financialAccountId'] : null)
                : ($entry['financial_account_id'] ?? null);

            $pdo->prepare(
                'UPDATE month_plan_entries
                 SET suggested_amount_brl = ?, suggested_amount = ?, currency = ?,
                     kind = ?, name = ?, category = ?, region = ?, custom_tab_id = ?, item_category_id = ?,
                     responsible = ?, responsible_user_id = ?,
                     investment_type_id = ?, financial_account_id = ?
                 WHERE id = ? AND planning_id = ?'
            )->execute([
                $money['amountBrl'],
                $money['amount'],
                $money['currency'],
                $kind,
                $name,
                $taxonomy['category'],
                $taxonomy['region'],
                $taxonomy['customTabId'],
                $taxonomy['itemCategoryId'],
                $responsible['responsible'],
                $responsible['responsibleUserId'],
                $investmentTypeId,
                $financialAccountId,
                $id,
                $planningId,
            ]);
        } else {
            $pdo->prepare(
                'UPDATE month_plan_entries
                 SET suggested_amount_brl = ?, suggested_amount = ?, currency = ?
                 WHERE id = ? AND planning_id = ?'
            )->execute([
                $money['amountBrl'],
                $money['amount'],
                $money['currency'],
                $id,
                $planningId,
            ]);
        }

        Response::json(MonthPlanService::getPlan(
            $pdo,
            $planningId,
            (int) $entry['year'],
            (int) $entry['month']
        ));
    }

    public static function confirm(int $id): void
    {
        $registeredBy = Auth::requireUser();
        $planningId = Auth::requirePlanningId();
        $body = json_decode(file_get_contents('php://input') ?: '{}', true) ?? [];

        $pdo = Database::connection();
        $entry = self::fetchEntry($pdo, $id, $planningId);
        if ($entry['status'] === 'confirmed') {
            Response::error('Item já confirmado.', 422);
        }

        $year = (int) $entry['year'];
        $month = (int) $entry['month'];
        $dueDay = $entry['due_day'] ? (int) $entry['due_day'] : (int) date('j');
        $dueDay = min(max($dueDay, 1), 28);
        $date = $body['transactionDate'] ?? sprintf('%04d-%02d-%02d', $year, $month, $dueDay);

        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
            Response::error('Data inválida.', 422);
        }

        $money = MoneyHelper::parseInput($pdo, $planningId, array_merge($body, [
            'currency' => $body['currency'] ?? $entry['currency'] ?? 'BRL',
            'transactionDate' => $date,
            'amount' => $body['amount']
                ?? ($entry['suggested_amount'] ?: null)
                ?? ($body['amountBrl'] ?? $entry['suggested_amount_brl']),
        ]));

        if ($money['amountBrl'] <= 0 && $entry['kind'] !== 'income') {
            Response::error('Informe um valor maior que zero ou pule o item.', 422);
        }

        $accountsToRefresh = [];

        $pdo->beginTransaction();
        try {
            $ownerId = PlanningService::ownerUserId($pdo, $planningId);

            if ($entry['kind'] === 'investment') {
                $targetId = (int) ($body['targetAccountId'] ?? $entry['financial_account_id'] ?? 0);
                $bankId = (int) ($body['accountId'] ?? $entry['source_financial_account_id'] ?? 0);
                $transfer = AccountService::validateInvestmentTransfer(
                    $pdo,
                    $planningId,
                    $bankId,
                    $targetId
                );
                $invAccount = self::fetchAccountName(
                    $pdo,
                    $planningId,
                    $transfer['investmentAccountId']
                );
                $bankAccount = self::fetchAccountName($pdo, $planningId, $transfer['bankAccountId']);

                $txId = self::insertTransaction($pdo, [
                    'userId' => $ownerId,
                    'planningId' => $planningId,
                    'accountId' => $transfer['bankAccountId'],
                    'registeredBy' => $registeredBy,
                    'date' => $date,
                    'kind' => 'investment',
                    'description' => $entry['name'],
                    'amount' => $money['amount'],
                    'currency' => $money['currency'],
                    'amountBrl' => $money['amountBrl'],
                    'eurToBrl' => $money['eurToBrl'],
                    'category' => $entry['category'],
                    'region' => $entry['region'],
                    'responsible' => $entry['responsible'],
                    'responsibleUserId' => $entry['responsible_user_id'] ?? null,
                    'investmentTypeId' => $entry['investment_type_id'],
                    'notes' => "Aporte → {$invAccount} (confirmado no plano)",
                ]);

                $invTxId = self::insertTransaction($pdo, [
                    'userId' => $ownerId,
                    'planningId' => $planningId,
                    'accountId' => $transfer['investmentAccountId'],
                    'registeredBy' => $registeredBy,
                    'date' => $date,
                    'kind' => 'income',
                    'description' => $entry['name'],
                    'amount' => $money['amount'],
                    'currency' => $money['currency'],
                    'amountBrl' => $money['amountBrl'],
                    'eurToBrl' => $money['eurToBrl'],
                    'category' => $entry['category'],
                    'region' => $entry['region'],
                    'responsible' => $entry['responsible'],
                    'responsibleUserId' => $entry['responsible_user_id'] ?? null,
                    'investmentTypeId' => $entry['investment_type_id'],
                    'notes' => "Aporte ← {$bankAccount} (#{$txId})",
                ]);

                $pdo->prepare('UPDATE transactions SET notes = ? WHERE id = ? AND planning_id = ?')
                    ->execute([
                        "Aporte → {$invAccount} (#{$invTxId})",
                        $txId,
                        $planningId,
                    ]);
                $accountsToRefresh[] = $transfer['investmentAccountId'];
            } else {
                $accountId = AccountService::validateAccountId(
                    $pdo,
                    $planningId,
                    (int) ($body['accountId'] ?? 0)
                );
                $txId = self::insertTransaction($pdo, [
                    'userId' => $ownerId,
                    'planningId' => $planningId,
                    'accountId' => $accountId,
                    'registeredBy' => $registeredBy,
                    'date' => $date,
                    'kind' => $entry['kind'],
                    'description' => $entry['name'],
                    'amount' => $money['amount'],
                    'currency' => $money['currency'],
                    'amountBrl' => $money['amountBrl'],
                    'eurToBrl' => $money['eurToBrl'],
                    'category' => $entry['category'],
                    'region' => $entry['region'],
                    'responsible' => $entry['responsible'],
                    'responsibleUserId' => $entry['responsible_user_id'] ?? null,
                    'investmentTypeId' => $entry['investment_type_id'],
                    'notes' => 'Confirmado no plano do mês',
                ]);
                $accountsToRefresh[] = $accountId;
            }

            $pdo->prepare(
                'UPDATE month_plan_entries
                 SET status = ?, confirmed_amount_brl = ?, confirmed_amount = ?, transaction_id = ?
                 WHERE id = ? AND planning_id = ?'
            )->execute([
                'confirmed',
                $money['amountBrl'],
                $money['amount'],
                $txId,
                $id,
                $planningId,
            ]);

            $pdo->commit();
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }

        if (!empty($entry['financial_goal_id'])) {
            GoalPlanService::recalculatePendingAmounts(
                $pdo,
                $planningId,
                (int) $entry['financial_goal_id']
            );
        }
        foreach (array_unique($accountsToRefresh) as $accId) {
            GoalPlanService::refreshGoalsForAccount($pdo, $planningId, (int) $accId);
        }

        Response::json(MonthPlanService::getPlan($pdo, $planningId, $year, $month));
    }

    public static function unconfirm(int $id): void
    {
        Auth::requireUser();
        $planningId = Auth::requirePlanningId();
        $pdo = Database::connection();
        $entry = self::fetchEntry($pdo, $id, $planningId);

        $accountIds = MonthPlanService::revertConfirmation($pdo, $planningId, $entry);
        foreach ($accountIds as $accountId) {
            GoalPlanService::refreshGoalsForAccount($pdo, $planningId, $accountId);
        }

        Response::json(MonthPlanService::getPlan(
            $pdo,
            $planningId,
            (int) $entry['year'],
            (int) $entry['month']
        ));
    }

    /** Remove variável pendente (não confirmado) do mês. */
    public static function destroy(int $id): void
    {
        Auth::requireUser();
        $planningId = Auth::requirePlanningId();
        $pdo = Database::connection();
        $entry = self::fetchEntry($pdo, $id, $planningId);

        if ($entry['status'] !== 'pending') {
            Response::error('Só é possível remover itens pendentes.', 422);
        }
        if (!empty($entry['recurring_item_id'])) {
            Response::error('Itens fixos: use ignorar (✕) neste mês.', 422);
        }
        if (!empty($entry['financial_goal_id'])) {
            Response::error('Metas não são removidas em Movimentos.', 422);
        }

        $pdo->prepare('DELETE FROM month_plan_entries WHERE id = ? AND planning_id = ?')
            ->execute([$id, $planningId]);

        Response::json(['ok' => true]);
    }

    public static function skip(int $id): void
    {
        Auth::requireUser();
        $planningId = Auth::requirePlanningId();

        $pdo = Database::connection();
        $entry = self::fetchEntry($pdo, $id, $planningId);
        if ($entry['status'] !== 'pending') {
            Response::error('Item não está pendente.', 422);
        }

        $pdo->prepare(
            'UPDATE month_plan_entries SET status = ? WHERE id = ? AND planning_id = ?'
        )->execute(['skipped', $id, $planningId]);

        if (!empty($entry['financial_goal_id'])) {
            GoalPlanService::recalculatePendingAmounts(
                $pdo,
                $planningId,
                (int) $entry['financial_goal_id']
            );
        }

        Response::json(MonthPlanService::getPlan(
            $pdo,
            $planningId,
            (int) $entry['year'],
            (int) $entry['month']
        ));
    }

    /** @param array<string, mixed> $data */
    private static function insertTransaction(PDO $pdo, array $data): int
    {
        $stmt = $pdo->prepare(
            'INSERT INTO transactions
             (user_id, planning_id, account_id, registered_by_user_id, transaction_date, kind, description,
              amount, currency, amount_brl, eur_to_brl, category, region, responsible, responsible_user_id,
              investment_type_id, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $data['userId'],
            $data['planningId'],
            $data['accountId'],
            $data['registeredBy'],
            $data['date'],
            $data['kind'],
            $data['description'],
            $data['amount'],
            $data['currency'],
            $data['amountBrl'],
            $data['eurToBrl'] ?? null,
            $data['category'],
            $data['region'],
            $data['responsible'],
            $data['responsibleUserId'],
            $data['investmentTypeId'],
            $data['notes'],
        ]);

        return (int) $pdo->lastInsertId();
    }

    private static function fetchAccountName(PDO $pdo, int $planningId, int $accountId): string
    {
        $stmt = $pdo->prepare(
            'SELECT name FROM financial_accounts WHERE id = ? AND planning_id = ?'
        );
        $stmt->execute([$accountId, $planningId]);
        $name = $stmt->fetchColumn();

        return $name ? (string) $name : 'Conta';
    }

    private static function fetchEntry(PDO $pdo, int $id, int $planningId): array
    {
        $stmt = $pdo->prepare('SELECT * FROM month_plan_entries WHERE id = ? AND planning_id = ?');
        $stmt->execute([$id, $planningId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            Response::error('Item não encontrado.', 404);
        }
        return $row;
    }

    /** @return array{0: int, 1: int} */
    private static function yearMonthFromQuery(): array
    {
        $year = isset($_GET['year']) ? (int) $_GET['year'] : (int) date('Y');
        $month = isset($_GET['month']) ? (int) $_GET['month'] : (int) date('n');
        if ($month < 1 || $month > 12) {
            Response::error('Mês inválido.', 422);
        }
        return [$year, $month];
    }
}
