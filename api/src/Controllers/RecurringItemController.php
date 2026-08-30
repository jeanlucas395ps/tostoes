<?php

declare(strict_types=1);

namespace Gastos\Api\Controllers;

use Gastos\Api\Auth;
use Gastos\Api\Database;
use Gastos\Api\MoneyHelper;
use Gastos\Api\Response;
use Gastos\Api\ResponsibleUser;
use Gastos\Api\Controllers\PlanningTaxonomyController;
use Gastos\Api\Services\AccountService;
use Gastos\Api\Services\MonthPlanService;
use Gastos\Api\Services\PlanningService;
use Gastos\Api\Services\ProjectionService;
use PDO;

final class RecurringItemController
{
    public static function index(): void
    {
        Auth::requireUser();
        $planningId = Auth::requirePlanningId();
        $kind = $_GET['kind'] ?? null;

        $sql = 'SELECT r.*, it.name AS investment_type_name, it.color AS investment_type_color,
                       fa.name AS financial_account_name,
                       sfa.name AS source_financial_account_name,
                       ct.name AS custom_tab_name, ic.name AS item_category_name, ic.icon AS item_category_icon,
                       ' . ResponsibleUser::selectColumns() . '
                FROM recurring_items r
                LEFT JOIN investment_types it ON it.id = r.investment_type_id
                LEFT JOIN financial_accounts fa ON fa.id = r.financial_account_id
                LEFT JOIN financial_accounts sfa ON sfa.id = r.source_financial_account_id
                LEFT JOIN planning_custom_tabs ct ON ct.id = r.custom_tab_id
                LEFT JOIN planning_item_categories ic ON ic.id = r.item_category_id
                ' . ResponsibleUser::joinClause('r') . '
                WHERE r.planning_id = ? AND r.active = 1';
        $params = [$planningId];

        if ($kind !== null && in_array($kind, ['income', 'expense', 'investment', 'leisure'], true)) {
            $sql .= ' AND r.kind = ?';
            $params[] = $kind;
        }

        $installments = $_GET['installments'] ?? null;
        if ($installments === '1' || $installments === 'true') {
            $sql .= ' AND r.is_installment = 1';
        } elseif ($kind === 'expense') {
            // Gastos fixos clássicos: exclui compras parceladas
            $sql .= ' AND r.is_installment = 0';
        }

        $sql .= ' ORDER BY r.kind, r.due_day, r.sort_order, r.name';

        $pdo = Database::connection();
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $items = array_map([self::class, 'map'], $stmt->fetchAll(PDO::FETCH_ASSOC));

        Response::json(['items' => $items]);
    }

    public static function store(): void
    {
        Auth::requireUser();
        $planningId = Auth::requirePlanningId();
        $body = self::parseBody();

        $pdo = Database::connection();
        $ownerId = PlanningService::ownerUserId($pdo, $planningId);
        $responsible = ResponsibleUser::parseFromBody($pdo, $body, $planningId);
        $money = MoneyHelper::parseInput($pdo, $planningId, $body);
        $taxonomy = PlanningTaxonomyController::resolveEntryTaxonomy($pdo, $planningId, $body);
        $financialAccountId = self::resolveFinancialAccountId($pdo, $planningId, $body);
        $sourceFinancialAccountId = self::resolveSourceFinancialAccountId($pdo, $planningId, $body);
        $stmt = $pdo->prepare(
            'INSERT INTO recurring_items
             (user_id, planning_id, kind, name, category, region, custom_tab_id, item_category_id,
              responsible, responsible_user_id, due_day, investment_type_id, financial_account_id,
              source_financial_account_id, default_amount_brl, currency, amount_original, is_fixed,
              is_installment, start_date, end_date, sort_order)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $ownerId,
            $planningId,
            $body['kind'],
            $body['name'],
            $taxonomy['category'],
            $taxonomy['region'],
            $taxonomy['customTabId'],
            $taxonomy['itemCategoryId'],
            $responsible['responsible'],
            $responsible['responsibleUserId'],
            $body['dueDay'],
            $body['investmentTypeId'],
            $financialAccountId,
            $sourceFinancialAccountId,
            $money['amountBrl'],
            $money['currency'],
            $money['amount'],
            $body['isInstallment'] ? 1 : 0,
            $body['startDate'],
            $body['endDate'],
            $body['sortOrder'],
        ]);
        $id = (int) $pdo->lastInsertId();
        self::syncAmounts($pdo, $id, $money['amountBrl'], $body['monthAmounts'] ?? null);
        MonthPlanService::applyRecurringTemplateToPendingEntries($pdo, $planningId, $id);
        self::show($id, $planningId);
    }

    public static function update(int $id): void
    {
        Auth::requireUser();
        $planningId = Auth::requirePlanningId();
        $body = self::parseBody();

        $pdo = Database::connection();
        $responsible = ResponsibleUser::parseFromBody($pdo, $body, $planningId);
        $money = MoneyHelper::parseInput($pdo, $planningId, $body);
        $taxonomy = PlanningTaxonomyController::resolveEntryTaxonomy($pdo, $planningId, $body);
        $financialAccountId = self::resolveFinancialAccountId($pdo, $planningId, $body);
        $sourceFinancialAccountId = self::resolveSourceFinancialAccountId($pdo, $planningId, $body);
        $stmt = $pdo->prepare(
            'UPDATE recurring_items SET
               kind = ?, name = ?, category = ?, region = ?, custom_tab_id = ?, item_category_id = ?,
               responsible = ?, responsible_user_id = ?,
               due_day = ?, investment_type_id = ?, financial_account_id = ?,
               source_financial_account_id = ?,
               default_amount_brl = ?, currency = ?, amount_original = ?,
               is_installment = ?, start_date = ?, end_date = ?
             WHERE id = ? AND planning_id = ? AND active = 1'
        );
        $stmt->execute([
            $body['kind'],
            $body['name'],
            $taxonomy['category'],
            $taxonomy['region'],
            $taxonomy['customTabId'],
            $taxonomy['itemCategoryId'],
            $responsible['responsible'],
            $responsible['responsibleUserId'],
            $body['dueDay'],
            $body['investmentTypeId'],
            $financialAccountId,
            $sourceFinancialAccountId,
            $money['amountBrl'],
            $money['currency'],
            $money['amount'],
            $body['isInstallment'] ? 1 : 0,
            $body['startDate'],
            $body['endDate'],
            $id,
            $planningId,
        ]);
        if ($stmt->rowCount() === 0 && !self::exists($pdo, $id, $planningId)) {
            Response::error('Item fixo não encontrado.', 404);
        }
        self::syncAmounts($pdo, $id, $money['amountBrl'], $body['monthAmounts'] ?? null);
        MonthPlanService::applyRecurringTemplateToPendingEntries($pdo, $planningId, $id);
        self::show($id, $planningId);
    }

    public static function destroy(int $id): void
    {
        Auth::requireUser();
        $planningId = Auth::requirePlanningId();
        $pdo = Database::connection();
        $stmt = $pdo->prepare(
            'UPDATE recurring_items SET active = 0 WHERE id = ? AND planning_id = ?'
        );
        $stmt->execute([$id, $planningId]);
        if ($stmt->rowCount() === 0) {
            Response::error('Item fixo não encontrado.', 404);
        }
        MonthPlanService::removeFuturePendingForRecurring($pdo, $planningId, $id);
        Response::json(['ok' => true]);
    }

    private static function show(int $id, int $planningId): void
    {
        $pdo = Database::connection();
        $stmt = $pdo->prepare(
            'SELECT r.*, it.name AS investment_type_name, it.color AS investment_type_color,
                    ct.name AS custom_tab_name, ic.name AS item_category_name,
                    ' . ResponsibleUser::selectColumns() . '
             FROM recurring_items r
             LEFT JOIN investment_types it ON it.id = r.investment_type_id
             LEFT JOIN planning_custom_tabs ct ON ct.id = r.custom_tab_id
             LEFT JOIN planning_item_categories ic ON ic.id = r.item_category_id
             ' . ResponsibleUser::joinClause('r') . '
             WHERE r.id = ? AND r.planning_id = ?'
        );
        $stmt->execute([$id, $planningId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            Response::error('Item fixo não encontrado.', 404);
        }
        $item = self::map($row);
        $item['monthAmounts'] = self::loadMonthAmounts($pdo, $id);
        Response::json(['item' => $item]);
    }

    private static function exists(PDO $pdo, int $id, int $planningId): bool
    {
        $stmt = $pdo->prepare('SELECT 1 FROM recurring_items WHERE id = ? AND planning_id = ?');
        $stmt->execute([$id, $planningId]);
        return (bool) $stmt->fetch();
    }

    /** @return array<int, float> */
    private static function loadMonthAmounts(PDO $pdo, int $recurringId): array
    {
        $stmt = $pdo->prepare(
            'SELECT month, amount_brl FROM recurring_item_amounts WHERE recurring_item_id = ?'
        );
        $stmt->execute([$recurringId]);
        $out = [];
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $out[(int) $row['month']] = (float) $row['amount_brl'];
        }
        return $out;
    }

    /** @param array<int, float>|null $monthAmounts */
    private static function syncAmounts(
        PDO $pdo,
        int $recurringId,
        float $default,
        ?array $monthAmounts
    ): void {
        ['month' => $fromMonth] = ProjectionService::currentYearMonth();

        if ($monthAmounts !== null && $monthAmounts !== []) {
            $pdo->prepare(
                'DELETE FROM recurring_item_amounts WHERE recurring_item_id = ? AND month >= ?'
            )->execute([$recurringId, $fromMonth]);
            $ins = $pdo->prepare(
                'INSERT INTO recurring_item_amounts (recurring_item_id, month, amount_brl) VALUES (?, ?, ?)'
            );
            foreach ($monthAmounts as $month => $amount) {
                if ((int) $month < $fromMonth) {
                    continue;
                }
                $ins->execute([$recurringId, (int) $month, (float) $amount]);
            }
            return;
        }
        if ($default <= 0) {
            return;
        }
        $pdo->prepare(
            'DELETE FROM recurring_item_amounts WHERE recurring_item_id = ? AND month >= ?'
        )->execute([$recurringId, $fromMonth]);
        $ins = $pdo->prepare(
            'INSERT INTO recurring_item_amounts (recurring_item_id, month, amount_brl) VALUES (?, ?, ?)'
        );
        for ($m = $fromMonth; $m <= 12; $m++) {
            $ins->execute([$recurringId, $m, $default]);
        }
    }

    private static function parseBody(): array
    {
        $body = json_decode(file_get_contents('php://input') ?: '{}', true) ?? [];
        $kind = $body['kind'] ?? '';
        if (!in_array($kind, ['income', 'expense', 'investment', 'leisure'], true)) {
            Response::error('Tipo inválido.', 422);
        }

        $name = trim((string) ($body['name'] ?? ''));
        if ($name === '') {
            Response::error('Nome obrigatório.', 422);
        }

        $dueDay = isset($body['dueDay']) ? (int) $body['dueDay'] : null;
        if ($dueDay !== null && ($dueDay < 1 || $dueDay > 31)) {
            Response::error('Dia do mês deve ser entre 1 e 31.', 422);
        }

        $investmentTypeId = $body['investmentTypeId'] ?? null;
        if ($kind !== 'investment') {
            $investmentTypeId = null;
        }

        $monthAmounts = null;
        if (isset($body['monthAmounts']) && is_array($body['monthAmounts'])) {
            $monthAmounts = [];
            foreach ($body['monthAmounts'] as $k => $v) {
                $monthAmounts[(int) $k] = (float) $v;
            }
        }

        $isInstallment = !empty($body['isInstallment']);
        $startDate = self::parseDateOrNull($body['startDate'] ?? null);
        $endDate = self::parseDateOrNull($body['endDate'] ?? null);
        if ($isInstallment) {
            if ($kind !== 'expense') {
                Response::error('Compras parceladas devem ser do tipo gasto.', 422);
            }
            if ($startDate === null || $endDate === null) {
                Response::error('Informe início e fim das parcelas.', 422);
            }
            if ($startDate > $endDate) {
                Response::error('A data de início deve ser anterior ou igual à data de fim.', 422);
            }
            $sourceId = isset($body['sourceFinancialAccountId']) ? (int) $body['sourceFinancialAccountId'] : 0;
            if ($sourceId <= 0) {
                Response::error('Vincule um cartão de crédito à compra parcelada.', 422);
            }
            $pdo = Database::connection();
            $planningId = Auth::requirePlanningId();
            AccountService::validateAccountId($pdo, $planningId, $sourceId, 'credit');
        } else {
            $startDate = null;
            $endDate = null;
        }

        return [
            'kind' => $kind,
            'name' => $name,
            'category' => trim((string) ($body['category'] ?? 'Geral')) ?: 'Geral',
            'customTabId' => isset($body['customTabId']) ? (int) $body['customTabId'] : null,
            'itemCategoryId' => isset($body['itemCategoryId']) ? (int) $body['itemCategoryId'] : null,
            'newCategoryName' => trim((string) ($body['newCategoryName'] ?? '')),
            'newCategoryIcon' => ($body['newCategoryIcon'] ?? null) ?: null,
            'region' => PlanningTaxonomyController::parseRegion($body),
            'responsibleUserId' => $body['responsibleUserId'] ?? null,
            'responsible' => $body['responsible'] ?? null,
            'currency' => in_array($body['currency'] ?? 'BRL', ['BRL', 'EUR', 'USD'], true)
                ? $body['currency'] : 'BRL',
            'amount' => (float) ($body['amount'] ?? $body['defaultAmountBrl'] ?? 0),
            'dueDay' => $dueDay,
            'investmentTypeId' => $investmentTypeId ? (int) $investmentTypeId : null,
            'defaultAmountBrl' => (float) ($body['defaultAmountBrl'] ?? 0),
            'sortOrder' => (int) ($body['sortOrder'] ?? 0),
            'monthAmounts' => $monthAmounts,
            'financialAccountId' => isset($body['financialAccountId']) ? (int) $body['financialAccountId'] : null,
            'sourceFinancialAccountId' => isset($body['sourceFinancialAccountId'])
                ? (int) $body['sourceFinancialAccountId'] : null,
            'isInstallment' => $isInstallment,
            'startDate' => $startDate,
            'endDate' => $endDate,
        ];
    }

    private static function parseDateOrNull(mixed $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }
        $raw = trim((string) $value);
        // Aceita YYYY-MM → primeiro dia do mês
        if (preg_match('/^\d{4}-\d{2}$/', $raw)) {
            $raw .= '-01';
        }
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $raw)) {
            Response::error('Data inválida.', 422);
        }

        return $raw;
    }

    /** @param array<string, mixed> $body */
    private static function resolveSourceFinancialAccountId(PDO $pdo, int $planningId, array $body): ?int
    {
        $id = isset($body['sourceFinancialAccountId']) ? (int) $body['sourceFinancialAccountId'] : 0;
        if ($id <= 0) {
            return null;
        }

        if (!empty($body['isInstallment'])) {
            return AccountService::validateAccountId($pdo, $planningId, $id, 'credit');
        }

        return AccountService::validatePaymentSourceAccountId($pdo, $planningId, $id);
    }

    /** @param array<string, mixed> $body */
    private static function resolveFinancialAccountId(PDO $pdo, int $planningId, array $body): ?int
    {
        if (($body['kind'] ?? '') !== 'investment') {
            return null;
        }
        $id = isset($body['financialAccountId']) ? (int) $body['financialAccountId'] : 0;
        if ($id <= 0) {
            return null;
        }

        return AccountService::validateAccountId($pdo, $planningId, $id, 'investment');
    }

    public static function map(array $row): array
    {
        return MoneyHelper::enrichMap(ResponsibleUser::enrichMap([
            'id' => (int) $row['id'],
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
            'defaultAmountBrl' => (float) ($row['default_amount_brl'] ?? 0),
            'isFixed' => (bool) ($row['is_fixed'] ?? true),
            'isInstallment' => (bool) ($row['is_installment'] ?? false),
            'startDate' => $row['start_date'] ?? null,
            'endDate' => $row['end_date'] ?? null,
        ], $row), $row);
    }
}
