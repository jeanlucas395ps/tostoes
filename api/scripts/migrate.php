<?php

declare(strict_types=1);

/**
 * Aplica schema e migrações. Garante usuário admin/admin (só cria se não existir).
 * Uso: php api/scripts/migrate.php
 */

$root = dirname(__DIR__);

spl_autoload_register(function (string $class) use ($root): void {
    $prefix = 'Gastos\\Api\\';
    if (!str_starts_with($class, $prefix)) {
        return;
    }
    $relative = str_replace('\\', '/', substr($class, strlen($prefix)));
    $file = $root . '/src/' . $relative . '.php';
    if (is_file($file)) {
        require $file;
    }
});

use Gastos\Api\Config;
use Gastos\Api\Database;

Config::load($root);
$pdo = Database::connection();

echo "→ Aplicando schema base...\n";
$schema = file_get_contents($root . '/database/schema.sql');
foreach (array_filter(array_map('trim', explode(';', $schema))) as $stmt) {
    if ($stmt === '' || str_starts_with($stmt, '--')) {
        continue;
    }
    try {
        $pdo->exec($stmt);
    } catch (PDOException $e) {
        if (!str_contains($e->getMessage(), 'already exists')) {
            throw $e;
        }
    }
}

echo "→ Aplicando migrações incrementais...\n";
applyMigrationFile($pdo, $root . '/database/migrations/002_users_and_registered_by.sql');
applyMonthPlanMigration($pdo);
if (!columnExists($pdo, 'recurring_items', 'default_amount_brl')) {
    try {
        $pdo->exec(
            'ALTER TABLE recurring_items ADD COLUMN default_amount_brl DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER investment_type_id'
        );
        echo "→ Coluna default_amount_brl OK\n";
    } catch (PDOException $e) {
        if (!isIgnorableMigrationError($e)) {
            throw $e;
        }
    }
}

applyMigration005($pdo);

ensureAdminUser($pdo);

$householdId = 1;
$stmt = $pdo->prepare('SELECT user_id FROM user_settings WHERE user_id = ?');
$stmt->execute([$householdId]);
if (!$stmt->fetch()) {
    $pdo->prepare('INSERT INTO user_settings (user_id) VALUES (?)')->execute([$householdId]);
    echo "→ Configurações do casal (user_id=$householdId)\n";
}

$types = [
    ['Reserva', 'reserva', '#3fb950', 0, 1],
    ['Apartamento', 'apartamento', '#58a6ff', 0, 2],
    ['Capitalização', 'capitalizacao', '#a371f7', 0, 3],
];
foreach ($types as [$name, $slug, $color, $target, $order]) {
    $stmt = $pdo->prepare('SELECT id FROM investment_types WHERE user_id = ? AND slug = ?');
    $stmt->execute([$householdId, $slug]);
    if ($stmt->fetch()) {
        continue;
    }
    $pdo->prepare(
        'INSERT INTO investment_types (user_id, name, slug, color, target_monthly_brl, sort_order)
         VALUES (?, ?, ?, ?, ?, ?)'
    )->execute([$householdId, $name, $slug, $color, $target, $order]);
}
echo "→ Tipos de investimento OK (sem seed de valores , use reset-data ou inserts manuais)\n";

applyMigration006($pdo);
applyMigration007($pdo);
applyMigration008($pdo);
applyMigration009($pdo);
applyMigration010($pdo);
applyMigration011($pdo);
applyMigration012($pdo);
applyMigration013($pdo);
applyMigration014($pdo);
applyMigration015($pdo);
applyMigration016($pdo);
applyMigration017($pdo);
applyMigration018($pdo);
applyMigration019($pdo);
applyMigration020($pdo);
applyMigration021($pdo);
applyMigration022($pdo);
applyMigration023($pdo);
applyMigration024($pdo);
applyMigration025($pdo);

$pdo->exec(
    'UPDATE transactions SET registered_by_user_id = user_id
     WHERE registered_by_user_id IS NULL AND user_id IN (1, 2)'
);
$pdo->exec(
    'UPDATE transactions SET user_id = 1
     WHERE user_id IN (1, 2)'
);

echo "✓ Migração concluída.\n";

function applyMonthPlanMigration(PDO $pdo): void
{
    $statements = [
        'CREATE TABLE IF NOT EXISTS recurring_items (
          id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          user_id INT UNSIGNED NOT NULL,
          kind ENUM(\'income\',\'expense\',\'investment\',\'leisure\') NOT NULL,
          name VARCHAR(160) NOT NULL,
          category VARCHAR(80) NOT NULL DEFAULT \'Geral\',
          region ENUM(\'BR\',\'PT\',\'geral\') NOT NULL DEFAULT \'geral\',
          responsible VARCHAR(80) NULL,
          due_day TINYINT UNSIGNED NULL,
          investment_type_id INT UNSIGNED NULL,
          default_amount_brl DECIMAL(14,2) NOT NULL DEFAULT 0,
          currency ENUM(\'BRL\',\'EUR\',\'USD\') NOT NULL DEFAULT \'BRL\',
          amount_original DECIMAL(14,2) NULL,
          monthly_adjustment_brl DECIMAL(14,2) NOT NULL DEFAULT 0,
          is_fixed TINYINT(1) NOT NULL DEFAULT 1,
          sort_order INT NOT NULL DEFAULT 0,
          active TINYINT(1) NOT NULL DEFAULT 1,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (investment_type_id) REFERENCES investment_types(id) ON DELETE SET NULL,
          INDEX idx_recurring_name (user_id, kind, name(100))
        ) ENGINE=InnoDB',
        'CREATE TABLE IF NOT EXISTS recurring_item_amounts (
          recurring_item_id INT UNSIGNED NOT NULL,
          month TINYINT UNSIGNED NOT NULL,
          amount_brl DECIMAL(14,2) NOT NULL DEFAULT 0,
          PRIMARY KEY (recurring_item_id, month),
          FOREIGN KEY (recurring_item_id) REFERENCES recurring_items(id) ON DELETE CASCADE
        ) ENGINE=InnoDB',
        'CREATE TABLE IF NOT EXISTS month_plan_entries (
          id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          user_id INT UNSIGNED NOT NULL,
          year SMALLINT UNSIGNED NOT NULL,
          month TINYINT UNSIGNED NOT NULL,
          recurring_item_id INT UNSIGNED NULL,
          kind ENUM(\'income\',\'expense\',\'investment\',\'leisure\') NOT NULL,
          name VARCHAR(160) NOT NULL,
          category VARCHAR(80) NOT NULL DEFAULT \'Geral\',
          region ENUM(\'BR\',\'PT\',\'geral\') NOT NULL DEFAULT \'geral\',
          responsible VARCHAR(80) NULL,
          due_day TINYINT UNSIGNED NULL,
          investment_type_id INT UNSIGNED NULL,
          suggested_amount_brl DECIMAL(14,2) NOT NULL,
          confirmed_amount_brl DECIMAL(14,2) NULL,
          status ENUM(\'pending\',\'confirmed\',\'skipped\') NOT NULL DEFAULT \'pending\',
          transaction_id INT UNSIGNED NULL,
          notes VARCHAR(255) NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (recurring_item_id) REFERENCES recurring_items(id) ON DELETE SET NULL,
          FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL,
          FOREIGN KEY (investment_type_id) REFERENCES investment_types(id) ON DELETE SET NULL,
          INDEX idx_plan_ym (user_id, year, month, status)
        ) ENGINE=InnoDB',
    ];

    foreach ($statements as $stmt) {
        try {
            $pdo->exec($stmt);
        } catch (PDOException $e) {
            if (!isIgnorableMigrationError($e)) {
                throw $e;
            }
        }
    }
}

function applyMigrationFile(PDO $pdo, string $path): void
{
    if (!is_file($path)) {
        return;
    }
    $sql = file_get_contents($path);
    foreach (array_filter(array_map('trim', explode(';', $sql))) as $stmt) {
        if ($stmt === '' || str_starts_with($stmt, '--')) {
            continue;
        }
        if (str_contains($stmt, 'ADD COLUMN IF NOT EXISTS')) {
            applyAddColumnIfNotExists($pdo, $stmt);
            continue;
        }
        try {
            $pdo->exec($stmt);
        } catch (PDOException $e) {
            if (!isIgnorableMigrationError($e)) {
                throw $e;
            }
        }
    }
}

function applyAddColumnIfNotExists(PDO $pdo, string $stmt): void
{
    if (preg_match(
        '/ALTER TABLE\s+(\w+)\s+ADD COLUMN IF NOT EXISTS\s+(\w+)\s+(.+?)(?:,\s*ADD CONSTRAINT|$)/is',
        $stmt,
        $m
    )) {
        $table = $m[1];
        $column = $m[2];
        $def = trim($m[3]);
        if (columnExists($pdo, $table, $column)) {
            return;
        }
        $pdo->exec("ALTER TABLE $table ADD COLUMN $column $def");
        return;
    }
    if (preg_match(
        '/ADD CONSTRAINT\s+(\w+)\s+FOREIGN KEY\s+\((\w+)\)\s+REFERENCES\s+(\w+)\((\w+)\)/i',
        $stmt,
        $m
    )) {
        $constraint = $m[1];
        if (constraintExists($pdo, 'transactions', $constraint)) {
            return;
        }
        $fkPart = strstr($stmt, 'ADD CONSTRAINT');
        if ($fkPart) {
            try {
                $pdo->exec('ALTER TABLE transactions ' . trim($fkPart));
            } catch (PDOException $e) {
                if (!isIgnorableMigrationError($e)) {
                    throw $e;
                }
            }
        }
    }
}

function columnExists(PDO $pdo, string $table, string $column): bool
{
    $stmt = $pdo->prepare(
        'SELECT 1 FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?'
    );
    $stmt->execute([$table, $column]);
    return (bool) $stmt->fetch();
}

function constraintExists(PDO $pdo, string $table, string $name): bool
{
    $stmt = $pdo->prepare(
        'SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?'
    );
    $stmt->execute([$table, $name]);
    return (bool) $stmt->fetch();
}

function applyMigration007(PDO $pdo): void
{
    if (!columnExists($pdo, 'month_plan_entries', 'currency')) {
        $pdo->exec(
            "ALTER TABLE month_plan_entries
             ADD COLUMN currency ENUM('BRL','EUR') NOT NULL DEFAULT 'BRL' AFTER suggested_amount_brl"
        );
        echo "→ Coluna currency em month_plan_entries\n";
    }
    if (!columnExists($pdo, 'month_plan_entries', 'suggested_amount')) {
        $pdo->exec(
            'ALTER TABLE month_plan_entries
             ADD COLUMN suggested_amount DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER currency'
        );
        echo "→ Coluna suggested_amount em month_plan_entries\n";
    }
    if (!columnExists($pdo, 'month_plan_entries', 'confirmed_amount')) {
        $pdo->exec(
            'ALTER TABLE month_plan_entries
             ADD COLUMN confirmed_amount DECIMAL(14,2) NULL AFTER confirmed_amount_brl'
        );
    }

    $pdo->exec(
        'UPDATE month_plan_entries
         SET suggested_amount = suggested_amount_brl, currency = "BRL"
         WHERE suggested_amount = 0 AND suggested_amount_brl > 0'
    );

    $pdo->exec(
        'UPDATE month_plan_entries e
         INNER JOIN recurring_items r ON r.id = e.recurring_item_id
         SET e.currency = r.currency,
             e.suggested_amount = COALESCE(r.amount_original, e.suggested_amount_brl)
         WHERE r.currency = "EUR" AND r.amount_original IS NOT NULL'
    );
}

function applyMigration006(PDO $pdo): void
{
    $tables = ['recurring_items', 'month_plan_entries', 'transactions', 'monthly_projections'];
    foreach ($tables as $table) {
        if (!columnExists($pdo, $table, 'responsible_user_id')) {
            try {
                $pdo->exec(
                    "ALTER TABLE {$table}
                     ADD COLUMN responsible_user_id INT UNSIGNED NULL AFTER responsible"
                );
                echo "→ Coluna responsible_user_id em {$table}\n";
            } catch (PDOException $e) {
                if (!isIgnorableMigrationError($e)) {
                    throw $e;
                }
            }
        }
        $fk = "fk_{$table}_responsible_user";
        if (!constraintExists($pdo, $table, $fk)) {
            try {
                $pdo->exec(
                    "ALTER TABLE {$table}
                     ADD CONSTRAINT {$fk}
                     FOREIGN KEY (responsible_user_id) REFERENCES users(id) ON DELETE SET NULL"
                );
            } catch (PDOException $e) {
                if (!isIgnorableMigrationError($e)) {
                    throw $e;
                }
            }
        }
    }

    if (class_exists(\Gastos\Api\ResponsibleUser::class)) {
        \Gastos\Api\ResponsibleUser::migrateTextToUserIds($pdo);
        echo "→ Responsáveis migrados para user_id\n";
    }
}

function applyMigration005(PDO $pdo): void
{
    if (!columnExists($pdo, 'recurring_items', 'currency')) {
        $pdo->exec(
            "ALTER TABLE recurring_items ADD COLUMN currency ENUM('BRL','EUR') NOT NULL DEFAULT 'BRL' AFTER default_amount_brl"
        );
    }
    if (!columnExists($pdo, 'recurring_items', 'amount_original')) {
        $pdo->exec('ALTER TABLE recurring_items ADD COLUMN amount_original DECIMAL(14,2) NULL AFTER currency');
    }
    if (!columnExists($pdo, 'recurring_items', 'monthly_adjustment_brl')) {
        $pdo->exec(
            'ALTER TABLE recurring_items ADD COLUMN monthly_adjustment_brl DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER amount_original'
        );
    }
    if (!columnExists($pdo, 'investment_types', 'current_balance_brl')) {
        $pdo->exec(
            'ALTER TABLE investment_types ADD COLUMN current_balance_brl DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER target_monthly_brl'
        );
    }
}

function applyMigration008(PDO $pdo): void
{
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS plannings (
          id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(120) NOT NULL,
          created_by_user_id INT UNSIGNED NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB'
    );
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS planning_members (
          planning_id INT UNSIGNED NOT NULL,
          user_id INT UNSIGNED NOT NULL,
          role ENUM("owner","member") NOT NULL DEFAULT "member",
          joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (planning_id, user_id),
          FOREIGN KEY (planning_id) REFERENCES plannings(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB'
    );
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS planning_settings (
          planning_id INT UNSIGNED PRIMARY KEY,
          eur_to_brl DECIMAL(10,4) NOT NULL DEFAULT 6.0000,
          leisure_monthly_brl DECIMAL(14,2) NOT NULL DEFAULT 0,
          montante_inicial_brl DECIMAL(14,2) NOT NULL DEFAULT 0,
          cdi_monthly_rate DECIMAL(8,6) NOT NULL DEFAULT 0.009500,
          FOREIGN KEY (planning_id) REFERENCES plannings(id) ON DELETE CASCADE
        ) ENGINE=InnoDB'
    );

    $tables = [
        'investment_types',
        'transactions',
        'monthly_projections',
        'recurring_items',
        'month_plan_entries',
    ];
    foreach ($tables as $table) {
        if (!columnExists($pdo, $table, 'planning_id')) {
            $pdo->exec(
                "ALTER TABLE {$table} ADD COLUMN planning_id INT UNSIGNED NULL AFTER user_id"
            );
            echo "→ Coluna planning_id em {$table}\n";
        }
    }

    $stmt = $pdo->query('SELECT id FROM plannings WHERE id = 1');
    if (!$stmt->fetch()) {
        $ownerId = (int) ($pdo->query('SELECT id FROM users ORDER BY id ASC LIMIT 1')->fetchColumn() ?: 0);
        if ($ownerId > 0) {
            $pdo->prepare(
                'INSERT INTO plannings (id, name, created_by_user_id) VALUES (1, ?, ?)'
            )->execute(['Planejamento principal', $ownerId]);
            echo "→ Planejamento padrão (id=1)\n";
        }
    }

    $ownerId = (int) ($pdo->query('SELECT id FROM users ORDER BY id ASC LIMIT 1')->fetchColumn() ?: 0);
    if ($ownerId > 0) {
        $check = $pdo->prepare(
            'SELECT 1 FROM planning_members WHERE planning_id = 1 AND user_id = ?'
        );
        $check->execute([$ownerId]);
        if (!$check->fetch()) {
            $pdo->prepare(
                'INSERT INTO planning_members (planning_id, user_id, role) VALUES (1, ?, ?)'
            )->execute([$ownerId, 'owner']);
        }
    }

    if (!$pdo->query('SELECT 1 FROM planning_settings WHERE planning_id = 1')->fetch()) {
        $pdo->exec(
            'INSERT INTO planning_settings (planning_id, eur_to_brl, leisure_monthly_brl, montante_inicial_brl, cdi_monthly_rate)
             SELECT 1, eur_to_brl, leisure_monthly_brl, montante_inicial_brl, cdi_monthly_rate
             FROM user_settings WHERE user_id = 1
             ON DUPLICATE KEY UPDATE planning_id = planning_id'
        );
        if ($pdo->query('SELECT 1 FROM planning_settings WHERE planning_id = 1')->fetchColumn() === false) {
            $pdo->exec('INSERT INTO planning_settings (planning_id) VALUES (1)');
        }
    }

    foreach ($tables as $table) {
        $pdo->exec("UPDATE {$table} SET planning_id = 1 WHERE planning_id IS NULL AND user_id = 1");
    }

    echo "→ Dados financeiros vinculados ao planejamento 1\n";
}

function applyMigration010(PDO $pdo): void
{
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS planning_custom_tabs (
          id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          planning_id INT UNSIGNED NOT NULL,
          name VARCHAR(80) NOT NULL,
          sort_order INT NOT NULL DEFAULT 0,
          active TINYINT(1) NOT NULL DEFAULT 1,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (planning_id) REFERENCES plannings(id) ON DELETE CASCADE,
          UNIQUE KEY uq_planning_tab_name (planning_id, name)
        ) ENGINE=InnoDB'
    );
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS planning_item_categories (
          id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          planning_id INT UNSIGNED NOT NULL,
          name VARCHAR(80) NOT NULL,
          sort_order INT NOT NULL DEFAULT 0,
          active TINYINT(1) NOT NULL DEFAULT 1,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (planning_id) REFERENCES plannings(id) ON DELETE CASCADE,
          UNIQUE KEY uq_planning_category_name (planning_id, name)
        ) ENGINE=InnoDB'
    );
    applyMigrationFile($pdo, dirname(__DIR__) . '/database/migrations/010_custom_tabs_categories.sql');

    $tables = ['recurring_items', 'month_plan_entries'];
    foreach ($tables as $table) {
        if (!columnExists($pdo, $table, 'custom_tab_id')) {
            $pdo->exec(
                "ALTER TABLE {$table} ADD COLUMN custom_tab_id INT UNSIGNED NULL AFTER region"
            );
            echo "→ Coluna custom_tab_id em {$table}\n";
        }
        if (!columnExists($pdo, $table, 'item_category_id')) {
            $after = columnExists($pdo, $table, 'custom_tab_id') ? 'custom_tab_id' : 'region';
            $pdo->exec(
                "ALTER TABLE {$table} ADD COLUMN item_category_id INT UNSIGNED NULL AFTER {$after}"
            );
            echo "→ Coluna item_category_id em {$table}\n";
        }
    }

    $fkChecks = [
        'recurring_items' => 'fk_recurring_custom_tab',
        'month_plan_entries' => 'fk_mpe_custom_tab',
    ];
    foreach ($fkChecks as $table => $fkName) {
        if (columnExists($pdo, $table, 'custom_tab_id') && !constraintExists($pdo, $table, $fkName)) {
            try {
                $pdo->exec(
                    "ALTER TABLE {$table}
                     ADD CONSTRAINT {$fkName} FOREIGN KEY (custom_tab_id)
                     REFERENCES planning_custom_tabs(id) ON DELETE SET NULL"
                );
            } catch (PDOException $e) {
                if (!isIgnorableMigrationError($e)) {
                    throw $e;
                }
            }
        }
    }

    $catFk = [
        'recurring_items' => 'fk_recurring_item_category',
        'month_plan_entries' => 'fk_mpe_item_category',
    ];
    foreach ($catFk as $table => $fkName) {
        if (columnExists($pdo, $table, 'item_category_id') && !constraintExists($pdo, $table, $fkName)) {
            try {
                $pdo->exec(
                    "ALTER TABLE {$table}
                     ADD CONSTRAINT {$fkName} FOREIGN KEY (item_category_id)
                     REFERENCES planning_item_categories(id) ON DELETE SET NULL"
                );
            } catch (PDOException $e) {
                if (!isIgnorableMigrationError($e)) {
                    throw $e;
                }
            }
        }
    }

    $planningIds = $pdo->query('SELECT id FROM plannings')->fetchAll(PDO::FETCH_COLUMN);
    foreach ($planningIds as $planningId) {
        $planningId = (int) $planningId;
        seedPlanningTaxonomy($pdo, $planningId);
    }

    echo "→ Abas personalizadas e categorias de item OK\n";
}

function seedPlanningTaxonomy(PDO $pdo, int $planningId): void
{
    $tabBr = ensureCustomTab($pdo, $planningId, 'Brasil', 1);
    $tabPt = ensureCustomTab($pdo, $planningId, 'Portugal', 2);

    $stmt = $pdo->prepare(
        'SELECT DISTINCT TRIM(category) AS cat FROM recurring_items
         WHERE planning_id = ? AND category IS NOT NULL AND TRIM(category) <> ""'
    );
    $stmt->execute([$planningId]);
    $categories = $stmt->fetchAll(PDO::FETCH_COLUMN);
    if ($categories === []) {
        $stmt = $pdo->prepare(
            'SELECT DISTINCT TRIM(category) AS cat FROM recurring_items
             WHERE user_id = 1 AND category IS NOT NULL AND TRIM(category) <> ""
             AND (planning_id IS NULL OR planning_id = ?)'
        );
        $stmt->execute([$planningId]);
        $categories = $stmt->fetchAll(PDO::FETCH_COLUMN);
    }

    $sort = 0;
    $catMap = [];
    foreach ($categories as $cat) {
        $catMap[$cat] = ensureItemCategory($pdo, $planningId, (string) $cat, $sort++);
    }

    $defaultCat = ensureItemCategory($pdo, $planningId, 'Geral', 99);

    $items = $pdo->prepare(
        'SELECT id, category, region FROM recurring_items WHERE planning_id = ? AND active = 1'
    );
    $items->execute([$planningId]);
    $rows = $items->fetchAll(PDO::FETCH_ASSOC);
    if ($rows === []) {
        $items = $pdo->prepare(
            'SELECT id, category, region FROM recurring_items
             WHERE user_id = 1 AND active = 1 AND (planning_id IS NULL OR planning_id = ?)'
        );
        $items->execute([$planningId]);
        $rows = $items->fetchAll(PDO::FETCH_ASSOC);
    }

    $upd = $pdo->prepare(
        'UPDATE recurring_items SET custom_tab_id = ?, item_category_id = ?, category = ?
         WHERE id = ?'
    );
    foreach ($rows as $row) {
        $catName = trim((string) ($row['category'] ?? 'Geral')) ?: 'Geral';
        $catId = $catMap[$catName] ?? $defaultCat;
        $region = $row['region'] ?? 'geral';
        $tabId = match ($region) {
            'BR' => $tabBr,
            'PT' => $tabPt,
            default => null,
        };
        $upd->execute([$tabId, $catId, $catName, (int) $row['id']]);
    }

    if ($planningId === 1) {
        echo "  → Planejamento {$planningId}: abas Brasil/Portugal e categorias vinculadas\n";
    }
}

function ensureCustomTab(PDO $pdo, int $planningId, string $name, int $sort): int
{
    $stmt = $pdo->prepare(
        'SELECT id FROM planning_custom_tabs WHERE planning_id = ? AND name = ? LIMIT 1'
    );
    $stmt->execute([$planningId, $name]);
    $id = $stmt->fetchColumn();
    if ($id) {
        return (int) $id;
    }
    $pdo->prepare(
        'INSERT INTO planning_custom_tabs (planning_id, name, sort_order) VALUES (?, ?, ?)'
    )->execute([$planningId, $name, $sort]);

    return (int) $pdo->lastInsertId();
}

function ensureItemCategory(PDO $pdo, int $planningId, string $name, int $sort): int
{
    $stmt = $pdo->prepare(
        'SELECT id FROM planning_item_categories WHERE planning_id = ? AND name = ? LIMIT 1'
    );
    $stmt->execute([$planningId, $name]);
    $id = $stmt->fetchColumn();
    if ($id) {
        return (int) $id;
    }
    $icon = \Gastos\Api\CategoryIcon::suggestForName($name);
    if (columnExists($pdo, 'planning_item_categories', 'icon')) {
        $pdo->prepare(
            'INSERT INTO planning_item_categories (planning_id, name, icon, sort_order) VALUES (?, ?, ?, ?)'
        )->execute([$planningId, $name, $icon, $sort]);
    } else {
        $pdo->prepare(
            'INSERT INTO planning_item_categories (planning_id, name, sort_order) VALUES (?, ?, ?)'
        )->execute([$planningId, $name, $sort]);
    }

    return (int) $pdo->lastInsertId();
}

function applyMigration015(PDO $pdo): void
{
    foreach (['recurring_items', 'month_plan_entries'] as $table) {
        if (!columnExists($pdo, $table, 'financial_account_id')) {
            $pdo->exec(
                "ALTER TABLE {$table} ADD COLUMN financial_account_id INT UNSIGNED NULL AFTER investment_type_id"
            );
            echo "→ Coluna financial_account_id em {$table}\n";
        }
    }

    if (
        columnExists($pdo, 'recurring_items', 'financial_account_id')
        && tableExists($pdo, 'financial_accounts')
        && !constraintExists($pdo, 'recurring_items', 'fk_recurring_financial_account')
    ) {
        try {
            $pdo->exec(
                'ALTER TABLE recurring_items
                 ADD CONSTRAINT fk_recurring_financial_account
                 FOREIGN KEY (financial_account_id) REFERENCES financial_accounts(id) ON DELETE SET NULL'
            );
        } catch (PDOException $e) {
            if (!isIgnorableMigrationError($e)) {
                throw $e;
            }
        }
    }

    if (
        columnExists($pdo, 'month_plan_entries', 'financial_account_id')
        && tableExists($pdo, 'financial_accounts')
        && !constraintExists($pdo, 'month_plan_entries', 'fk_mpe_financial_account')
    ) {
        try {
            $pdo->exec(
                'ALTER TABLE month_plan_entries
                 ADD CONSTRAINT fk_mpe_financial_account
                 FOREIGN KEY (financial_account_id) REFERENCES financial_accounts(id) ON DELETE SET NULL'
            );
        } catch (PDOException $e) {
            if (!isIgnorableMigrationError($e)) {
                throw $e;
            }
        }
    }

    echo "→ Conta de investimento vinculada a fixos OK\n";
}

function applyMigration016(PDO $pdo): void
{
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS fx_daily_rates (
          rate_date DATE NOT NULL PRIMARY KEY,
          eur_to_brl DECIMAL(10,6) NOT NULL,
          source VARCHAR(20) NOT NULL DEFAULT "api",
          fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
    );
    echo "→ Tabela fx_daily_rates OK\n";

    if (!columnExists($pdo, 'transactions', 'eur_to_brl')) {
        $pdo->exec(
            'ALTER TABLE transactions ADD COLUMN eur_to_brl DECIMAL(10,6) NULL AFTER amount_brl'
        );
        echo "→ Coluna transactions.eur_to_brl OK\n";
    }

    if (columnExists($pdo, 'transactions', 'eur_to_brl')) {
        $stmt = $pdo->query(
            "SELECT t.id, t.planning_id FROM transactions t
             WHERE t.currency = 'EUR' AND (t.eur_to_brl IS NULL OR t.eur_to_brl = 0)"
        );
        $update = $pdo->prepare('UPDATE transactions SET eur_to_brl = ? WHERE id = ?');
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $fallback = \Gastos\Api\MoneyHelper::getEurToBrlFallback(
                $pdo,
                (int) $row['planning_id']
            );
            $update->execute([$fallback, $row['id']]);
        }
        echo "→ Cotação EUR preenchida em lançamentos antigos (fallback)\n";
    }
}

function applyMigration014(PDO $pdo): void
{
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS financial_accounts (
          id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          planning_id INT UNSIGNED NOT NULL,
          name VARCHAR(120) NOT NULL,
          type ENUM(\'bank\', \'investment\') NOT NULL DEFAULT \'bank\',
          currency ENUM(\'BRL\', \'EUR\') NOT NULL DEFAULT \'BRL\',
          initial_balance DECIMAL(14,2) NOT NULL DEFAULT 0,
          initial_balance_date DATE NOT NULL,
          color VARCHAR(16) NULL,
          sort_order INT NOT NULL DEFAULT 0,
          active TINYINT(1) NOT NULL DEFAULT 1,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (planning_id) REFERENCES plannings(id) ON DELETE CASCADE,
          UNIQUE KEY uq_planning_account_name (planning_id, name)
        ) ENGINE=InnoDB'
    );

    if (!columnExists($pdo, 'transactions', 'account_id')) {
        $pdo->exec(
            'ALTER TABLE transactions ADD COLUMN account_id INT UNSIGNED NULL AFTER planning_id'
        );
        echo "→ Coluna account_id em transactions\n";
    }

    if (columnExists($pdo, 'transactions', 'account_id')
        && tableExists($pdo, 'financial_accounts')
        && !constraintExists($pdo, 'transactions', 'fk_transactions_account')
    ) {
        try {
            $pdo->exec(
                'ALTER TABLE transactions
                 ADD CONSTRAINT fk_transactions_account
                 FOREIGN KEY (account_id) REFERENCES financial_accounts(id) ON DELETE SET NULL'
            );
            echo "→ FK transactions.account_id\n";
        } catch (PDOException $e) {
            if (!isIgnorableMigrationError($e)) {
                throw $e;
            }
        }
    }

    echo "→ Contas financeiras OK\n";
}

function applyMigration017(PDO $pdo): void
{
    $file = dirname(__DIR__) . '/database/migrations/017_financial_goals.sql';
    if (is_file($file)) {
        $pdo->exec(file_get_contents($file));
    }
    echo "→ Metas financeiras (financial_goals) OK\n";
}

function applyMigration018(PDO $pdo): void
{
    if (!columnExists($pdo, 'users', 'avatar_path')) {
        $pdo->exec('ALTER TABLE users ADD COLUMN avatar_path VARCHAR(255) NULL AFTER gender');
        echo "→ Coluna avatar_path em users\n";
    }

    if (!tableExists($pdo, 'password_reset_tokens')) {
        applyMigrationFile($pdo, dirname(__DIR__) . '/database/migrations/018_user_profile_password_reset.sql');
        echo "→ Tabela password_reset_tokens OK\n";
    }

    $avatarDir = dirname(__DIR__) . '/storage/avatars';
    if (!is_dir($avatarDir)) {
        @mkdir($avatarDir, 0775, true);
    }
}

function applyMigration019(PDO $pdo): void
{
    foreach (['recurring_items', 'month_plan_entries'] as $table) {
        if (!columnExists($pdo, $table, 'source_financial_account_id')) {
            $pdo->exec(
                "ALTER TABLE {$table} ADD COLUMN source_financial_account_id INT UNSIGNED NULL
                 AFTER financial_account_id"
            );
            echo "→ Coluna source_financial_account_id em {$table}\n";
        }
    }

    if (!columnExists($pdo, 'financial_goals', 'source_financial_account_id')) {
        $pdo->exec(
            'ALTER TABLE financial_goals
             ADD COLUMN source_financial_account_id INT UNSIGNED NULL AFTER investment_type_id'
        );
        echo "→ Coluna source_financial_account_id em financial_goals\n";
    }

    if (!columnExists($pdo, 'financial_goals', 'target_financial_account_id')) {
        $pdo->exec(
            'ALTER TABLE financial_goals
             ADD COLUMN target_financial_account_id INT UNSIGNED NULL AFTER source_financial_account_id'
        );
        echo "→ Coluna target_financial_account_id em financial_goals\n";
    }

    echo "→ Contas origem/destino (019) OK\n";
}

function applyMigration020(PDO $pdo): void
{
    if (!columnExists($pdo, 'financial_goals', 'start_date')) {
        $pdo->exec(
            'ALTER TABLE financial_goals
             ADD COLUMN start_date DATE NULL AFTER description,
             ADD COLUMN end_date DATE NULL AFTER start_date'
        );
        echo "→ Colunas start_date/end_date em financial_goals\n";
    }

    if (!columnExists($pdo, 'financial_goals', 'start_amount_brl')) {
        $pdo->exec(
            'ALTER TABLE financial_goals
             ADD COLUMN start_amount_brl DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER target_amount_brl'
        );
        $pdo->exec(
            'UPDATE financial_goals SET start_amount_brl = current_amount_brl
             WHERE start_amount_brl = 0 AND current_amount_brl > 0'
        );
        echo "→ Coluna start_amount_brl em financial_goals\n";
    }

    if (!columnExists($pdo, 'financial_goals', 'due_day')) {
        $pdo->exec(
            'ALTER TABLE financial_goals ADD COLUMN due_day TINYINT UNSIGNED NULL DEFAULT 1 AFTER end_date'
        );
        echo "→ Coluna due_day em financial_goals\n";
    }

    $pdo->exec(
        'UPDATE financial_goals SET start_date = COALESCE(start_date, CURDATE()),
         end_date = COALESCE(end_date, deadline_date, DATE_ADD(CURDATE(), INTERVAL 12 MONTH))
         WHERE is_active = 1 AND (start_date IS NULL OR end_date IS NULL)'
    );

    if (!columnExists($pdo, 'month_plan_entries', 'financial_goal_id')) {
        $pdo->exec(
            'ALTER TABLE month_plan_entries
             ADD COLUMN financial_goal_id INT UNSIGNED NULL AFTER recurring_item_id'
        );
        echo "→ Coluna financial_goal_id em month_plan_entries\n";
    }

    if (tableExists($pdo, 'financial_goals') && columnExists($pdo, 'month_plan_entries', 'financial_goal_id')) {
        $ids = $pdo->query(
            'SELECT id, planning_id FROM financial_goals WHERE is_active = 1'
        )->fetchAll(PDO::FETCH_ASSOC);
        foreach ($ids as $g) {
            \Gastos\Api\Services\GoalPlanService::syncPlanEntries(
                $pdo,
                (int) $g['planning_id'],
                (int) $g['id']
            );
        }
        if ($ids !== []) {
            echo '→ Sugestões mensais geradas para ' . count($ids) . " meta(s)\n";
        }
    }

    echo "→ Metas com período e plano mensal (020) OK\n";
}

function tableExists(PDO $pdo, string $table): bool
{
    $stmt = $pdo->prepare(
        'SELECT 1 FROM information_schema.tables
         WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1'
    );
    $stmt->execute([$table]);

    return (bool) $stmt->fetch();
}

function applyMigration013(PDO $pdo): void
{
    $planningIds = $pdo->query('SELECT id FROM plannings')->fetchAll(PDO::FETCH_COLUMN);
    foreach ($planningIds as $planningId) {
        ensureItemCategory($pdo, (int) $planningId, 'Exercícios', 50);
    }
    echo "→ Categoria Exercícios garantida em todos os planejamentos\n";
}

function applyMigration012(PDO $pdo): void
{
    if (columnExists($pdo, 'planning_item_categories', 'icon')) {
        $rows = $pdo->query('SELECT id, name, icon FROM planning_item_categories')->fetchAll(PDO::FETCH_ASSOC);
        $upd = $pdo->prepare('UPDATE planning_item_categories SET icon = ? WHERE id = ?');
        foreach ($rows as $row) {
            $icon = \Gastos\Api\CategoryIcon::suggestForName($row['name']);
            if ($icon !== ($row['icon'] ?? '')) {
                $upd->execute([$icon, (int) $row['id']]);
            }
        }
        echo "→ Ícones das categorias atualizados (gastos fixos)\n";
    }
}

function applyMigration011(PDO $pdo): void
{
    if (!columnExists($pdo, 'planning_item_categories', 'icon')) {
        $pdo->exec(
            "ALTER TABLE planning_item_categories ADD COLUMN icon VARCHAR(16) NOT NULL DEFAULT '📌' AFTER name"
        );
        echo "→ Coluna icon em planning_item_categories\n";
    }

    $stmt = $pdo->query('SELECT id, name, icon FROM planning_item_categories');
    $upd = $pdo->prepare('UPDATE planning_item_categories SET icon = ? WHERE id = ?');
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $icon = \Gastos\Api\CategoryIcon::normalize($row['icon'] ?? null, $row['name']);
        if ($icon !== ($row['icon'] ?? '')) {
            $upd->execute([$icon, (int) $row['id']]);
        }
    }

    echo "→ Ícones das categorias OK\n";
}

function applyMigration021(PDO $pdo): void
{
    if (!tableExists($pdo, 'plannings')) {
        return;
    }

    $pdo->exec("UPDATE plannings SET created_at = '2026-06-01 00:00:00'");
    if (tableExists($pdo, 'financial_accounts')) {
        $pdo->exec(
            "UPDATE financial_accounts SET created_at = '2026-06-01 00:00:00' WHERE type = 'investment'"
        );
    }

    echo "→ Início de uso (created_at jun/2026) em planejamentos e investimentos OK\n";
}

function applyMigration022(PDO $pdo): void
{
    $tables = ['transactions', 'month_plan_entries', 'recurring_items'];
    foreach ($tables as $table) {
        if (!tableExists($pdo, $table) || !columnExists($pdo, $table, 'kind')) {
            continue;
        }
        $stmt = $pdo->query("SHOW COLUMNS FROM `{$table}` LIKE 'kind'");
        $col = $stmt ? $stmt->fetch(PDO::FETCH_ASSOC) : false;
        $type = (string) (($col['Type'] ?? $col['type'] ?? ''));
        if (str_contains(strtolower($type), 'transfer')) {
            continue;
        }
        $pdo->exec(
            "ALTER TABLE `{$table}`
             MODIFY COLUMN `kind` ENUM('income','expense','investment','leisure','transfer') NOT NULL"
        );
    }
    echo "→ Kind transfer (transferência entre contas) OK\n";
}

function applyMigration023(PDO $pdo): void
{
    if (!tableExists($pdo, 'recurring_items')) {
        return;
    }
    if (!columnExists($pdo, 'recurring_items', 'is_installment')) {
        $pdo->exec(
            'ALTER TABLE recurring_items
             ADD COLUMN is_installment TINYINT(1) NOT NULL DEFAULT 0 AFTER is_fixed,
             ADD COLUMN start_date DATE NULL AFTER is_installment,
             ADD COLUMN end_date DATE NULL AFTER start_date'
        );
    } else {
        if (!columnExists($pdo, 'recurring_items', 'start_date')) {
            $pdo->exec('ALTER TABLE recurring_items ADD COLUMN start_date DATE NULL AFTER is_installment');
        }
        if (!columnExists($pdo, 'recurring_items', 'end_date')) {
            $pdo->exec('ALTER TABLE recurring_items ADD COLUMN end_date DATE NULL AFTER start_date');
        }
    }
    if (!indexExists($pdo, 'recurring_items', 'idx_recurring_installment')) {
        $pdo->exec(
            'CREATE INDEX idx_recurring_installment ON recurring_items (planning_id, is_installment, active)'
        );
    }
    echo "→ Compras parceladas (is_installment + start/end) OK\n";
}

function applyMigration024(PDO $pdo): void
{
    if (!tableExists($pdo, 'financial_accounts')) {
        return;
    }
    $stmt = $pdo->query("SHOW COLUMNS FROM financial_accounts LIKE 'type'");
    $col = $stmt ? $stmt->fetch(PDO::FETCH_ASSOC) : false;
    $type = (string) (($col['Type'] ?? $col['type'] ?? ''));
    if (!str_contains(strtolower($type), 'credit')) {
        $pdo->exec(
            "ALTER TABLE financial_accounts
             MODIFY COLUMN type ENUM('bank','investment','credit') NOT NULL DEFAULT 'bank'"
        );
    }
    if (!columnExists($pdo, 'financial_accounts', 'credit_limit')) {
        $pdo->exec(
            'ALTER TABLE financial_accounts
             ADD COLUMN credit_limit DECIMAL(14,2) NULL AFTER initial_balance'
        );
    }
    if (!columnExists($pdo, 'financial_accounts', 'closing_day')) {
        $pdo->exec(
            'ALTER TABLE financial_accounts
             ADD COLUMN closing_day TINYINT UNSIGNED NULL AFTER credit_limit'
        );
    }
    if (!columnExists($pdo, 'financial_accounts', 'due_day')) {
        $pdo->exec(
            'ALTER TABLE financial_accounts
             ADD COLUMN due_day TINYINT UNSIGNED NULL AFTER closing_day'
        );
    }
    echo "→ Cartões de crédito (type=credit + limite/fechamento/vencimento) OK\n";
}

function applyMigration025(PDO $pdo): void
{
    $tables = ['transactions', 'recurring_items', 'month_plan_entries', 'financial_accounts'];
    foreach ($tables as $table) {
        if (!tableExists($pdo, $table) || !columnExists($pdo, $table, 'currency')) {
            continue;
        }
        $stmt = $pdo->query("SHOW COLUMNS FROM `{$table}` LIKE 'currency'");
        $col = $stmt ? $stmt->fetch(PDO::FETCH_ASSOC) : false;
        $type = strtolower((string) (($col['Type'] ?? $col['type'] ?? '')));
        if (!str_contains($type, "'usd'") && !str_contains($type, 'usd')) {
            $pdo->exec(
                "ALTER TABLE `{$table}`
                 MODIFY COLUMN currency ENUM('BRL','EUR','USD') NOT NULL DEFAULT 'BRL'"
            );
            echo "→ {$table}.currency inclui USD\n";
        }
    }

    if (tableExists($pdo, 'planning_settings') && !columnExists($pdo, 'planning_settings', 'usd_to_brl')) {
        $pdo->exec(
            'ALTER TABLE planning_settings
             ADD COLUMN usd_to_brl DECIMAL(10,4) NOT NULL DEFAULT 5.0000 AFTER eur_to_brl'
        );
        echo "→ Coluna planning_settings.usd_to_brl\n";
    }

    if (tableExists($pdo, 'fx_daily_rates') && !columnExists($pdo, 'fx_daily_rates', 'usd_to_brl')) {
        $pdo->exec(
            'ALTER TABLE fx_daily_rates
             ADD COLUMN usd_to_brl DECIMAL(10,6) NULL AFTER eur_to_brl'
        );
        echo "→ Coluna fx_daily_rates.usd_to_brl\n";
    }

    if (tableExists($pdo, 'recurring_items') && indexExists($pdo, 'recurring_items', 'uq_recurring_name')) {
        // FK user_id pode estar usando o prefixo do UNIQUE; cria índice próprio antes de dropar.
        if (!indexExists($pdo, 'recurring_items', 'idx_recurring_user')) {
            $pdo->exec('ALTER TABLE recurring_items ADD INDEX idx_recurring_user (user_id)');
        }
        $pdo->exec('ALTER TABLE recurring_items DROP INDEX uq_recurring_name');
        echo "→ Removido UNIQUE uq_recurring_name (nomes repetidos ok)\n";
    }

    echo "→ Moeda USD + nomes duplicados em fixos OK\n";
}

function applyMigration009(PDO $pdo): void
{
    if (!columnExists($pdo, 'users', 'email')) {
        $pdo->exec('ALTER TABLE users ADD COLUMN email VARCHAR(255) NULL AFTER username');
        echo "→ Coluna email em users\n";
    }

    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS planning_invites (
          id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          planning_id INT UNSIGNED NOT NULL,
          email VARCHAR(255) NOT NULL,
          token VARCHAR(64) NOT NULL,
          invited_by_user_id INT UNSIGNED NOT NULL,
          status ENUM("pending","accepted","revoked","expired") NOT NULL DEFAULT "pending",
          expires_at DATETIME NOT NULL,
          accepted_at DATETIME NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uq_invite_token (token),
          FOREIGN KEY (planning_id) REFERENCES plannings(id) ON DELETE CASCADE,
          FOREIGN KEY (invited_by_user_id) REFERENCES users(id) ON DELETE CASCADE,
          INDEX idx_invite_email (email),
          INDEX idx_invite_planning_status (planning_id, status)
        ) ENGINE=InnoDB'
    );

    $pdo->exec(
        "UPDATE users SET email = CONCAT(username, '@tostoes.local')
         WHERE email IS NULL OR TRIM(email) = ''"
    );

    if (!indexExists($pdo, 'users', 'uq_users_email')) {
        try {
            $pdo->exec('ALTER TABLE users ADD UNIQUE KEY uq_users_email (email)');
        } catch (PDOException $e) {
            if (!isIgnorableMigrationError($e)) {
                throw $e;
            }
        }
    }

    echo "→ Convites por e-mail OK\n";
}

function indexExists(PDO $pdo, string $table, string $indexName): bool
{
    $stmt = $pdo->prepare(
        'SELECT 1 FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?
         LIMIT 1'
    );
    $stmt->execute([$table, $indexName]);

    return (bool) $stmt->fetch();
}

function isIgnorableMigrationError(PDOException $e): bool
{
    $msg = $e->getMessage();
    return str_contains($msg, 'Duplicate column')
        || str_contains($msg, 'Duplicate key name')
        || str_contains($msg, 'already exists');
}

/** Usuário padrão local (Docker): admin / admin , só insere se ainda não existir. */
function ensureAdminUser(PDO $pdo): void
{
    $username = 'admin';
    echo "→ Usuário admin...\n";

    $stmt = $pdo->prepare('SELECT id FROM users WHERE username = ? LIMIT 1');
    $stmt->execute([$username]);
    if ($stmt->fetch()) {
        echo "  já existe: $username\n";
        return;
    }

    $pdo->prepare(
        'INSERT INTO users (username, password_hash, name, gender) VALUES (?, ?, ?, ?)'
    )->execute([
        $username,
        password_hash('admin', PASSWORD_DEFAULT),
        'Administrador',
        'male',
    ]);

    echo "  criado: $username (senha: admin)\n";
}
