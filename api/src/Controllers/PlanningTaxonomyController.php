<?php

declare(strict_types=1);

namespace Gastos\Api\Controllers;

use Gastos\Api\Auth;
use Gastos\Api\CategoryIcon;
use Gastos\Api\Database;
use Gastos\Api\Response;
use PDO;

final class PlanningTaxonomyController
{
    public static function index(): void
    {
        $planningId = Auth::requirePlanningId();
        $pdo = Database::connection();
        Response::json([
            'customTabs' => self::listTabs($pdo, $planningId),
            'itemCategories' => self::listCategories($pdo, $planningId),
            'categoryIconOptions' => CategoryIcon::catalog(),
        ]);
    }

    public static function storeTab(): void
    {
        $planningId = Auth::requirePlanningId();
        $body = json_decode(file_get_contents('php://input') ?: '{}', true) ?? [];
        $name = trim((string) ($body['name'] ?? ''));
        if ($name === '') {
            Response::error('Nome da aba obrigatório.', 422);
        }

        $pdo = Database::connection();
        $sort = (int) ($body['sortOrder'] ?? self::nextTabSort($pdo, $planningId));
        $stmt = $pdo->prepare(
            'INSERT INTO planning_custom_tabs (planning_id, name, sort_order) VALUES (?, ?, ?)'
        );
        try {
            $stmt->execute([$planningId, $name, $sort]);
        } catch (\PDOException $e) {
            if (str_contains($e->getMessage(), 'Duplicate')) {
                Response::error('Já existe uma aba com esse nome.', 422);
            }
            throw $e;
        }

        Response::json(['item' => self::mapTab(self::fetchTab($pdo, (int) $pdo->lastInsertId(), $planningId))], 201);
    }

    public static function updateTab(int $id): void
    {
        $planningId = Auth::requirePlanningId();
        $body = json_decode(file_get_contents('php://input') ?: '{}', true) ?? [];
        $name = trim((string) ($body['name'] ?? ''));
        if ($name === '') {
            Response::error('Nome da aba obrigatório.', 422);
        }

        $pdo = Database::connection();
        $stmt = $pdo->prepare(
            'UPDATE planning_custom_tabs SET name = ?, sort_order = ?
             WHERE id = ? AND planning_id = ? AND active = 1'
        );
        $stmt->execute([
            $name,
            (int) ($body['sortOrder'] ?? 0),
            $id,
            $planningId,
        ]);
        if ($stmt->rowCount() === 0 && !self::tabExists($pdo, $id, $planningId)) {
            Response::error('Aba não encontrada.', 404);
        }
        Response::json(['item' => self::mapTab(self::fetchTab($pdo, $id, $planningId))]);
    }

    public static function destroyTab(int $id): void
    {
        $planningId = Auth::requirePlanningId();
        $pdo = Database::connection();
        $pdo->prepare(
            'UPDATE planning_custom_tabs SET active = 0 WHERE id = ? AND planning_id = ?'
        )->execute([$id, $planningId]);
        $pdo->prepare(
            'UPDATE recurring_items SET custom_tab_id = NULL WHERE custom_tab_id = ? AND planning_id = ?'
        )->execute([$id, $planningId]);
        Response::json(['ok' => true]);
    }

    public static function storeCategory(): void
    {
        $planningId = Auth::requirePlanningId();
        $body = json_decode(file_get_contents('php://input') ?: '{}', true) ?? [];
        $name = trim((string) ($body['name'] ?? ''));
        if ($name === '') {
            Response::error('Nome da categoria obrigatório.', 422);
        }

        $pdo = Database::connection();
        $sort = (int) ($body['sortOrder'] ?? self::nextCategorySort($pdo, $planningId));
        $icon = CategoryIcon::normalize($body['icon'] ?? null, $name);
        $stmt = $pdo->prepare(
            'INSERT INTO planning_item_categories (planning_id, name, icon, sort_order) VALUES (?, ?, ?, ?)'
        );
        try {
            $stmt->execute([$planningId, $name, $icon, $sort]);
        } catch (\PDOException $e) {
            if (str_contains($e->getMessage(), 'Duplicate')) {
                Response::error('Já existe uma categoria com esse nome.', 422);
            }
            throw $e;
        }

        $row = self::fetchCategory($pdo, (int) $pdo->lastInsertId(), $planningId);
        Response::json(['item' => self::mapCategory($row)], 201);
    }

    public static function updateCategory(int $id): void
    {
        $planningId = Auth::requirePlanningId();
        $body = json_decode(file_get_contents('php://input') ?: '{}', true) ?? [];
        $name = trim((string) ($body['name'] ?? ''));
        if ($name === '') {
            Response::error('Nome da categoria obrigatório.', 422);
        }

        $pdo = Database::connection();
        $icon = isset($body['icon'])
            ? CategoryIcon::normalize($body['icon'], $name)
            : null;
        if ($icon !== null) {
            $stmt = $pdo->prepare(
                'UPDATE planning_item_categories SET name = ?, icon = ?, sort_order = ?
                 WHERE id = ? AND planning_id = ? AND active = 1'
            );
            $stmt->execute([
                $name,
                $icon,
                (int) ($body['sortOrder'] ?? 0),
                $id,
                $planningId,
            ]);
        } else {
            $stmt = $pdo->prepare(
                'UPDATE planning_item_categories SET name = ?, sort_order = ?
                 WHERE id = ? AND planning_id = ? AND active = 1'
            );
            $stmt->execute([
                $name,
                (int) ($body['sortOrder'] ?? 0),
                $id,
                $planningId,
            ]);
        }
        if ($stmt->rowCount() === 0 && !self::categoryExists($pdo, $id, $planningId)) {
            Response::error('Categoria não encontrada.', 404);
        }
        $pdo->prepare(
            'UPDATE recurring_items SET category = ? WHERE item_category_id = ? AND planning_id = ?'
        )->execute([$name, $id, $planningId]);
        $when = \Gastos\Api\Services\ProjectionService::sqlCurrentOrFutureMonthClause();
        $pdo->prepare(
            "UPDATE month_plan_entries SET category = ?
             WHERE item_category_id = ? AND planning_id = ? AND status = 'pending' AND {$when}"
        )->execute([$name, $id, $planningId]);

        Response::json(['item' => self::mapCategory(self::fetchCategory($pdo, $id, $planningId))]);
    }

    public static function destroyCategory(int $id): void
    {
        $planningId = Auth::requirePlanningId();
        $pdo = Database::connection();
        $pdo->prepare(
            'UPDATE planning_item_categories SET active = 0 WHERE id = ? AND planning_id = ?'
        )->execute([$id, $planningId]);
        $pdo->prepare(
            'UPDATE recurring_items SET item_category_id = NULL WHERE item_category_id = ? AND planning_id = ?'
        )->execute([$id, $planningId]);
        Response::json(['ok' => true]);
    }

    /** @return list<array<string, mixed>> */
    public static function listTabs(PDO $pdo, int $planningId): array
    {
        $stmt = $pdo->prepare(
            'SELECT * FROM planning_custom_tabs
             WHERE planning_id = ? AND active = 1
             ORDER BY sort_order, name'
        );
        $stmt->execute([$planningId]);

        return array_map([self::class, 'mapTab'], $stmt->fetchAll(PDO::FETCH_ASSOC));
    }

    /** @return list<array<string, mixed>> */
    public static function listCategories(PDO $pdo, int $planningId): array
    {
        $stmt = $pdo->prepare(
            'SELECT * FROM planning_item_categories
             WHERE planning_id = ? AND active = 1
             ORDER BY sort_order, name'
        );
        $stmt->execute([$planningId]);

        return array_map([self::class, 'mapCategory'], $stmt->fetchAll(PDO::FETCH_ASSOC));
    }

    public static function resolveCategoryId(
        PDO $pdo,
        int $planningId,
        ?int $categoryId,
        ?string $name,
        ?string $icon = null
    ): ?int {
        if ($categoryId !== null && $categoryId > 0) {
            $stmt = $pdo->prepare(
                'SELECT id, name FROM planning_item_categories
                 WHERE id = ? AND planning_id = ? AND active = 1'
            );
            $stmt->execute([$categoryId, $planningId]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$row) {
                Response::error('Categoria não encontrada.', 422);
            }

            return (int) $row['id'];
        }

        $name = trim((string) ($name ?? ''));
        if ($name === '') {
            return null;
        }

        $stmt = $pdo->prepare(
            'SELECT id FROM planning_item_categories
             WHERE planning_id = ? AND name = ? AND active = 1'
        );
        $stmt->execute([$planningId, $name]);
        $id = $stmt->fetchColumn();
        if ($id) {
            return (int) $id;
        }

        $sort = self::nextCategorySort($pdo, $planningId);
        $iconNorm = CategoryIcon::normalize($icon, $name);
        $pdo->prepare(
            'INSERT INTO planning_item_categories (planning_id, name, icon, sort_order) VALUES (?, ?, ?, ?)'
        )->execute([$planningId, $name, $iconNorm, $sort]);

        return (int) $pdo->lastInsertId();
    }

    public static function categoryName(
        PDO $pdo,
        int $planningId,
        ?int $categoryId,
        string $fallback
    ): string {
        if ($categoryId === null || $categoryId <= 0) {
            return $fallback;
        }
        $stmt = $pdo->prepare(
            'SELECT name FROM planning_item_categories WHERE id = ? AND planning_id = ?'
        );
        $stmt->execute([$categoryId, $planningId]);
        $name = $stmt->fetchColumn();

        return $name ? (string) $name : $fallback;
    }

    /**
     * @param array<string, mixed> $body
     *
     * @return array{customTabId: ?int, itemCategoryId: ?int, category: string, region: string}
     */
    public static function resolveEntryTaxonomy(
        PDO $pdo,
        int $planningId,
        array $body,
        string $fallbackCategory = 'Geral'
    ): array {
        $customTabId = self::validateTabId(
            $pdo,
            $planningId,
            isset($body['customTabId']) ? (int) $body['customTabId'] : null
        );
        $categoryId = self::resolveCategoryId(
            $pdo,
            $planningId,
            isset($body['itemCategoryId']) ? (int) $body['itemCategoryId'] : null,
            ($body['newCategoryName'] ?? '') !== ''
                ? $body['newCategoryName']
                : ($body['category'] ?? null),
            $body['newCategoryIcon'] ?? null
        );
        $categoryLabel = self::categoryName(
            $pdo,
            $planningId,
            $categoryId,
            trim((string) ($body['category'] ?? $fallbackCategory)) ?: $fallbackCategory
        );
        $region = $customTabId !== null
            ? self::regionForTab($pdo, $customTabId, $planningId)
            : self::parseRegion($body);

        return [
            'customTabId' => $customTabId,
            'itemCategoryId' => $categoryId,
            'category' => $categoryLabel,
            'region' => $region,
        ];
    }

    /** @param array<string, mixed> $body */
    public static function parseRegion(array $body): string
    {
        $region = $body['region'] ?? 'geral';

        return in_array($region, ['BR', 'PT', 'geral'], true) ? $region : 'geral';
    }

    public static function regionForTab(PDO $pdo, ?int $tabId, int $planningId): string
    {
        if ($tabId === null || $tabId <= 0) {
            return 'geral';
        }
        $stmt = $pdo->prepare(
            'SELECT name FROM planning_custom_tabs WHERE id = ? AND planning_id = ? AND active = 1'
        );
        $stmt->execute([$tabId, $planningId]);
        $name = mb_strtolower((string) ($stmt->fetchColumn() ?: ''));

        if (str_contains($name, 'brasil') || $name === 'br') {
            return 'BR';
        }
        if (str_contains($name, 'portugal') || $name === 'pt') {
            return 'PT';
        }

        return 'geral';
    }

    public static function validateTabId(PDO $pdo, int $planningId, ?int $tabId): ?int
    {
        if ($tabId === null || $tabId <= 0) {
            return null;
        }
        $stmt = $pdo->prepare(
            'SELECT id FROM planning_custom_tabs WHERE id = ? AND planning_id = ? AND active = 1'
        );
        $stmt->execute([$tabId, $planningId]);
        if (!$stmt->fetch()) {
            Response::error('Aba personalizada não encontrada.', 422);
        }

        return $tabId;
    }

    private static function nextTabSort(PDO $pdo, int $planningId): int
    {
        $stmt = $pdo->prepare(
            'SELECT COALESCE(MAX(sort_order), 0) + 1 FROM planning_custom_tabs WHERE planning_id = ?'
        );
        $stmt->execute([$planningId]);

        return (int) $stmt->fetchColumn();
    }

    private static function nextCategorySort(PDO $pdo, int $planningId): int
    {
        $stmt = $pdo->prepare(
            'SELECT COALESCE(MAX(sort_order), 0) + 1 FROM planning_item_categories WHERE planning_id = ?'
        );
        $stmt->execute([$planningId]);

        return (int) $stmt->fetchColumn();
    }

    /** @return array<string, mixed> */
    private static function fetchTab(PDO $pdo, int $id, int $planningId): array
    {
        $stmt = $pdo->prepare(
            'SELECT * FROM planning_custom_tabs WHERE id = ? AND planning_id = ?'
        );
        $stmt->execute([$id, $planningId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            Response::error('Aba não encontrada.', 404);
        }

        return $row;
    }

    /** @return array<string, mixed> */
    private static function fetchCategory(PDO $pdo, int $id, int $planningId): array
    {
        $stmt = $pdo->prepare(
            'SELECT * FROM planning_item_categories WHERE id = ? AND planning_id = ?'
        );
        $stmt->execute([$id, $planningId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            Response::error('Categoria não encontrada.', 404);
        }

        return $row;
    }

    private static function tabExists(PDO $pdo, int $id, int $planningId): bool
    {
        $stmt = $pdo->prepare(
            'SELECT 1 FROM planning_custom_tabs WHERE id = ? AND planning_id = ?'
        );
        $stmt->execute([$id, $planningId]);

        return (bool) $stmt->fetch();
    }

    private static function categoryExists(PDO $pdo, int $id, int $planningId): bool
    {
        $stmt = $pdo->prepare(
            'SELECT 1 FROM planning_item_categories WHERE id = ? AND planning_id = ?'
        );
        $stmt->execute([$id, $planningId]);

        return (bool) $stmt->fetch();
    }

    /** @param array<string, mixed> $row */
    public static function mapTab(array $row): array
    {
        return [
            'id' => (int) $row['id'],
            'name' => $row['name'],
            'sortOrder' => (int) $row['sort_order'],
        ];
    }

    /** @param array<string, mixed> $row */
    public static function mapCategory(array $row): array
    {
        return [
            'id' => (int) $row['id'],
            'name' => $row['name'],
            'icon' => CategoryIcon::normalize($row['icon'] ?? null, $row['name']),
            'sortOrder' => (int) $row['sort_order'],
        ];
    }
}
