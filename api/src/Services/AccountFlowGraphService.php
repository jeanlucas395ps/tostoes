<?php

declare(strict_types=1);

namespace Gastos\Api\Services;

use Gastos\Api\MoneyHelper;
use PDO;

/**
 * Grafo de fluxos entre contas bancárias, investimentos, gastos, recebimentos e metas.
 */
final class AccountFlowGraphService
{
    /** @return array<string, mixed> */
    public static function build(PDO $pdo, int $planningId, int $year, int $month, string $mode): array
    {
        $month = max(1, min(12, $month));
        if ($mode === 'confirmed') {
            return self::buildConfirmed($pdo, $planningId, $year, $month);
        }
        if ($mode === 'current') {
            return self::buildPlanned($pdo, $planningId, $year, $month, true, 'current');
        }

        return self::buildPlanned($pdo, $planningId, $year, $month, false, 'planned');
    }

    /**
     * Previsto: fixos ativos + metas pendentes.
     * Mês atual: o mesmo + gastos/recebimentos variáveis criados em Movimentos (sem vínculo fixo).
     *
     * @return array<string, mixed>
     */
    private static function buildPlanned(
        PDO $pdo,
        int $planningId,
        int $year,
        int $month,
        bool $includeVariablePending,
        string $packMode
    ): array {
        if (!ProjectionService::isBeforeCurrentMonth($year, $month)) {
            MonthPlanService::syncAllFixedForMonth($pdo, $planningId, $year, $month);
            GoalPlanService::refreshAllPendingAmounts($pdo, $planningId);
        }

        $scopeSql = $includeVariablePending
            ? '(e.financial_goal_id IS NOT NULL
                OR EXISTS (
                    SELECT 1 FROM recurring_items r
                    WHERE r.id = e.recurring_item_id AND r.planning_id = e.planning_id
                      AND r.is_fixed = 1 AND r.active = 1
                )
                OR (e.recurring_item_id IS NULL AND e.financial_goal_id IS NULL))'
            : '(e.financial_goal_id IS NOT NULL
                OR EXISTS (
                    SELECT 1 FROM recurring_items r
                    WHERE r.id = e.recurring_item_id AND r.planning_id = e.planning_id
                      AND r.is_fixed = 1 AND r.active = 1
                ))';

        $stmt = $pdo->prepare(
            'SELECT e.*, fg.name AS goal_name, fg.color AS goal_color,
                    it.color AS investment_type_color,
                    ic.id AS item_category_id, ic.name AS item_category_name,
                    ct.id AS custom_tab_id, ct.name AS custom_tab_name,
                    ri.is_installment AS is_installment
             FROM month_plan_entries e
             LEFT JOIN financial_goals fg ON fg.id = e.financial_goal_id
             LEFT JOIN investment_types it ON it.id = e.investment_type_id
             LEFT JOIN planning_item_categories ic ON ic.id = e.item_category_id
             LEFT JOIN planning_custom_tabs ct ON ct.id = e.custom_tab_id
             LEFT JOIN recurring_items ri ON ri.id = e.recurring_item_id
             WHERE e.planning_id = ? AND e.year = ? AND e.month = ?
               AND e.status = "pending"
               AND e.kind IN ("income", "expense", "investment", "transfer")
               AND ' . $scopeSql . '
             ORDER BY e.due_day, e.name'
        );
        $stmt->execute([$planningId, $year, $month]);

        $nodes = [];
        $edges = [];
        $unassigned = [];

        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $amount = (float) $row['suggested_amount_brl'];
            if ($amount <= 0) {
                continue;
            }

            $kind = (string) $row['kind'];
            $isGoal = !empty($row['financial_goal_id']);
            $label = (string) $row['name'];
            $entryId = (int) $row['id'];

            if ($kind === 'transfer') {
                $sourceId = !empty($row['source_financial_account_id'])
                    ? (int) $row['source_financial_account_id'] : null;
                $targetId = !empty($row['financial_account_id'])
                    ? (int) $row['financial_account_id'] : null;
                $color = '#0ea5e9';

                $fromNode = $sourceId
                    ? self::ensureAccountNode($pdo, $planningId, $nodes, $sourceId)
                    : null;
                $toNode = $targetId
                    ? self::ensureAccountNode($pdo, $planningId, $nodes, $targetId)
                    : null;

                if ($fromNode && $toNode) {
                    $edges[] = self::edge(
                        $fromNode,
                        $toNode,
                        $amount,
                        'transfer',
                        $label,
                        'transfer',
                        $color,
                        $entryId,
                        $row
                    );
                } elseif ($toNode && !$fromNode) {
                    $unassigned[] = [
                        'entryId' => $entryId,
                        'label' => $label,
                        'amountBrl' => $amount,
                        'kind' => 'transfer',
                        'subKind' => 'transfer',
                        'color' => $color,
                        'targetId' => $toNode,
                    ];
                    $edges[] = self::edge(
                        'unassigned:' . $entryId,
                        $toNode,
                        $amount,
                        'transfer',
                        $label . ' (origem a definir)',
                        'transfer',
                        $color,
                        $entryId,
                        $row,
                        true
                    );
                } elseif ($fromNode && !$toNode) {
                    $destId = 'xfer:' . $entryId;
                    $nodes[$destId] = self::flowNode($destId, 'transfer', $label, $color);
                    $edges[] = self::edge(
                        $fromNode,
                        $destId,
                        $amount,
                        'transfer',
                        $label . ' (destino a definir)',
                        'transfer',
                        $color,
                        $entryId,
                        $row,
                        true
                    );
                    $unassigned[] = [
                        'entryId' => $entryId,
                        'label' => $label,
                        'amountBrl' => $amount,
                        'kind' => 'transfer',
                        'subKind' => 'transfer',
                        'color' => $color,
                        'targetId' => $destId,
                    ];
                }
                continue;
            }

            if ($kind === 'investment' || $isGoal) {
                $bankId = !empty($row['source_financial_account_id'])
                    ? (int) $row['source_financial_account_id'] : null;
                $targetId = !empty($row['financial_account_id'])
                    ? (int) $row['financial_account_id'] : null;
                $color = $isGoal
                    ? (string) ($row['goal_color'] ?? '#00AB55')
                    : (string) ($row['investment_type_color'] ?? '#8b5cf6');

                if ($bankId) {
                    self::ensureBankNode($pdo, $planningId, $nodes, $bankId);
                }
                if ($targetId) {
                    self::ensureInvNode($pdo, $planningId, $nodes, $targetId);
                }

                $destId = $targetId
                    ? 'inv:' . $targetId
                    : ($isGoal ? 'goal:' . (int) $row['financial_goal_id'] : 'flow:' . $entryId);

                if (!$targetId) {
                    $nodes[$destId] = self::flowNode(
                        $destId,
                        $isGoal ? 'goal' : 'investment',
                        $label,
                        $color
                    );
                }

                if ($bankId && ($targetId || isset($nodes[$destId]))) {
                    $edges[] = self::edge(
                        'bank:' . $bankId,
                        $targetId ? 'inv:' . $targetId : $destId,
                        $amount,
                        $kind,
                        $label,
                        $isGoal ? 'goal' : 'investment',
                        $color,
                        $entryId,
                        $row
                    );
                } elseif (!$bankId) {
                    $unassigned[] = [
                        'entryId' => $entryId,
                        'label' => $label,
                        'amountBrl' => $amount,
                        'kind' => $kind,
                        'subKind' => $isGoal ? 'goal' : 'investment',
                        'color' => $color,
                        'targetId' => $targetId ? 'inv:' . $targetId : $destId,
                    ];
                    if ($targetId) {
                        $edges[] = self::edge(
                            'unassigned:' . $entryId,
                            'inv:' . $targetId,
                            $amount,
                            $kind,
                            $label . ' (conta a definir)',
                            $isGoal ? 'goal' : 'investment',
                            $color,
                            $entryId,
                            $row,
                            true
                        );
                    }
                }
                continue;
            }

            if ($kind === 'expense') {
                $sourceId = !empty($row['source_financial_account_id'])
                    ? (int) $row['source_financial_account_id'] : null;
                $destId = 'exp:' . $entryId;
                $isInstallment = !empty($row['is_installment']);
                $nodeType = $isInstallment ? 'installment' : 'expense';
                $subKind = $isInstallment ? 'installment' : 'expense';
                $color = $isInstallment ? '#f59e0b' : '#EF4444';
                $nodes[$destId] = self::flowNode($destId, $nodeType, $label, $color);

                $fromNode = $sourceId
                    ? self::ensureAccountNode($pdo, $planningId, $nodes, $sourceId)
                    : null;

                if ($fromNode) {
                    $edges[] = self::edge(
                        $fromNode,
                        $destId,
                        $amount,
                        'expense',
                        $label,
                        $subKind,
                        $color,
                        $entryId,
                        $row
                    );
                } else {
                    $unassigned[] = [
                        'entryId' => $entryId,
                        'label' => $label,
                        'amountBrl' => $amount,
                        'kind' => 'expense',
                        'subKind' => $subKind,
                        'color' => $color,
                        'targetId' => $destId,
                    ];
                    $edges[] = self::edge(
                        'unassigned:' . $entryId,
                        $destId,
                        $amount,
                        'expense',
                        $label . ' (conta a definir)',
                        $subKind,
                        $color,
                        $entryId,
                        $row,
                        true
                    );
                }
                continue;
            }

            if ($kind === 'income') {
                // Fixos: destino em source_financial_account_id; variáveis: financial_account_id.
                $bankId = !empty($row['financial_account_id'])
                    ? (int) $row['financial_account_id']
                    : (!empty($row['source_financial_account_id'])
                        ? (int) $row['source_financial_account_id']
                        : null);
                $srcId = 'inc:' . $entryId;
                $nodes[$srcId] = self::flowNode($srcId, 'income', $label, '#10B981');

                if ($bankId) {
                    $bankNode = self::ensureAccountNode($pdo, $planningId, $nodes, $bankId);
                    if ($bankNode) {
                        $edges[] = self::edge(
                            $srcId,
                            $bankNode,
                            $amount,
                            'income',
                            $label,
                            'income',
                            '#10B981',
                            $entryId,
                            $row
                        );
                    }
                } else {
                    $unassigned[] = [
                        'entryId' => $entryId,
                        'label' => $label,
                        'amountBrl' => $amount,
                        'kind' => 'income',
                        'subKind' => 'income',
                        'color' => '#10B981',
                        'targetId' => $srcId,
                    ];
                    $edges[] = self::edge(
                        $srcId,
                        'unassigned:' . $entryId,
                        $amount,
                        'income',
                        $label . ' (conta a definir)',
                        'income',
                        '#10B981',
                        $entryId,
                        $row,
                        true
                    );
                }
            }
        }

        return self::pack(
            $pdo,
            $planningId,
            $year,
            $month,
            $packMode,
            ...self::withCreditCardsAndBills($pdo, $planningId, $year, $month, $nodes, $edges, $unassigned)
        );
    }

    /** @return array<string, mixed> */
    private static function buildConfirmed(PDO $pdo, int $planningId, int $year, int $month): array
    {
        $stmt = $pdo->prepare(
            'SELECT t.*, fa.id AS fa_id, fa.name AS fa_name, fa.type AS fa_type, fa.color AS fa_color,
                    mpe.id AS mpe_id, mpe.financial_goal_id, mpe.source_financial_account_id AS mpe_source_id,
                    mpe.financial_account_id AS mpe_target_id, mpe.item_category_id, mpe.custom_tab_id,
                    mpe.category AS mpe_category, fg.color AS goal_color,
                    ic.name AS item_category_name, ct.name AS custom_tab_name,
                    ri.is_installment AS is_installment
             FROM transactions t
             LEFT JOIN financial_accounts fa ON fa.id = t.account_id
             LEFT JOIN month_plan_entries mpe ON mpe.transaction_id = t.id AND mpe.planning_id = t.planning_id
             LEFT JOIN financial_goals fg ON fg.id = mpe.financial_goal_id
             LEFT JOIN planning_item_categories ic ON ic.id = mpe.item_category_id
             LEFT JOIN planning_custom_tabs ct ON ct.id = mpe.custom_tab_id
             LEFT JOIN recurring_items ri ON ri.id = mpe.recurring_item_id
             WHERE t.planning_id = ? AND YEAR(t.transaction_date) = ? AND MONTH(t.transaction_date) = ?
               AND t.kind IN ("income", "expense", "investment", "transfer")
             ORDER BY t.transaction_date, t.id'
        );
        $stmt->execute([$planningId, $year, $month]);

        $nodes = [];
        $edges = [];
        $seenPairs = [];
        $pendingTransfers = [];

        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $amount = (float) $row['amount_brl'];
            if ($amount <= 0) {
                continue;
            }

            $accountId = (int) $row['account_id'];
            $kind = (string) $row['kind'];
            $label = (string) $row['description'];
            $txId = (int) $row['id'];
            $isGoal = !empty($row['financial_goal_id']);
            $accountType = (string) ($row['fa_type'] ?? 'bank');

            if ($kind === 'transfer') {
                if (AccountService::isTransferInflow($row)) {
                    continue;
                }
                $fromNode = self::ensureAccountNode($pdo, $planningId, $nodes, $accountId, $row);
                if (!$fromNode) {
                    continue;
                }
                $targetId = !empty($row['mpe_target_id']) ? (int) $row['mpe_target_id'] : null;
                if (!$targetId && preg_match('/\(#(\d+)\)/', (string) ($row['notes'] ?? ''), $m)) {
                    $linkedId = (int) $m[1];
                    $linkStmt = $pdo->prepare(
                        'SELECT account_id FROM transactions WHERE id = ? AND planning_id = ? LIMIT 1'
                    );
                    $linkStmt->execute([$linkedId, $planningId]);
                    $linkedAccount = $linkStmt->fetchColumn();
                    if ($linkedAccount !== false) {
                        $targetId = (int) $linkedAccount;
                    }
                }
                if ($targetId) {
                    $toNode = self::ensureAccountNode($pdo, $planningId, $nodes, $targetId);
                    if ($toNode) {
                        $edges[] = self::edge(
                            $fromNode,
                            $toNode,
                            $amount,
                            'transfer',
                            $label,
                            'transfer',
                            '#0ea5e9',
                            $txId,
                            $row
                        );
                    }
                } else {
                    $pendingTransfers[] = [
                        'fromNode' => $fromNode,
                        'amount' => $amount,
                        'label' => $label,
                        'txId' => $txId,
                        'row' => $row,
                    ];
                }
                continue;
            }

            if ($kind === 'investment' && $accountType === 'bank') {
                self::ensureBankNode($pdo, $planningId, $nodes, $accountId, $row);
                $pairKey = $txId;
                if (!isset($seenPairs[$pairKey])) {
                    $seenPairs[$pairKey] = [
                        'bankId' => $accountId,
                        'amount' => $amount,
                        'label' => $label,
                        'txId' => $txId,
                        'isGoal' => $isGoal,
                        'goalColor' => $row['goal_color'] ?? null,
                        'targetInvId' => !empty($row['mpe_target_id']) ? (int) $row['mpe_target_id'] : null,
                        'taxonomyRow' => $row,
                    ];
                }
                continue;
            }

            if ($kind === 'income') {
                if ($accountType === 'investment' && self::isInvestmentMirrorInflow($row)) {
                    continue;
                }
                $destAccountId = self::resolveIncomeDestinationAccountId($row);
                $destAcc = self::fetchAccount($pdo, $planningId, $destAccountId);
                $destType = (string) ($destAcc['type'] ?? $accountType);

                $srcId = 'tx:' . $txId;
                $nodes[$srcId] = self::flowNode($srcId, 'income', $label, '#10B981');

                if ($destType === 'investment') {
                    self::ensureInvNode($pdo, $planningId, $nodes, $destAccountId, $destAcc ?: $row);
                    $targetNode = 'inv:' . $destAccountId;
                } elseif ($destType === 'credit') {
                    self::ensureCreditNode($pdo, $planningId, $nodes, $destAccountId, $destAcc ?: [
                        'fa_name' => $destAcc['name'] ?? $row['fa_name'] ?? 'Cartão',
                        'fa_color' => $destAcc['color'] ?? '#f59e0b',
                        'fa_type' => 'credit',
                    ]);
                    $targetNode = 'credit:' . $destAccountId;
                } else {
                    self::ensureBankNode($pdo, $planningId, $nodes, $destAccountId, $destAcc ?: $row);
                    $targetNode = 'bank:' . $destAccountId;
                }

                $edges[] = self::edge(
                    $srcId,
                    $targetNode,
                    $amount,
                    'income',
                    $label,
                    $isGoal ? 'goal' : 'income',
                    '#10B981',
                    $txId,
                    $row
                );
                continue;
            }

            if ($kind === 'expense' || ($kind === 'investment' && $accountType === 'bank')) {
                $fromNode = self::ensureAccountNode($pdo, $planningId, $nodes, $accountId, $row);
                if (!$fromNode) {
                    continue;
                }
                $destId = 'tx:' . $txId;
                $isInstallment = $kind === 'expense' && !empty($row['is_installment']);
                if ($kind === 'investment') {
                    $sub = $isGoal ? 'goal' : 'investment';
                    $color = $isGoal
                        ? (string) ($row['goal_color'] ?? '#00AB55')
                        : '#8b5cf6';
                } elseif ($isInstallment) {
                    $sub = 'installment';
                    $color = '#f59e0b';
                } else {
                    $sub = 'expense';
                    $color = '#EF4444';
                }
                $nodes[$destId] = self::flowNode($destId, $sub, $label, $color);
                $edges[] = self::edge(
                    $fromNode,
                    $destId,
                    $amount,
                    $kind,
                    $label,
                    $sub,
                    $color,
                    $txId,
                    $row
                );
                continue;
            }

            if ($kind === 'income' && $accountType === 'investment') {
                self::ensureInvNode($pdo, $planningId, $nodes, $accountId, $row);
                $srcId = 'tx:' . $txId;
                $nodes[$srcId] = self::flowNode($srcId, 'income', $label, '#10B981');
                $edges[] = self::edge(
                    $srcId,
                    'inv:' . $accountId,
                    $amount,
                    'income',
                    $label,
                    'income',
                    '#10B981',
                    $txId,
                    $row
                );
            }
        }

        foreach ($seenPairs as $pair) {
            $taxRow = $pair['taxonomyRow'] ?? [];
            $targetId = $pair['targetInvId'];
            if ($targetId) {
                self::ensureInvNode($pdo, $planningId, $nodes, $targetId);
                $color = $pair['isGoal']
                    ? (string) ($pair['goalColor'] ?? '#00AB55')
                    : '#8b5cf6';
                $edges[] = self::edge(
                    'bank:' . $pair['bankId'],
                    'inv:' . $targetId,
                    $pair['amount'],
                    'investment',
                    $pair['label'],
                    $pair['isGoal'] ? 'goal' : 'investment',
                    $color,
                    $pair['txId'],
                    $taxRow
                );
            } else {
                $destId = 'tx-out:' . $pair['txId'];
                $nodes[$destId] = self::flowNode(
                    $destId,
                    $pair['isGoal'] ? 'goal' : 'investment',
                    $pair['label'],
                    $pair['isGoal'] ? (string) ($pair['goalColor'] ?? '#00AB55') : '#8b5cf6'
                );
                $edges[] = self::edge(
                    'bank:' . $pair['bankId'],
                    $destId,
                    $pair['amount'],
                    'investment',
                    $pair['label'],
                    $pair['isGoal'] ? 'goal' : 'investment',
                    '#8b5cf6',
                    $pair['txId'],
                    $taxRow
                );
            }
        }

        foreach ($pendingTransfers as $xfer) {
            $destId = 'tx-xfer:' . $xfer['txId'];
            $nodes[$destId] = self::flowNode($destId, 'transfer', $xfer['label'], '#0ea5e9');
            $edges[] = self::edge(
                $xfer['fromNode'],
                $destId,
                $xfer['amount'],
                'transfer',
                $xfer['label'],
                'transfer',
                '#0ea5e9',
                $xfer['txId'],
                $xfer['row'],
                true
            );
        }

        $invIncome = $pdo->prepare(
            'SELECT t.*, fa.id AS fa_id, fa.name AS fa_name, fa.type AS fa_type, fa.color AS fa_color,
                    mpe.financial_goal_id, fg.color AS goal_color
             FROM transactions t
             LEFT JOIN financial_accounts fa ON fa.id = t.account_id
             LEFT JOIN month_plan_entries mpe ON mpe.transaction_id = t.id AND mpe.planning_id = t.planning_id
             LEFT JOIN financial_goals fg ON fg.id = mpe.financial_goal_id
             WHERE t.planning_id = ? AND YEAR(t.transaction_date) = ? AND MONTH(t.transaction_date) = ?
               AND t.kind = "income" AND fa.type = "investment"
               AND t.notes LIKE "%Aporte%"'
        );
        $invIncome->execute([$planningId, $year, $month]);
        foreach ($invIncome->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $amount = (float) $row['amount_brl'];
            if ($amount <= 0) {
                continue;
            }
            $invId = (int) $row['account_id'];
            self::ensureInvNode($pdo, $planningId, $nodes, $invId, $row);
        }

        return self::pack(
            $pdo,
            $planningId,
            $year,
            $month,
            'confirmed',
            ...self::withCreditCardsAndBills($pdo, $planningId, $year, $month, $nodes, $edges, [])
        );
    }

    /**
     * Sempre inclui cartões ativos e, se houver cobranças no mês, a fatura a pagar (banco → cartão).
     *
     * @param array<string, array<string, mixed>> $nodes
     * @param list<array<string, mixed>> $edges
     * @param list<array<string, mixed>> $unassigned
     * @return array{0: list<array<string, mixed>>, 1: list<array<string, mixed>>, 2: list<array<string, mixed>>}
     */
    private static function withCreditCardsAndBills(
        PDO $pdo,
        int $planningId,
        int $year,
        int $month,
        array $nodes,
        array $edges,
        array $unassigned
    ): array {
        $stmt = $pdo->prepare(
            "SELECT id, name, type, color, due_day, closing_day
             FROM financial_accounts
             WHERE planning_id = ? AND active = 1 AND type = 'credit'
             ORDER BY name"
        );
        $stmt->execute([$planningId]);
        $cards = $stmt->fetchAll(PDO::FETCH_ASSOC);

        foreach ($cards as $acc) {
            $accountId = (int) $acc['id'];
            self::ensureCreditNode($pdo, $planningId, $nodes, $accountId, [
                'fa_name' => $acc['name'],
                'fa_color' => $acc['color'] ?? '#f59e0b',
                'fa_type' => 'credit',
            ]);

            $forecast = AccountService::creditMonthForecast(
                $pdo,
                $planningId,
                $accountId,
                $year,
                $month
            );
            $total = (float) ($forecast['totalBrl'] ?? 0);
            if ($total <= 0) {
                continue;
            }

            // Já existe aresta de pagamento banco→cartão neste grafo? (confirmado)
            $creditNode = 'credit:' . $accountId;
            $alreadyPaidEdge = false;
            foreach ($edges as $e) {
                if (
                    ($e['to'] ?? '') === $creditNode
                    && ($e['kind'] ?? '') === 'transfer'
                ) {
                    $alreadyPaidEdge = true;
                    break;
                }
            }

            $dueDay = isset($acc['due_day']) && $acc['due_day'] !== null
                ? (int) $acc['due_day'] : null;
            $payLabel = $dueDay
                ? 'Pagar fatura (vence dia ' . $dueDay . ')'
                : 'Pagar fatura , ' . $acc['name'];

            // Compras do cartão já ligam credit → expense; a fatura é o que o banco precisa pagar.
            if (!$alreadyPaidEdge) {
                $synthId = -900000 - $accountId;
                $unassigned[] = [
                    'entryId' => $synthId,
                    'label' => $payLabel,
                    'amountBrl' => $total,
                    'kind' => 'transfer',
                    'subKind' => 'bill',
                    'color' => '#f59e0b',
                    'targetId' => $creditNode,
                ];
                $edges[] = self::edge(
                    'unassigned:' . $synthId,
                    $creditNode,
                    $total,
                    'transfer',
                    $payLabel,
                    'bill',
                    '#f59e0b',
                    $synthId,
                    [],
                    true
                );
            }
        }

        return [array_values($nodes), $edges, $unassigned];
    }

    /** Garante nó bank:, inv: ou credit: conforme o tipo da conta. @return string|null node id */
    private static function ensureAccountNode(
        PDO $pdo,
        int $planningId,
        array &$nodes,
        int $accountId,
        ?array $row = null
    ): ?string {
        $type = (string) ($row['fa_type'] ?? ($row['type'] ?? ''));
        if ($type === '' || ($row && empty($row['fa_name']) && empty($row['name']))) {
            $acc = self::fetchAccount($pdo, $planningId, $accountId);
            if (!$acc) {
                return null;
            }
            $type = (string) ($acc['type'] ?? 'bank');
            $row = array_merge($row ?? [], [
                'fa_name' => $acc['name'],
                'fa_color' => $acc['color'] ?? null,
                'fa_type' => $type,
            ]);
        }
        if ($type === 'investment') {
            self::ensureInvNode($pdo, $planningId, $nodes, $accountId, $row);

            return 'inv:' . $accountId;
        }
        if ($type === 'credit') {
            self::ensureCreditNode($pdo, $planningId, $nodes, $accountId, $row);

            return 'credit:' . $accountId;
        }
        self::ensureBankNode($pdo, $planningId, $nodes, $accountId, $row);

        return 'bank:' . $accountId;
    }

    /** @param array<string, array<string, mixed>> $nodes */
    private static function ensureCreditNode(
        PDO $pdo,
        int $planningId,
        array &$nodes,
        int $accountId,
        ?array $row = null
    ): void {
        $key = 'credit:' . $accountId;
        if (isset($nodes[$key])) {
            return;
        }
        if ($row && !empty($row['fa_name'])) {
            $nodes[$key] = [
                'id' => $key,
                'type' => 'credit',
                'label' => $row['fa_name'],
                'color' => $row['fa_color'] ?? '#f59e0b',
                'accountId' => $accountId,
            ];

            return;
        }
        $acc = self::fetchAccount($pdo, $planningId, $accountId);
        if ($acc) {
            $nodes[$key] = [
                'id' => $key,
                'type' => 'credit',
                'label' => $acc['name'],
                'color' => $acc['color'] ?? '#f59e0b',
                'accountId' => $accountId,
            ];
        }
    }

    /** Leg espelho banco → investimento ao confirmar aporte (não é recebimento operacional). */
    private static function isInvestmentMirrorInflow(array $row): bool
    {
        return str_contains((string) ($row['notes'] ?? ''), 'Aporte');
    }

    /** Conta que recebe o recebimento: plano (destino) ou conta da transação. */
    private static function resolveIncomeDestinationAccountId(array $row): int
    {
        if (!empty($row['mpe_target_id'])) {
            return (int) $row['mpe_target_id'];
        }

        return (int) $row['account_id'];
    }

    /** @param array<string, array<string, mixed>> $nodes */
    private static function ensureBankNode(
        PDO $pdo,
        int $planningId,
        array &$nodes,
        int $accountId,
        ?array $row = null
    ): void {
        $key = 'bank:' . $accountId;
        if (isset($nodes[$key])) {
            return;
        }
        if ($row && !empty($row['fa_name'])) {
            $nodes[$key] = [
                'id' => $key,
                'type' => 'bank',
                'label' => $row['fa_name'],
                'color' => $row['fa_color'] ?? '#3b82f6',
                'accountId' => $accountId,
            ];

            return;
        }
        $acc = self::fetchAccount($pdo, $planningId, $accountId);
        if ($acc) {
            $nodes[$key] = [
                'id' => $key,
                'type' => 'bank',
                'label' => $acc['name'],
                'color' => $acc['color'] ?? '#3b82f6',
                'accountId' => $accountId,
            ];
        }
    }

    /** @param array<string, array<string, mixed>> $nodes */
    private static function ensureInvNode(
        PDO $pdo,
        int $planningId,
        array &$nodes,
        int $accountId,
        ?array $row = null
    ): void {
        $key = 'inv:' . $accountId;
        if (isset($nodes[$key])) {
            return;
        }
        if ($row && !empty($row['fa_name'])) {
            $nodes[$key] = [
                'id' => $key,
                'type' => 'investment',
                'label' => $row['fa_name'],
                'color' => $row['fa_color'] ?? '#8b5cf6',
                'accountId' => $accountId,
            ];

            return;
        }
        $acc = self::fetchAccount($pdo, $planningId, $accountId);
        if ($acc) {
            $nodes[$key] = [
                'id' => $key,
                'type' => 'investment',
                'label' => $acc['name'],
                'color' => $acc['color'] ?? '#8b5cf6',
                'accountId' => $accountId,
            ];
        }
    }

    /** @return array<string, mixed>|null */
    private static function fetchAccount(PDO $pdo, int $planningId, int $id): ?array
    {
        $stmt = $pdo->prepare(
            'SELECT id, name, type, color, due_day FROM financial_accounts
             WHERE id = ? AND planning_id = ? AND active = 1'
        );
        $stmt->execute([$id, $planningId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        return $row ?: null;
    }

    /** @return array<string, mixed> */
    private static function flowNode(string $id, string $type, string $label, string $color): array
    {
        return [
            'id' => $id,
            'type' => $type,
            'label' => $label,
            'color' => $color,
        ];
    }

    /**
     * @param array<string, mixed>|null $taxonomyRow linha do plano ou transação (categoria / aba).
     *
     * @return array<string, mixed>
     */
    private static function edge(
        string $from,
        string $to,
        float $amount,
        string $kind,
        string $label,
        string $subKind,
        string $color,
        int $refId,
        ?array $taxonomyRow = null,
        bool $dashed = false
    ): array {
        return array_merge(
            [
                'from' => $from,
                'to' => $to,
                'amountBrl' => round($amount, 2),
                'kind' => $kind,
                'label' => $label,
                'subKind' => $subKind,
                'color' => $color,
                'refId' => $refId,
                'dashed' => $dashed,
            ],
            self::taxonomyFields($taxonomyRow)
        );
    }

    /** @param array<string, mixed>|null $row */
    private static function taxonomyFields(?array $row): array
    {
        if ($row === null) {
            return [
                'itemCategoryId' => null,
                'itemCategoryName' => 'Geral',
                'customTabId' => null,
                'customTabName' => null,
            ];
        }

        $catId = !empty($row['item_category_id']) ? (int) $row['item_category_id'] : null;
        $catName = trim((string) ($row['item_category_name'] ?? $row['mpe_category'] ?? $row['category'] ?? ''));
        if ($catName === '') {
            $catName = !empty($row['financial_goal_id']) ? 'Metas' : 'Geral';
        }

        $tabId = !empty($row['custom_tab_id']) ? (int) $row['custom_tab_id'] : null;
        $tabName = isset($row['custom_tab_name']) && $row['custom_tab_name'] !== ''
            ? (string) $row['custom_tab_name']
            : null;

        return [
            'itemCategoryId' => $catId,
            'itemCategoryName' => $catName,
            'customTabId' => $tabId,
            'customTabName' => $tabName,
        ];
    }

    /** @return array<string, mixed> */
    private static function filterOptions(PDO $pdo, int $planningId): array
    {
        $accounts = [];
        $stmt = $pdo->prepare(
            'SELECT id, name, type, color FROM financial_accounts
             WHERE planning_id = ? AND active = 1
             ORDER BY type DESC, name'
        );
        $stmt->execute([$planningId]);
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $type = (string) $row['type'];
            $accounts[] = [
                'id' => (int) $row['id'],
                'name' => $row['name'],
                'type' => $type,
                'color' => $row['color'] ?? ($type === 'investment' ? '#2065D1' : '#3b82f6'),
                'nodeId' => match ($type) {
                    'investment' => 'inv:' . (int) $row['id'],
                    'credit' => 'credit:' . (int) $row['id'],
                    default => 'bank:' . (int) $row['id'],
                },
            ];
        }

        $categories = [];
        $catStmt = $pdo->prepare(
            'SELECT id, name, icon FROM planning_item_categories
             WHERE planning_id = ? AND active = 1
             ORDER BY sort_order, name'
        );
        $catStmt->execute([$planningId]);
        foreach ($catStmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $categories[] = [
                'id' => (int) $row['id'],
                'name' => $row['name'],
                'icon' => $row['icon'] ?? '📌',
            ];
        }

        $customTabs = [];
        $tabStmt = $pdo->prepare(
            'SELECT id, name FROM planning_custom_tabs
             WHERE planning_id = ? AND active = 1
             ORDER BY sort_order, name'
        );
        $tabStmt->execute([$planningId]);
        foreach ($tabStmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $customTabs[] = [
                'id' => (int) $row['id'],
                'name' => $row['name'],
            ];
        }

        return [
            'accounts' => $accounts,
            'categories' => $categories,
            'customTabs' => $customTabs,
        ];
    }

    /**
     * @param list<array<string, mixed>> $nodes
     * @param list<array<string, mixed>> $edges
     * @param list<array<string, mixed>> $unassigned
     * @return array<string, mixed>
     */
    private static function pack(
        PDO $pdo,
        int $planningId,
        int $year,
        int $month,
        string $mode,
        array $nodes,
        array $edges,
        array $unassigned
    ): array {
        $banks = array_values(array_filter(
            $nodes,
            static fn (array $n) => in_array($n['type'], ['bank', 'credit'], true)
        ));
        $investments = array_values(array_filter($nodes, static fn (array $n) => $n['type'] === 'investment'));
        $flows = array_values(array_filter(
            $nodes,
            static fn (array $n) => !in_array($n['type'], ['bank', 'investment', 'credit'], true)
        ));

        $layout = self::layoutNodes($banks, $investments, $flows, $unassigned);

        return [
            'year' => $year,
            'month' => $month,
            'mode' => $mode,
            'nodes' => $layout['nodes'],
            'edges' => $edges,
            'unassigned' => $unassigned,
            'filterOptions' => self::filterOptions($pdo, $planningId),
            'width' => $layout['width'],
            'height' => $layout['height'],
            'totals' => [
                'outflowBrl' => round(array_sum(array_map(
                    static fn (array $e) => in_array($e['kind'], ['expense', 'investment'], true)
                        ? $e['amountBrl'] : 0,
                    $edges
                )), 2),
                'inflowBrl' => round(array_sum(array_map(
                    static fn (array $e) => $e['kind'] === 'income' ? $e['amountBrl'] : 0,
                    $edges
                )), 2),
            ],
        ];
    }

    /**
     * @param list<array<string, mixed>> $banks
     * @param list<array<string, mixed>> $investments
     * @param list<array<string, mixed>> $flows
     * @param list<array<string, mixed>> $unassigned
     * @return array{nodes: list<array<string, mixed>>, width: int, height: int}
     */
    private static function layoutNodes(
        array $banks,
        array $investments,
        array $flows,
        array $unassigned
    ): array {
        $colX = [80, 280, 480];
        $rowH = 72;
        $nodes = [];
        $y = 40;

        foreach ($banks as $n) {
            $nodes[] = array_merge($n, ['x' => $colX[0], 'y' => $y, 'column' => 'bank']);
            $y += $rowH;
        }

        $yMid = 40;
        foreach ($investments as $n) {
            $nodes[] = array_merge($n, ['x' => $colX[1], 'y' => $yMid, 'column' => 'investment']);
            $yMid += $rowH;
        }

        $yFlow = 40;
        foreach ($flows as $n) {
            $nodes[] = array_merge($n, ['x' => $colX[2], 'y' => $yFlow, 'column' => 'flow']);
            $yFlow += $rowH;
        }

        foreach ($unassigned as $i => $u) {
            $nodes[] = [
                'id' => 'unassigned:' . $u['entryId'],
                'type' => $u['subKind'],
                'label' => $u['label'],
                'color' => $u['color'],
                'x' => $colX[0],
                'y' => max($y, $yFlow) + $i * $rowH,
                'column' => 'unassigned',
                'unassigned' => true,
            ];
        }

        $height = max($y, $yMid, $yFlow, 40 + count($unassigned) * $rowH) + 60;
        $width = 560;

        return ['nodes' => $nodes, 'width' => $width, 'height' => max(280, $height)];
    }
}
