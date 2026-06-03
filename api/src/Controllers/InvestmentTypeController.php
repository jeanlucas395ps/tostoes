<?php

declare(strict_types=1);

namespace Gastos\Api\Controllers;

use Gastos\Api\Auth;
use Gastos\Api\Database;
use Gastos\Api\Response;
use Gastos\Api\Services\InvestmentPortfolioService;
use Gastos\Api\Services\PlanningService;
use PDO;

final class InvestmentTypeController
{
    public static function portfolio(): void
    {
        Auth::requireUser();
        $planningId = Auth::requirePlanningId();
        $year = isset($_GET['year']) ? (int) $_GET['year'] : (int) date('Y');
        $month = isset($_GET['month']) ? (int) $_GET['month'] : (int) date('n');
        $pdo = Database::connection();
        Response::json(InvestmentPortfolioService::portfolio($pdo, $planningId, $year, $month));
    }

    public static function index(): void
    {
        Auth::requireUser();
        $planningId = Auth::requirePlanningId();
        $pdo = Database::connection();
        $stmt = $pdo->prepare(
            'SELECT * FROM investment_types WHERE planning_id = ? AND is_active = 1 ORDER BY sort_order, name'
        );
        $stmt->execute([$planningId]);
        Response::json(['items' => array_map([self::class, 'map'], $stmt->fetchAll(PDO::FETCH_ASSOC))]);
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
        $slug = self::slugify($name);
        $pdo = Database::connection();
        $ownerId = PlanningService::ownerUserId($pdo, $planningId);
        $stmt = $pdo->prepare(
            'INSERT INTO investment_types (user_id, planning_id, name, slug, color, target_monthly_brl, sort_order)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $ownerId,
            $planningId,
            $name,
            $slug,
            $body['color'] ?? '#3fb950',
            (float) ($body['targetMonthlyBrl'] ?? 0),
            (int) ($body['sortOrder'] ?? 0),
        ]);
        $id = (int) $pdo->lastInsertId();
        self::show($id, $planningId);
    }

    public static function update(int $id): void
    {
        Auth::requireUser();
        $planningId = Auth::requirePlanningId();
        $body = json_decode(file_get_contents('php://input') ?: '{}', true) ?? [];
        $pdo = Database::connection();
        $stmt = $pdo->prepare(
            'UPDATE investment_types SET
               name = COALESCE(?, name),
               color = COALESCE(?, color),
               target_monthly_brl = COALESCE(?, target_monthly_brl),
               sort_order = COALESCE(?, sort_order)
             WHERE id = ? AND planning_id = ?'
        );
        $stmt->execute([
            isset($body['name']) ? trim((string) $body['name']) : null,
            $body['color'] ?? null,
            isset($body['targetMonthlyBrl']) ? (float) $body['targetMonthlyBrl'] : null,
            isset($body['sortOrder']) ? (int) $body['sortOrder'] : null,
            $id,
            $planningId,
        ]);
        self::show($id, $planningId);
    }

    private static function show(int $id, int $planningId): void
    {
        $pdo = Database::connection();
        $stmt = $pdo->prepare('SELECT * FROM investment_types WHERE id = ? AND planning_id = ?');
        $stmt->execute([$id, $planningId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            Response::error('Tipo não encontrado.', 404);
        }
        Response::json(['item' => self::map($row)]);
    }

    public static function map(array $row): array
    {
        return [
            'id' => (int) $row['id'],
            'name' => $row['name'],
            'slug' => $row['slug'],
            'color' => $row['color'],
            'targetMonthlyBrl' => (float) $row['target_monthly_brl'],
            'currentBalanceBrl' => (float) ($row['current_balance_brl'] ?? 0),
            'sortOrder' => (int) $row['sort_order'],
        ];
    }

    private static function slugify(string $name): string
    {
        $s = strtolower(preg_replace('/[^a-zA-Z0-9]+/', '-', $name) ?? '');
        return trim($s, '-') ?: 'tipo';
    }
}
