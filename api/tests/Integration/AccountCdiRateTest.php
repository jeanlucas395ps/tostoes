<?php

declare(strict_types=1);

namespace Gastos\Api\Tests\Integration;

use Gastos\Api\Config;
use Gastos\Api\Services\AccountService;
use Gastos\Api\Services\InvestmentPortfolioService;
use PDO;
use PDOException;
use PHPUnit\Framework\TestCase;

/**
 * CDI mensal por conta de investimento com fallback em planning_settings.
 */
final class AccountCdiRateTest extends TestCase
{
    private static ?PDO $pdo = null;
    private static int $planningId = 0;
    private static int $ownerId = 0;
    private static bool $ready = false;

    public static function setUpBeforeClass(): void
    {
        Config::load(dirname(__DIR__, 2));
        $host = Config::get('DB_HOST');
        if ($host === 'host.docker.internal') {
            $ref = new \ReflectionClass(Config::class);
            $prop = $ref->getProperty('env');
            $env = $prop->getValue();
            $env['DB_HOST'] = '127.0.0.1';
            $prop->setValue(null, $env);
        }

        try {
            $dsn = sprintf(
                'mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4',
                Config::get('DB_HOST'),
                Config::get('DB_PORT'),
                Config::get('DB_NAME')
            );
            self::$pdo = new PDO($dsn, Config::get('DB_USER'), Config::get('DB_PASS'), [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            ]);
            $stmt = self::$pdo->query(
                'SELECT id, created_by_user_id FROM plannings ORDER BY id LIMIT 1'
            );
            $row = $stmt ? $stmt->fetch(PDO::FETCH_ASSOC) : false;
            if (!$row) {
                self::markTestSkipped('Nenhum planejamento no banco.');
            }
            self::$planningId = (int) $row['id'];
            self::$ownerId = (int) $row['created_by_user_id'];
            $col = self::$pdo->query(
                "SHOW COLUMNS FROM financial_accounts LIKE 'cdi_monthly_rate'"
            )->fetch(PDO::FETCH_ASSOC);
            if (!$col) {
                self::markTestSkipped('Migration 029 (cdi_monthly_rate) não aplicada.');
            }
            self::$ready = true;
        } catch (PDOException $e) {
            self::markTestSkipped('MySQL indisponível: ' . $e->getMessage());
        }
    }

    protected function setUp(): void
    {
        if (!self::$ready || !self::$pdo) {
            $this->markTestSkipped('Ambiente de integração indisponível.');
        }
        self::$pdo->beginTransaction();
    }

    protected function tearDown(): void
    {
        if (self::$pdo?->inTransaction()) {
            self::$pdo->rollBack();
        }
    }

    public function testResolveFallsBackToPlanningSettings(): void
    {
        $pdo = self::$pdo;
        $planningId = self::$planningId;

        $pdo->prepare(
            'UPDATE planning_settings SET cdi_monthly_rate = 0.012345 WHERE planning_id = ?'
        )->execute([$planningId]);

        $pdo->prepare(
            "INSERT INTO financial_accounts
             (planning_id, name, type, currency, initial_balance, initial_balance_date, sort_order, active)
             VALUES (?, 'Invest CDI fallback PHPUnit', 'investment', 'BRL', 1000, '2026-01-01', 0, 1)"
        )->execute([$planningId]);
        $id = (int) $pdo->lastInsertId();
        $row = $pdo->query("SELECT * FROM financial_accounts WHERE id = {$id}")->fetch(PDO::FETCH_ASSOC);

        $this->assertNull($row['cdi_monthly_rate']);
        $this->assertSame(
            0.012345,
            AccountService::resolveAccountCdiMonthlyRate($pdo, $planningId, $row)
        );

        $mapped = AccountService::mapAccount($pdo, $row);
        $this->assertNull($mapped['cdiMonthlyRate']);
        $this->assertSame(0.012345, $mapped['effectiveCdiMonthlyRate']);
    }

    public function testResolveUsesAccountOverride(): void
    {
        $pdo = self::$pdo;
        $planningId = self::$planningId;

        $pdo->prepare(
            'UPDATE planning_settings SET cdi_monthly_rate = 0.0095 WHERE planning_id = ?'
        )->execute([$planningId]);

        $pdo->prepare(
            "INSERT INTO financial_accounts
             (planning_id, name, type, currency, initial_balance, cdi_monthly_rate,
              initial_balance_date, sort_order, active)
             VALUES (?, 'Invest CDI override PHPUnit', 'investment', 'BRL', 2000, 0.015,
                     '2026-01-01', 0, 1)"
        )->execute([$planningId]);
        $id = (int) $pdo->lastInsertId();
        $row = $pdo->query("SELECT * FROM financial_accounts WHERE id = {$id}")->fetch(PDO::FETCH_ASSOC);

        $this->assertSame(0.015, AccountService::resolveAccountCdiMonthlyRate($pdo, $planningId, $row));
        $mapped = AccountService::mapAccount($pdo, $row);
        $this->assertSame(0.015, $mapped['cdiMonthlyRate']);
        $this->assertSame(0.015, $mapped['effectiveCdiMonthlyRate']);
    }

    public function testPortfolioYieldUsesAccountCdiOverride(): void
    {
        $pdo = self::$pdo;
        $planningId = self::$planningId;

        $pdo->prepare(
            'UPDATE planning_settings SET cdi_monthly_rate = 0.01 WHERE planning_id = ?'
        )->execute([$planningId]);

        $pdo->prepare(
            "INSERT INTO investment_types
             (user_id, planning_id, name, slug, color, target_monthly_brl, current_balance_brl, sort_order, is_active)
             VALUES (?, ?, 'Reserva CDI PHPUnit', 'reserva-cdi-phpunit', '#3fb950', 0, 0, 99, 1)"
        )->execute([self::$ownerId, $planningId]);
        $typeId = (int) $pdo->lastInsertId();

        $pdo->prepare(
            "INSERT INTO financial_accounts
             (planning_id, name, type, currency, initial_balance, cdi_monthly_rate,
              initial_balance_date, sort_order, active)
             VALUES (?, 'Conta Reserva CDI PHPUnit', 'investment', 'BRL', 10000, 0.02,
                     '2026-01-01', 0, 1)"
        )->execute([$planningId]);
        $accountId = (int) $pdo->lastInsertId();

        $pdo->prepare(
            "INSERT INTO recurring_items
             (user_id, planning_id, kind, name, category, region, default_amount_brl, currency,
              is_fixed, investment_type_id, financial_account_id, active)
             VALUES (?, ?, 'investment', 'Aporte CDI PHPUnit', 'Investimento', 'geral', 0, 'BRL',
                     1, ?, ?, 1)"
        )->execute([self::$ownerId, $planningId, $typeId, $accountId]);

        $portfolio = InvestmentPortfolioService::portfolio($pdo, $planningId, 2026, 8);
        $item = null;
        foreach ($portfolio['items'] as $it) {
            if ((int) $it['id'] === $typeId) {
                $item = $it;
                break;
            }
        }
        $this->assertNotNull($item);
        $this->assertSame(10000.0, $item['currentBalanceBrl']);
        // 10000 * 0.02 * 100% = 200
        $this->assertSame(200.0, $item['cdiYieldBrl']);
        $this->assertSame(0.02, $item['effectiveCdiMonthlyRate']);
        $this->assertSame(0.01, $portfolio['cdiMonthlyRate']);
    }
}
