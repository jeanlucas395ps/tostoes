<?php

declare(strict_types=1);

namespace Gastos\Api\Services;

use Gastos\Api\Response;
use PDO;

final class PlanningService
{
    public static function assertMember(PDO $pdo, int $planningId, int $userId): void
    {
        $stmt = $pdo->prepare(
            'SELECT 1 FROM planning_members WHERE planning_id = ? AND user_id = ? LIMIT 1'
        );
        $stmt->execute([$planningId, $userId]);
        if (!$stmt->fetch()) {
            Response::error('Sem acesso a este planejamento.', 403);
        }
    }

    public static function ownerUserId(PDO $pdo, int $planningId): int
    {
        $stmt = $pdo->prepare('SELECT created_by_user_id FROM plannings WHERE id = ? LIMIT 1');
        $stmt->execute([$planningId]);
        $id = $stmt->fetchColumn();

        return $id !== false ? (int) $id : 1;
    }

    /**
     * Primeiro mês com dados do planejamento (data de criação).
     *
     * @return array{year: int, month: int, date: string}
     */
    /**
     * @return array{year: int, month: int, date: string}
     */
    public static function usageStartFromTimestamp(?string $raw): array
    {
        $ts = $raw !== null && $raw !== '' ? strtotime($raw) : false;
        if ($ts === false) {
            return [
                'year' => (int) date('Y'),
                'month' => (int) date('n'),
                'date' => date('Y-m-d'),
            ];
        }

        return [
            'year' => (int) date('Y', $ts),
            'month' => (int) date('n', $ts),
            'date' => date('Y-m-d', $ts),
        ];
    }

    public static function usageStart(PDO $pdo, int $planningId): array
    {
        $stmt = $pdo->prepare('SELECT created_at FROM plannings WHERE id = ? LIMIT 1');
        $stmt->execute([$planningId]);
        $raw = $stmt->fetchColumn();

        return self::usageStartFromTimestamp($raw !== false ? (string) $raw : null);
    }

    /** @param array<string, mixed> $accountRow */
    public static function accountUsageStart(array $accountRow, array $planningUsage): array
    {
        $raw = $accountRow['created_at'] ?? null;
        if ($raw === null || $raw === '') {
            return $planningUsage;
        }

        return self::usageStartFromTimestamp((string) $raw);
    }

    public static function isBeforeUsageStart(
        int $year,
        int $month,
        int $startYear,
        int $startMonth
    ): bool {
        if ($year < $startYear) {
            return true;
        }
        if ($year > $startYear) {
            return false;
        }

        return $month < $startMonth;
    }

    public static function defaultPlanningForUser(PDO $pdo, int $userId): int
    {
        $stmt = $pdo->prepare(
            'SELECT planning_id FROM planning_members WHERE user_id = ? ORDER BY joined_at ASC LIMIT 1'
        );
        $stmt->execute([$userId]);
        $id = $stmt->fetchColumn();
        if ($id === false) {
            Response::error('Nenhum planejamento encontrado. Crie um planejamento primeiro.', 404);
        }
        return (int) $id;
    }

    /** @return list<array<string, mixed>> */
    public static function listForUser(PDO $pdo, int $userId): array
    {
        $stmt = $pdo->prepare(
            'SELECT p.id, p.name, p.created_at, pm.role,
                    (SELECT COUNT(*) FROM planning_members WHERE planning_id = p.id) AS member_count
             FROM plannings p
             INNER JOIN planning_members pm ON pm.planning_id = p.id AND pm.user_id = ?
             ORDER BY p.name'
        );
        $stmt->execute([$userId]);
        $items = [];
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $items[] = [
                'id' => (int) $row['id'],
                'name' => $row['name'],
                'role' => $row['role'],
                'memberCount' => (int) $row['member_count'],
                'createdAt' => $row['created_at'],
            ];
        }
        return $items;
    }

    public static function create(PDO $pdo, int $userId, string $name): int
    {
        $name = trim($name) ?: 'Novo planejamento';
        $pdo->prepare(
            'INSERT INTO plannings (name, created_by_user_id) VALUES (?, ?)'
        )->execute([$name, $userId]);
        $planningId = (int) $pdo->lastInsertId();

        $pdo->prepare(
            'INSERT INTO planning_members (planning_id, user_id, role) VALUES (?, ?, ?)'
        )->execute([$planningId, $userId, 'owner']);

        $pdo->prepare('INSERT INTO planning_settings (planning_id) VALUES (?)')
            ->execute([$planningId]);

        return $planningId;
    }

    public static function addMemberByUsername(PDO $pdo, int $planningId, int $requesterId, string $username): void
    {
        self::assertOwnerOrMember($pdo, $planningId, $requesterId);

        $username = strtolower(trim($username));
        $stmt = $pdo->prepare('SELECT id FROM users WHERE username = ? LIMIT 1');
        $stmt->execute([$username]);
        $targetId = $stmt->fetchColumn();
        if ($targetId === false) {
            Response::error('Usuário não encontrado.', 404);
        }
        $targetId = (int) $targetId;

        $check = $pdo->prepare(
            'SELECT 1 FROM planning_members WHERE planning_id = ? AND user_id = ?'
        );
        $check->execute([$planningId, $targetId]);
        if ($check->fetch()) {
            Response::error('Usuário já faz parte deste planejamento.', 422);
        }

        $pdo->prepare(
            'INSERT INTO planning_members (planning_id, user_id, role) VALUES (?, ?, ?)'
        )->execute([$planningId, $targetId, 'member']);
    }

    /** @return list<array<string, mixed>> */
    public static function members(PDO $pdo, int $planningId, int $userId): array
    {
        self::assertMember($pdo, $planningId, $userId);
        $stmt = $pdo->prepare(
            'SELECT u.id, u.username, u.email, u.name, u.gender, u.avatar_path, pm.role
             FROM planning_members pm
             INNER JOIN users u ON u.id = pm.user_id
             WHERE pm.planning_id = ?
             ORDER BY pm.role DESC, u.name'
        );
        $stmt->execute([$planningId]);
        $items = [];
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $mapped = \Gastos\Api\Controllers\AuthController::mapUser($row);
            $mapped['role'] = $row['role'];
            $items[] = $mapped;
        }
        return $items;
    }

    private static function assertOwnerOrMember(PDO $pdo, int $planningId, int $userId): void
    {
        self::assertMember($pdo, $planningId, $userId);
    }
}
