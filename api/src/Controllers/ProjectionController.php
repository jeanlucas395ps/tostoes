<?php

declare(strict_types=1);

namespace Gastos\Api\Controllers;

use Gastos\Api\Auth;
use Gastos\Api\Database;
use Gastos\Api\Response;
use Gastos\Api\ResponsibleUser;
use Gastos\Api\Services\PlanningService;
use PDO;

final class ProjectionController
{
    public static function index(): void
    {
        Auth::requireUser();
        $planningId = Auth::requirePlanningId();
        $year = isset($_GET['year']) ? (int) $_GET['year'] : (int) date('Y');
        $kind = $_GET['kind'] ?? null;

        $sql = 'SELECT p.*, it.name AS investment_type_name, it.color AS investment_type_color,
                       ' . ResponsibleUser::selectColumns() . '
                FROM monthly_projections p
                LEFT JOIN investment_types it ON it.id = p.investment_type_id
                ' . ResponsibleUser::joinClause('p') . '
                WHERE p.planning_id = ? AND p.year = ?';
        $params = [$planningId, $year];

        if ($kind !== null && in_array($kind, ['income', 'expense', 'investment', 'leisure'], true)) {
            $sql .= ' AND p.kind = ?';
            $params[] = $kind;
        }
        $sql .= ' ORDER BY p.month, p.kind, p.name';

        $pdo = Database::connection();
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        Response::json(['items' => array_map([self::class, 'map'], $stmt->fetchAll(PDO::FETCH_ASSOC))]);
    }

    public static function store(): void
    {
        Auth::requireUser();
        $planningId = Auth::requirePlanningId();
        $body = self::parseBody();
        $pdo = Database::connection();
        $responsible = ResponsibleUser::parseFromBody($pdo, $body, $planningId);
        $ownerId = PlanningService::ownerUserId($pdo, $planningId);
        $stmt = $pdo->prepare(
            'INSERT INTO monthly_projections
             (user_id, planning_id, year, month, kind, name, category, region, amount_brl, investment_type_id, due_day,
              responsible, responsible_user_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE amount_brl = VALUES(amount_brl), category = VALUES(category),
               responsible = VALUES(responsible), responsible_user_id = VALUES(responsible_user_id)'
        );
        $stmt->execute([
            $ownerId,
            $planningId,
            $body['year'],
            $body['month'],
            $body['kind'],
            $body['name'],
            $body['category'],
            $body['region'],
            $body['amountBrl'],
            $body['investmentTypeId'],
            $body['dueDay'],
            $responsible['responsible'],
            $responsible['responsibleUserId'],
        ]);
        Response::json(['ok' => true, 'id' => (int) $pdo->lastInsertId()]);
    }

    public static function destroy(int $id): void
    {
        Auth::requireUser();
        $planningId = Auth::requirePlanningId();
        $pdo = Database::connection();
        $stmt = $pdo->prepare('DELETE FROM monthly_projections WHERE id = ? AND planning_id = ?');
        $stmt->execute([$id, $planningId]);
        Response::json(['ok' => true]);
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
        return [
            'year' => (int) ($body['year'] ?? date('Y')),
            'month' => (int) ($body['month'] ?? 1),
            'kind' => $kind,
            'name' => $name,
            'category' => trim((string) ($body['category'] ?? 'Geral')) ?: 'Geral',
            'region' => PlanningTaxonomyController::parseRegion($body),
            'amountBrl' => (float) ($body['amountBrl'] ?? 0),
            'investmentTypeId' => !empty($body['investmentTypeId']) ? (int) $body['investmentTypeId'] : null,
            'dueDay' => isset($body['dueDay']) ? (int) $body['dueDay'] : null,
            'responsibleUserId' => $body['responsibleUserId'] ?? null,
            'responsible' => ($body['responsible'] ?? null) ?: null,
        ];
    }

    public static function map(array $row): array
    {
        return ResponsibleUser::enrichMap([
            'id' => (int) $row['id'],
            'year' => (int) $row['year'],
            'month' => (int) $row['month'],
            'kind' => $row['kind'],
            'name' => $row['name'],
            'category' => $row['category'],
            'region' => $row['region'],
            'amountBrl' => (float) $row['amount_brl'],
            'investmentTypeId' => $row['investment_type_id'] ? (int) $row['investment_type_id'] : null,
            'investmentTypeName' => $row['investment_type_name'] ?? null,
            'investmentTypeColor' => $row['investment_type_color'] ?? null,
            'dueDay' => $row['due_day'] ? (int) $row['due_day'] : null,
            'responsible' => $row['responsible'],
        ], $row);
    }
}
