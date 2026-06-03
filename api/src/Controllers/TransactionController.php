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

final class TransactionController
{
    public static function index(): void
    {
        Auth::requireUser();
        $planningId = Auth::requirePlanningId();
        $year = isset($_GET['year']) ? (int) $_GET['year'] : null;
        $month = isset($_GET['month']) ? (int) $_GET['month'] : null;
        $kind = $_GET['kind'] ?? null;

        $sql = 'SELECT t.*, it.name AS investment_type_name, it.color AS investment_type_color,
                       fa.id AS account_row_id, fa.name AS account_name, fa.type AS account_type,
                       reg.id AS reg_id, reg.username AS reg_username, reg.name AS reg_name, reg.gender AS reg_gender,
                       ' . ResponsibleUser::selectColumns() . '
                FROM transactions t
                LEFT JOIN financial_accounts fa ON fa.id = t.account_id
                LEFT JOIN investment_types it ON it.id = t.investment_type_id
                LEFT JOIN users reg ON reg.id = t.registered_by_user_id
                ' . ResponsibleUser::joinClause('t') . '
                WHERE t.planning_id = ?';
        $params = [$planningId];

        if ($year !== null) {
            $sql .= ' AND YEAR(t.transaction_date) = ?';
            $params[] = $year;
        }
        if ($month !== null) {
            $sql .= ' AND MONTH(t.transaction_date) = ?';
            $params[] = $month;
        }
        if ($kind !== null && in_array($kind, ['income', 'expense', 'investment', 'leisure'], true)) {
            $sql .= ' AND t.kind = ?';
            $params[] = $kind;
        }

        $sql .= ' ORDER BY t.transaction_date DESC, t.id DESC';

        $pdo = Database::connection();
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        Response::json(['items' => array_map([self::class, 'map'], $rows)]);
    }

    public static function store(): void
    {
        $registeredBy = Auth::requireUser();
        $planningId = Auth::requirePlanningId();
        $body = self::parseBody();
        $pdo = Database::connection();
        $ownerId = PlanningService::ownerUserId($pdo, $planningId);
        $responsible = ResponsibleUser::parseFromBody($pdo, $body, $planningId);
        $accountId = AccountService::validateAccountId($pdo, $planningId, (int) ($body['accountId'] ?? 0));

        $stmt = $pdo->prepare(
            'INSERT INTO transactions
             (user_id, planning_id, account_id, registered_by_user_id, transaction_date, kind, description,
              amount, currency, amount_brl, eur_to_brl, category, region, responsible, responsible_user_id, notes, investment_type_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $ownerId,
            $planningId,
            $accountId,
            $registeredBy,
            $body['transactionDate'],
            $body['kind'],
            $body['description'],
            $body['amount'],
            $body['currency'],
            $body['amountBrl'],
            $body['eurToBrl'],
            $body['category'],
            $body['region'],
            $responsible['responsible'],
            $responsible['responsibleUserId'],
            $body['notes'],
            $body['investmentTypeId'],
        ]);

        $txId = (int) $pdo->lastInsertId();
        GoalPlanService::refreshGoalsForAccount($pdo, $planningId, $accountId);
        self::show($txId, $planningId);
    }

    public static function update(int $id): void
    {
        Auth::requireUser();
        $planningId = Auth::requirePlanningId();
        $body = self::parseBody();
        $pdo = Database::connection();
        $responsible = ResponsibleUser::parseFromBody($pdo, $body, $planningId);

        $accountId = AccountService::validateAccountId($pdo, $planningId, (int) ($body['accountId'] ?? 0));

        $prevStmt = $pdo->prepare(
            'SELECT account_id FROM transactions WHERE id = ? AND planning_id = ?'
        );
        $prevStmt->execute([$id, $planningId]);
        $prevRow = $prevStmt->fetch(PDO::FETCH_ASSOC);
        if (!$prevRow) {
            Response::error('Lançamento não encontrado.', 404);
        }
        $prevAccountId = (int) $prevRow['account_id'];

        $stmt = $pdo->prepare(
            'UPDATE transactions SET
               transaction_date = ?, kind = ?, description = ?, amount = ?, currency = ?, amount_brl = ?,
               eur_to_brl = ?, category = ?, region = ?, responsible = ?, responsible_user_id = ?, notes = ?,
               investment_type_id = ?, account_id = ?
             WHERE id = ? AND planning_id = ?'
        );
        $stmt->execute([
            $body['transactionDate'],
            $body['kind'],
            $body['description'],
            $body['amount'],
            $body['currency'],
            $body['amountBrl'],
            $body['eurToBrl'],
            $body['category'],
            $body['region'],
            $responsible['responsible'],
            $responsible['responsibleUserId'],
            $body['notes'],
            $body['investmentTypeId'],
            $accountId,
            $id,
            $planningId,
        ]);

        GoalPlanService::refreshGoalsForAccount($pdo, $planningId, $accountId);
        if ($prevAccountId !== $accountId) {
            GoalPlanService::refreshGoalsForAccount($pdo, $planningId, $prevAccountId);
        }
        self::show($id, $planningId);
    }

    public static function unconfirm(int $id): void
    {
        Auth::requireUser();
        $planningId = Auth::requirePlanningId();
        $pdo = Database::connection();

        $entry = MonthPlanService::findEntryForTransaction($pdo, $planningId, $id);
        if (!$entry) {
            Response::error('Lançamento não está vinculado ao plano do mês.', 404);
        }

        $accountIds = MonthPlanService::revertConfirmation($pdo, $planningId, $entry);
        foreach ($accountIds as $accountId) {
            GoalPlanService::refreshGoalsForAccount($pdo, $planningId, $accountId);
        }

        Response::json([
            'ok' => true,
            'monthPlanEntryId' => (int) $entry['id'],
            'year' => (int) $entry['year'],
            'month' => (int) $entry['month'],
        ]);
    }

    public static function destroy(int $id): void
    {
        Auth::requireUser();
        $planningId = Auth::requirePlanningId();
        $pdo = Database::connection();

        $entry = MonthPlanService::findEntryForTransaction($pdo, $planningId, $id);
        if ($entry) {
            Response::error(
                'Use «Desconfirmar» na coluna confirmados para voltar ao pendente. Remoção definitiva só na coluna da esquerda.',
                422
            );
        }

        $prevStmt = $pdo->prepare(
            'SELECT account_id FROM transactions WHERE id = ? AND planning_id = ?'
        );
        $prevStmt->execute([$id, $planningId]);
        $prevRow = $prevStmt->fetch(PDO::FETCH_ASSOC);
        if (!$prevRow) {
            Response::error('Lançamento não encontrado.', 404);
        }
        $accountId = (int) $prevRow['account_id'];

        $stmt = $pdo->prepare('DELETE FROM transactions WHERE id = ? AND planning_id = ?');
        $stmt->execute([$id, $planningId]);
        GoalPlanService::refreshGoalsForAccount($pdo, $planningId, $accountId);
        Response::json(['ok' => true]);
    }

    private static function show(int $id, int $planningId): void
    {
        $pdo = Database::connection();
        $stmt = $pdo->prepare(
            'SELECT t.*, it.name AS investment_type_name, it.color AS investment_type_color,
                    fa.id AS account_row_id, fa.name AS account_name, fa.type AS account_type,
                    reg.id AS reg_id, reg.username AS reg_username, reg.name AS reg_name, reg.gender AS reg_gender,
                    ' . ResponsibleUser::selectColumns() . '
             FROM transactions t
             LEFT JOIN financial_accounts fa ON fa.id = t.account_id
             LEFT JOIN investment_types it ON it.id = t.investment_type_id
             LEFT JOIN users reg ON reg.id = t.registered_by_user_id
             ' . ResponsibleUser::joinClause('t') . '
             WHERE t.id = ? AND t.planning_id = ?'
        );
        $stmt->execute([$id, $planningId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            Response::error('Lançamento não encontrado.', 404);
        }
        Response::json(['item' => self::map($row)]);
    }

    private static function parseBody(): array
    {
        $body = json_decode(file_get_contents('php://input') ?: '{}', true) ?? [];
        $kind = $body['kind'] ?? '';
        if (!in_array($kind, ['income', 'expense', 'investment', 'leisure'], true)) {
            Response::error('Tipo inválido.', 422);
        }

        $date = $body['transactionDate'] ?? $body['date'] ?? '';
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $date)) {
            Response::error('Data inválida (use YYYY-MM-DD).', 422);
        }

        $desc = trim((string) ($body['description'] ?? ''));
        if ($desc === '') {
            Response::error('Descrição obrigatória.', 422);
        }

        $investmentTypeId = $body['investmentTypeId'] ?? null;
        if ($kind !== 'investment') {
            $investmentTypeId = null;
        }

        $pdo = Database::connection();
        $planningId = Auth::requirePlanningId();
        $money = MoneyHelper::parseInput($pdo, $planningId, array_merge($body, [
            'transactionDate' => $date,
            'kind' => $kind,
        ]));

        return [
            'transactionDate' => $date,
            'kind' => $kind,
            'description' => $desc,
            'amount' => $money['amount'],
            'currency' => $money['currency'],
            'amountBrl' => $money['amountBrl'],
            'eurToBrl' => $money['eurToBrl'],
            'fxSource' => $money['fxSource'],
            'category' => trim((string) ($body['category'] ?? 'Geral')) ?: 'Geral',
            'region' => PlanningTaxonomyController::parseRegion($body),
            'responsibleUserId' => $body['responsibleUserId'] ?? null,
            'responsible' => ($body['responsible'] ?? null) ?: null,
            'notes' => ($body['notes'] ?? null) ?: null,
            'investmentTypeId' => $investmentTypeId ? (int) $investmentTypeId : null,
            'accountId' => isset($body['accountId']) ? (int) $body['accountId'] : null,
        ];
    }

    public static function map(array $row): array
    {
        $hasPlanEntry = isset($row['mpe_id']) && $row['mpe_id'] !== null;
        $isVariablePlan = $hasPlanEntry
            && ($row['mpe_recurring_item_id'] === null || $row['mpe_recurring_item_id'] === '');

        $mapped = ResponsibleUser::enrichMap([
            'id' => (int) $row['id'],
            'transactionDate' => $row['transaction_date'],
            'kind' => $row['kind'],
            'description' => $row['description'],
            'amount' => (float) $row['amount'],
            'currency' => $row['currency'],
            'amountBrl' => (float) $row['amount_brl'],
            'eurToBrl' => isset($row['eur_to_brl']) && $row['eur_to_brl'] !== null
                ? (float) $row['eur_to_brl'] : null,
            'category' => $row['category'],
            'region' => $row['region'],
            'accountId' => isset($row['account_id']) && $row['account_id']
                ? (int) $row['account_id'] : null,
            'accountName' => $row['account_name'] ?? null,
            'accountType' => $row['account_type'] ?? null,
            'isVariablePlan' => $isVariablePlan,
            'monthPlanEntryId' => $hasPlanEntry ? (int) $row['mpe_id'] : null,
            'canUnconfirm' => $hasPlanEntry,
            'responsible' => $row['responsible'],
            'notes' => $row['notes'],
            'investmentTypeId' => $row['investment_type_id'] ? (int) $row['investment_type_id'] : null,
            'investmentTypeName' => $row['investment_type_name'] ?? null,
            'investmentTypeColor' => $row['investment_type_color'] ?? null,
            'registeredBy' => $row['reg_id'] ? [
                'id' => (int) $row['reg_id'],
                'username' => $row['reg_username'],
                'name' => $row['reg_name'],
                'gender' => $row['reg_gender'] ?? 'male',
            ] : null,
        ], $row);

        return $mapped;
    }
}
