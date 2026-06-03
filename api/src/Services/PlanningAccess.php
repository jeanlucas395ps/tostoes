<?php

declare(strict_types=1);

namespace Gastos\Api\Services;

use Gastos\Api\Auth;
use Gastos\Api\Database;
use Gastos\Api\Response;
use PDO;

/**
 * Garante que o usuário autenticado só acede a recursos do planejamento em que é membro.
 */
final class PlanningAccess
{
    /** @var list<string> */
    private const PLANNING_SCOPED_TABLES = [
        'recurring_items',
        'month_plan_entries',
        'transactions',
        'financial_accounts',
        'financial_goals',
        'investment_types',
        'monthly_projections',
        'planning_custom_tabs',
        'planning_item_categories',
        'planning_settings',
    ];

    public static function requireMemberForPlanning(int $planningId): int
    {
        $userId = Auth::requireUser();
        $pdo = Database::connection();
        PlanningService::assertMember($pdo, $planningId, $userId);

        return $planningId;
    }

    public static function assertRowInPlanning(
        PDO $pdo,
        string $table,
        int $id,
        int $planningId,
        string $notFoundMessage = 'Recurso não encontrado.'
    ): void {
        if (!in_array($table, self::PLANNING_SCOPED_TABLES, true)) {
            Response::error('Tabela inválida.', 500);
        }
        $stmt = $pdo->prepare(
            "SELECT 1 FROM {$table} WHERE id = ? AND planning_id = ? LIMIT 1"
        );
        $stmt->execute([$id, $planningId]);
        if (!$stmt->fetch()) {
            Response::error($notFoundMessage, 404);
        }
    }

    /** Dois utilizadores partilham pelo menos um planejamento. */
    public static function assertUsersSharePlanning(PDO $pdo, int $viewerId, int $targetUserId): void
    {
        if ($viewerId === $targetUserId) {
            return;
        }
        $stmt = $pdo->prepare(
            'SELECT 1 FROM planning_members a
             INNER JOIN planning_members b ON b.planning_id = a.planning_id AND b.user_id = ?
             WHERE a.user_id = ? LIMIT 1'
        );
        $stmt->execute([$targetUserId, $viewerId]);
        if (!$stmt->fetch()) {
            Response::error('Sem permissão.', 403);
        }
    }
}
