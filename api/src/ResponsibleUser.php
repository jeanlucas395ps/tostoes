<?php

declare(strict_types=1);

namespace Gastos\Api;

use Gastos\Api\Controllers\AuthController;
use PDO;
use Gastos\Api\Response;

final class ResponsibleUser
{
    public const JOINT_LABEL = 'Conjunto';

    public static function selectColumns(string $alias = 'resp'): string
    {
        return "{$alias}.id AS resp_id, {$alias}.username AS resp_username,
                {$alias}.name AS resp_name, {$alias}.gender AS resp_gender,
                {$alias}.avatar_path AS resp_avatar_path";
    }

    public static function joinClause(string $tableAlias, string $column = 'responsible_user_id'): string
    {
        return "LEFT JOIN users resp ON resp.id = {$tableAlias}.{$column}";
    }

    /** @return array{responsibleUserId: int|null, responsible: string|null} */
    public static function parseFromBody(PDO $pdo, array $body, int $planningId): array
    {
        if (array_key_exists('responsibleUserId', $body)) {
            $id = $body['responsibleUserId'];
            if ($id === null || $id === '' || (int) $id === 0) {
                return ['responsibleUserId' => null, 'responsible' => self::JOINT_LABEL];
            }
            $userId = (int) $id;
            self::assertValidPlanningMember($pdo, $planningId, $userId);

            return [
                'responsibleUserId' => $userId,
                'responsible' => self::nameForId($pdo, $userId),
            ];
        }

        $text = isset($body['responsible']) ? trim((string) $body['responsible']) : '';
        if ($text === '' || strcasecmp($text, self::JOINT_LABEL) === 0) {
            return ['responsibleUserId' => null, 'responsible' => self::JOINT_LABEL];
        }

        $stmt = $pdo->prepare(
            'SELECT u.id, u.name FROM users u
             INNER JOIN planning_members pm ON pm.user_id = u.id AND pm.planning_id = ?
             WHERE LOWER(u.name) = LOWER(?) OR LOWER(u.username) = LOWER(?)
             LIMIT 1'
        );
        $stmt->execute([$planningId, $text, $text]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        return [
            'responsibleUserId' => $user ? (int) $user['id'] : null,
            'responsible' => $user ? (string) $user['name'] : $text,
        ];
    }

    public static function assertValidPlanningMember(PDO $pdo, int $planningId, int $userId): void
    {
        $stmt = $pdo->prepare(
            'SELECT 1 FROM planning_members WHERE planning_id = ? AND user_id = ? LIMIT 1'
        );
        $stmt->execute([$planningId, $userId]);
        if (!$stmt->fetch()) {
            Response::error('Responsável inválido.', 422);
        }
    }

    public static function nameForId(PDO $pdo, int $userId): string
    {
        $stmt = $pdo->prepare('SELECT name FROM users WHERE id = ? LIMIT 1');
        $stmt->execute([$userId]);
        $name = $stmt->fetchColumn();

        return $name !== false ? (string) $name : '';
    }

    /** @param array<string, mixed> $row */
    public static function mapFromRow(array $row): ?array
    {
        if (empty($row['resp_id'])) {
            return null;
        }

        return AuthController::mapUser([
            'id' => $row['resp_id'],
            'username' => $row['resp_username'],
            'name' => $row['resp_name'],
            'gender' => $row['resp_gender'] ?? 'male',
            'avatar_path' => $row['resp_avatar_path'] ?? null,
        ]);
    }

    /**
     * @param array<string, mixed> $mapped
     * @param array<string, mixed> $row
     * @return array<string, mixed>
     */
    public static function enrichMap(array $mapped, array $row): array
    {
        $mapped['responsibleUserId'] = !empty($row['responsible_user_id'])
            ? (int) $row['responsible_user_id'] : null;
        $mapped['responsibleUser'] = self::mapFromRow($row);
        if ($mapped['responsibleUser'] === null && empty($mapped['responsible'])) {
            $mapped['responsible'] = self::JOINT_LABEL;
        }

        return $mapped;
    }

    public static function migrateTextToUserIds(PDO $pdo): void
    {
        $tables = ['recurring_items', 'month_plan_entries', 'transactions', 'monthly_projections'];
        foreach ($tables as $table) {
            if (!self::columnExists($pdo, $table, 'responsible_user_id')) {
                continue;
            }
            $pdo->exec(
                "UPDATE {$table} t
                 INNER JOIN users u ON (
                   LOWER(u.name) = LOWER(t.responsible)
                   OR LOWER(u.username) = LOWER(t.responsible)
                 )
                 SET t.responsible_user_id = u.id
                 WHERE t.responsible IS NOT NULL
                   AND t.responsible != ''
                   AND LOWER(t.responsible) != 'conjunto'
                   AND t.responsible_user_id IS NULL"
            );
        }
    }

    private static function columnExists(PDO $pdo, string $table, string $column): bool
    {
        $stmt = $pdo->prepare(
            'SELECT 1 FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?'
        );
        $stmt->execute([$table, $column]);
        return (bool) $stmt->fetch();
    }
}
