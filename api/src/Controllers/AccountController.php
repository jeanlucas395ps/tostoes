<?php

declare(strict_types=1);

namespace Gastos\Api\Controllers;

use Gastos\Api\Auth;
use Gastos\Api\Database;
use Gastos\Api\Response;
use Gastos\Api\Services\AccountService;
use Gastos\Api\Services\AccountFlowGraphService;
use Gastos\Api\Services\GoalPlanService;
use Gastos\Api\Services\PlanningService;
use PDO;

final class AccountController
{
    public static function index(): void
    {
        Auth::requireUser();
        $planningId = Auth::requirePlanningId();
        $pdo = Database::connection();
        $type = $_GET['type'] ?? null;
        if ($type !== null && !in_array($type, ['bank', 'investment', 'credit'], true)) {
            Response::error('Tipo de conta inválido.', 422);
        }

        $rows = AccountService::listActive($pdo, $planningId, $type);
        Response::json([
            'items' => array_map(static fn (array $r) => AccountService::mapAccount($pdo, $r), $rows),
        ]);
    }

    public static function summary(): void
    {
        Auth::requireUser();
        $planningId = Auth::requirePlanningId();
        $pdo = Database::connection();
        $rows = AccountService::listActive($pdo, $planningId);
        $items = array_map(static fn (array $r) => AccountService::mapAccount($pdo, $r), $rows);

        $bankTotal = 0.0;
        $investmentTotal = 0.0;
        $creditUsedTotal = 0.0;
        $creditLimitTotal = 0.0;
        $creditAvailableTotal = 0.0;
        foreach ($items as $item) {
            $brl = (float) $item['balanceBrl'];
            if ($item['type'] === 'investment') {
                $investmentTotal += $brl;
            } elseif ($item['type'] === 'credit') {
                $creditUsedTotal += (float) ($item['usedLimitBrl'] ?? max(0, $brl));
                if (isset($item['creditLimitBrl']) && $item['creditLimitBrl'] !== null) {
                    $creditLimitTotal += (float) $item['creditLimitBrl'];
                }
                if (isset($item['availableLimitBrl']) && $item['availableLimitBrl'] !== null) {
                    $creditAvailableTotal += (float) $item['availableLimitBrl'];
                }
            } else {
                $bankTotal += $brl;
            }
        }

        Response::json([
            'accounts' => $items,
            'totals' => [
                'bank' => round($bankTotal, 2),
                'investment' => round($investmentTotal, 2),
                'creditUsed' => round($creditUsedTotal, 2),
                'creditLimit' => round($creditLimitTotal, 2),
                'creditAvailable' => round($creditAvailableTotal, 2),
                'all' => round($bankTotal + $investmentTotal, 2),
            ],
        ]);
    }

    public static function flowGraph(): void
    {
        Auth::requireUser();
        $planningId = Auth::requirePlanningId();
        $year = isset($_GET['year']) ? (int) $_GET['year'] : (int) date('Y');
        $month = isset($_GET['month']) ? (int) $_GET['month'] : (int) date('n');
        if ($month < 1 || $month > 12) {
            Response::error('Mês inválido.', 422);
        }
        $mode = $_GET['mode'] ?? 'planned';
        if (!in_array($mode, ['planned', 'confirmed', 'current'], true)) {
            Response::error('Modo inválido.', 422);
        }

        $pdo = Database::connection();
        Response::json(AccountFlowGraphService::build($pdo, $planningId, $year, $month, $mode));
    }

    public static function show(int $id): void
    {
        Auth::requireUser();
        $planningId = Auth::requirePlanningId();
        $pdo = Database::connection();
        $row = self::fetch($pdo, $id, $planningId);

        $year = isset($_GET['year']) ? (int) $_GET['year'] : null;
        $month = isset($_GET['month']) ? (int) $_GET['month'] : null;
        if ($month !== null && ($month < 1 || $month > 12)) {
            Response::error('Mês inválido.', 422);
        }

        $kindFilter = $_GET['kind'] ?? null;
        if ($kindFilter !== null && !in_array($kindFilter, ['income', 'expense', 'investment', 'leisure'], true)) {
            Response::error('Filtro de tipo inválido.', 422);
        }
        $search = isset($_GET['search']) ? trim((string) $_GET['search']) : null;

        $mapped = AccountService::mapAccount(
            $pdo,
            $row,
            true,
            $year,
            $month,
            $kindFilter,
            $search
        );

        Response::json(['item' => $mapped]);
    }

    public static function store(): void
    {
        Auth::requireUser();
        $planningId = Auth::requirePlanningId();
        $body = self::parseBody();
        $pdo = Database::connection();

        $stmt = $pdo->prepare(
            'INSERT INTO financial_accounts
             (planning_id, name, type, currency, initial_balance, credit_limit, closing_day, due_day,
              cdi_monthly_rate, initial_balance_date, color, sort_order)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        try {
            $stmt->execute([
                $planningId,
                $body['name'],
                $body['type'],
                $body['currency'],
                $body['initialBalance'],
                $body['creditLimit'],
                $body['closingDay'],
                $body['dueDay'],
                $body['cdiMonthlyRate'],
                $body['initialBalanceDate'],
                $body['color'],
                $body['sortOrder'],
            ]);
        } catch (\PDOException $e) {
            if (str_contains($e->getMessage(), 'Duplicate')) {
                Response::error('Já existe uma conta com esse nome.', 422);
            }
            throw $e;
        }

        $row = self::fetch($pdo, (int) $pdo->lastInsertId(), $planningId);
        Response::json(['item' => AccountService::mapAccount($pdo, $row)], 201);
    }

    public static function update(int $id): void
    {
        Auth::requireUser();
        $planningId = Auth::requirePlanningId();
        $body = self::parseBody(true);
        $pdo = Database::connection();
        self::fetch($pdo, $id, $planningId);

        $pdo->prepare(
            'UPDATE financial_accounts SET
               name = ?, type = ?, currency = ?, initial_balance = ?, credit_limit = ?,
               closing_day = ?, due_day = ?, cdi_monthly_rate = ?,
               initial_balance_date = ?,
               color = ?, sort_order = ?
             WHERE id = ? AND planning_id = ?'
        )->execute([
            $body['name'],
            $body['type'],
            $body['currency'],
            $body['initialBalance'],
            $body['creditLimit'],
            $body['closingDay'],
            $body['dueDay'],
            $body['cdiMonthlyRate'],
            $body['initialBalanceDate'],
            $body['color'],
            $body['sortOrder'],
            $id,
            $planningId,
        ]);

        $row = self::fetch($pdo, $id, $planningId);
        Response::json(['item' => AccountService::mapAccount($pdo, $row)]);
    }

    public static function destroy(int $id): void
    {
        Auth::requireUser();
        $planningId = Auth::requirePlanningId();
        $pdo = Database::connection();
        self::fetch($pdo, $id, $planningId);

        $check = $pdo->prepare(
            'SELECT COUNT(*) FROM transactions WHERE account_id = ? AND planning_id = ?'
        );
        $check->execute([$id, $planningId]);
        if ((int) $check->fetchColumn() > 0) {
            $pdo->prepare('UPDATE financial_accounts SET active = 0 WHERE id = ? AND planning_id = ?')
                ->execute([$id, $planningId]);
        } else {
            $pdo->prepare('DELETE FROM financial_accounts WHERE id = ? AND planning_id = ?')
                ->execute([$id, $planningId]);
        }

        Response::json(['ok' => true]);
    }

    /** @return array<string, mixed> */
    private static function parseBody(bool $partial = false): array
    {
        $body = json_decode(file_get_contents('php://input') ?: '{}', true) ?? [];
        $name = trim((string) ($body['name'] ?? ''));
        if (!$partial && $name === '') {
            Response::error('Nome da conta obrigatório.', 422);
        }

        $type = $body['type'] ?? 'bank';
        if (!in_array($type, ['bank', 'investment', 'credit'], true)) {
            Response::error('Tipo de conta inválido.', 422);
        }

        $currency = $body['currency'] ?? 'BRL';
        if (!in_array($currency, ['BRL', 'EUR', 'USD'], true)) {
            Response::error('Moeda inválida.', 422);
        }

        $date = $body['initialBalanceDate'] ?? date('Y-m-d');
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $date)) {
            Response::error('Data do saldo inicial inválida.', 422);
        }

        $creditLimit = null;
        $closingDay = null;
        $dueDay = null;
        $cdiMonthlyRate = null;
        if ($type === 'credit') {
            $creditLimit = isset($body['creditLimit']) ? round((float) $body['creditLimit'], 2) : null;
            if ($creditLimit !== null && $creditLimit < 0) {
                Response::error('Limite do cartão não pode ser negativo.', 422);
            }
            $closingDay = isset($body['closingDay']) ? (int) $body['closingDay'] : null;
            $dueDay = isset($body['dueDay']) ? (int) $body['dueDay'] : null;
            if ($closingDay !== null && ($closingDay < 1 || $closingDay > 28)) {
                Response::error('Dia de fechamento deve ser entre 1 e 28.', 422);
            }
            if ($dueDay !== null && ($dueDay < 1 || $dueDay > 28)) {
                Response::error('Dia de vencimento deve ser entre 1 e 28.', 422);
            }
        } elseif ($type === 'investment' && array_key_exists('cdiMonthlyRate', $body)) {
            $raw = $body['cdiMonthlyRate'];
            if ($raw !== null && $raw !== '') {
                $cdiMonthlyRate = round((float) $raw, 6);
                if ($cdiMonthlyRate < 0 || $cdiMonthlyRate > 1) {
                    Response::error('Taxa CDI mensal deve ser entre 0 e 1 (ex.: 0.0095 = 0,95%).', 422);
                }
            }
        }

        return [
            'name' => $name !== '' ? $name : 'Conta',
            'type' => $type,
            'currency' => $currency,
            'initialBalance' => round((float) ($body['initialBalance'] ?? 0), 2),
            'creditLimit' => $creditLimit,
            'closingDay' => $closingDay,
            'dueDay' => $dueDay,
            'cdiMonthlyRate' => $cdiMonthlyRate,
            'initialBalanceDate' => $date,
            'color' => ($body['color'] ?? null) ?: null,
            'sortOrder' => (int) ($body['sortOrder'] ?? 0),
        ];
    }

    /**
     * Adiantamento / pagamento espontâneo: transferência confirmada banco → cartão (ou destino).
     * Body: sourceAccountId, amount, currency?, transactionDate?, description?, itemNames?[]
     */
    public static function advancePayment(int $targetAccountId): void
    {
        $registeredBy = Auth::requireUser();
        $planningId = Auth::requirePlanningId();
        $pdo = Database::connection();
        $target = self::fetch($pdo, $targetAccountId, $planningId);
        $body = json_decode(file_get_contents('php://input') ?: '{}', true) ?? [];

        $sourceAccountId = (int) ($body['sourceAccountId'] ?? $body['accountId'] ?? 0);
        $amount = isset($body['amount']) ? (float) $body['amount'] : 0.0;
        if ($amount <= 0) {
            Response::error('Informe o valor do adiantamento.', 422);
        }

        $date = (string) ($body['transactionDate'] ?? $body['date'] ?? date('Y-m-d'));
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
            Response::error('Data inválida (use YYYY-MM-DD).', 422);
        }

        $itemNames = $body['itemNames'] ?? [];
        if (!is_array($itemNames)) {
            $itemNames = [];
        }
        $itemNames = array_values(array_filter(array_map(
            static fn ($n) => trim((string) $n),
            $itemNames
        ), static fn ($n) => $n !== ''));

        $targetType = (string) ($target['type'] ?? '');
        $targetLabel = $targetType === 'credit'
            ? (string) $target['name']
            : (string) $target['name'];
        $defaultDesc = $targetType === 'credit'
            ? "Adiantamento fatura, {$targetLabel}"
            : "Transferência para {$targetLabel}";
        $description = trim((string) ($body['description'] ?? '')) ?: $defaultDesc;
        if ($itemNames !== []) {
            $description .= ' · ' . implode(', ', array_slice($itemNames, 0, 5));
            if (count($itemNames) > 5) {
                $description .= '…';
            }
        }

        $extraNotes = $itemNames !== []
            ? 'Itens: ' . implode(', ', $itemNames)
            : null;

        $ownerId = PlanningService::ownerUserId($pdo, $planningId);
        $pair = AccountService::createConfirmedTransfer($pdo, [
            'planningId' => $planningId,
            'ownerUserId' => $ownerId,
            'registeredBy' => $registeredBy,
            'sourceAccountId' => $sourceAccountId,
            'targetAccountId' => $targetAccountId,
            'amount' => $amount,
            'currency' => $body['currency'] ?? 'BRL',
            'amountIn' => $body['amountIn'] ?? $amount,
            'currencyIn' => $body['currencyIn'] ?? $body['currency'] ?? 'BRL',
            'transactionDate' => $date,
            'description' => $description,
            'category' => 'Transferência',
            'region' => 'geral',
            'extraNotes' => $extraNotes,
        ]);

        GoalPlanService::refreshGoalsForAccount($pdo, $planningId, $sourceAccountId);
        GoalPlanService::refreshGoalsForAccount($pdo, $planningId, $targetAccountId);

        Response::json([
            'ok' => true,
            'outTransactionId' => $pair['outTxId'],
            'inTransactionId' => $pair['inTxId'],
            'description' => $description,
        ]);
    }

    /** @return array<string, mixed> */
    private static function fetch(PDO $pdo, int $id, int $planningId): array
    {
        $stmt = $pdo->prepare(
            'SELECT * FROM financial_accounts WHERE id = ? AND planning_id = ? AND active = 1'
        );
        $stmt->execute([$id, $planningId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            Response::error('Conta não encontrada.', 404);
        }

        return $row;
    }
}
