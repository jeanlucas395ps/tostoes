<?php

declare(strict_types=1);

namespace Gastos\Api\Tests\Integration;

use Gastos\Api\Config;
use Gastos\Api\ResponseExitException;
use Gastos\Api\Services\AccountService;
use Gastos\Api\Services\MonthPlanService;
use PDO;
use PDOException;
use PHPUnit\Framework\TestCase;

/**
 * Compra parcelada no cartão + adiantamento banco → crédito.
 */
final class InstallmentAdvancePaymentTest extends TestCase
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
            $col = self::$pdo->query("SHOW COLUMNS FROM financial_accounts LIKE 'type'")->fetch(PDO::FETCH_ASSOC);
            if ($col && !str_contains(strtolower((string) ($col['Type'] ?? '')), 'credit')) {
                self::markTestSkipped('Migration de cartão de crédito não aplicada.');
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

    public function testInstallmentSourceMustBeCreditAccount(): void
    {
        $pdo = self::$pdo;
        $planningId = self::$planningId;

        $pdo->prepare(
            "INSERT INTO financial_accounts
             (planning_id, name, type, currency, initial_balance, initial_balance_date, sort_order, active)
             VALUES (?, 'Banco Parcela PHPUnit', 'bank', 'BRL', 1000, '2026-01-01', 0, 1)"
        )->execute([$planningId]);
        $bankId = (int) $pdo->lastInsertId();

        $this->expectException(ResponseExitException::class);
        try {
            AccountService::validateAccountId($pdo, $planningId, $bankId, 'credit');
        } catch (ResponseExitException $e) {
            $this->assertSame(422, $e->status);
            $this->assertStringContainsString('cartão de crédito', (string) ($e->payload['error'] ?? ''));
            throw $e;
        }
    }

    public function testInstallmentOnCreditAppearsInMonthForecast(): void
    {
        $pdo = self::$pdo;
        $planningId = self::$planningId;
        $year = 2026;
        $month = 8;

        $pdo->prepare(
            "INSERT INTO financial_accounts
             (planning_id, name, type, currency, initial_balance, credit_limit, closing_day, due_day,
              initial_balance_date, color, sort_order, active)
             VALUES (?, 'Cartão Parcela PHPUnit', 'credit', 'BRL', 0, 5000, 1, 10, '2026-01-01', '#111', 0, 1)"
        )->execute([$planningId]);
        $cardId = (int) $pdo->lastInsertId();

        $pdo->prepare(
            "INSERT INTO recurring_items
             (user_id, planning_id, kind, name, category, region, due_day, default_amount_brl, currency,
              is_fixed, is_installment, start_date, end_date, source_financial_account_id, active)
             VALUES (?, ?, 'expense', 'TesteParcela PHPUnit', 'Geral', 'geral', 15, 500, 'BRL',
                     1, 1, '2026-07-01', '2026-09-01', ?, 1)"
        )->execute([self::$ownerId, $planningId, $cardId]);

        MonthPlanService::syncAllFixedForMonth($pdo, $planningId, $year, $month);

        $entry = $pdo->query(
            "SELECT id, name, source_financial_account_id, status, suggested_amount_brl
             FROM month_plan_entries
             WHERE planning_id = {$planningId} AND year = {$year} AND month = {$month}
               AND name = 'TesteParcela PHPUnit'
             LIMIT 1"
        )->fetch(PDO::FETCH_ASSOC);
        $this->assertNotFalse($entry);
        $this->assertSame($cardId, (int) $entry['source_financial_account_id']);
        $this->assertSame('pending', $entry['status']);
        $this->assertSame(500.0, (float) $entry['suggested_amount_brl']);

        $forecast = AccountService::creditMonthForecast($pdo, $planningId, $cardId, $year, $month);
        $this->assertGreaterThanOrEqual(500.0, $forecast['pendingBrl']);
        $this->assertGreaterThanOrEqual(500.0, $forecast['totalBrl']);
    }

    public function testAdvanceBankToCreditMovesBalancesAndUsesTransferMode(): void
    {
        $pdo = self::$pdo;
        $planningId = self::$planningId;

        $pdo->prepare(
            "INSERT INTO financial_accounts
             (planning_id, name, type, currency, initial_balance, initial_balance_date, sort_order, active)
             VALUES (?, 'Banco Adiant PHPUnit', 'bank', 'BRL', 2000, '2026-01-01', 0, 1)"
        )->execute([$planningId]);
        $bankId = (int) $pdo->lastInsertId();

        $pdo->prepare(
            "INSERT INTO financial_accounts
             (planning_id, name, type, currency, initial_balance, credit_limit, closing_day, due_day,
              initial_balance_date, color, sort_order, active)
             VALUES (?, 'Cartão Adiant PHPUnit', 'credit', 'BRL', 800, 5000, 1, 10, '2026-01-01', '#222', 0, 1)"
        )->execute([$planningId]);
        $cardId = (int) $pdo->lastInsertId();

        $pair = AccountService::createConfirmedTransfer($pdo, [
            'planningId' => $planningId,
            'ownerUserId' => self::$ownerId,
            'registeredBy' => self::$ownerId,
            'sourceAccountId' => $bankId,
            'targetAccountId' => $cardId,
            'amount' => 300,
            'currency' => 'BRL',
            'transactionDate' => '2026-08-15',
            'description' => 'Adiantamento · TesteParcela PHPUnit',
            'extraNotes' => 'Itens: TesteParcela PHPUnit',
        ]);

        $this->assertSame('transfer', $pair['mode']);
        $this->assertGreaterThan(0, $pair['outTxId']);
        $this->assertGreaterThan(0, $pair['inTxId']);

        $out = $pdo->query(
            'SELECT kind, notes, account_id, amount FROM transactions WHERE id = ' . (int) $pair['outTxId']
        )->fetch(PDO::FETCH_ASSOC);
        $in = $pdo->query(
            'SELECT kind, notes, account_id, amount FROM transactions WHERE id = ' . (int) $pair['inTxId']
        )->fetch(PDO::FETCH_ASSOC);

        $this->assertSame('transfer', $out['kind']);
        $this->assertSame('transfer', $in['kind']);
        $this->assertSame($bankId, (int) $out['account_id']);
        $this->assertSame($cardId, (int) $in['account_id']);
        $this->assertStringContainsString('Transferência →', (string) $out['notes']);
        $this->assertStringContainsString('Transferência ←', (string) $in['notes']);
        $this->assertStringContainsString('TesteParcela PHPUnit', (string) $out['notes']);

        $this->assertSame(1700.0, AccountService::computeBalance($pdo, $this->fetchAccount($bankId)));
        // crédito: dívida inicial 800 − pagamento 300 = 500
        $this->assertSame(500.0, AccountService::computeBalance($pdo, $this->fetchAccount($cardId)));
    }

    public function testInstallmentLinkedToBankIsNotInCreditForecast(): void
    {
        $pdo = self::$pdo;
        $planningId = self::$planningId;
        $year = 2026;
        $month = 8;

        $pdo->prepare(
            "INSERT INTO financial_accounts
             (planning_id, name, type, currency, initial_balance, initial_balance_date, sort_order, active)
             VALUES (?, 'Banco Errado PHPUnit', 'bank', 'BRL', 100, '2026-01-01', 0, 1)"
        )->execute([$planningId]);
        $bankId = (int) $pdo->lastInsertId();

        $pdo->prepare(
            "INSERT INTO financial_accounts
             (planning_id, name, type, currency, initial_balance, credit_limit, closing_day, due_day,
              initial_balance_date, color, sort_order, active)
             VALUES (?, 'Cartão Sem Item PHPUnit', 'credit', 'BRL', 0, 3000, 1, 10, '2026-01-01', '#333', 0, 1)"
        )->execute([$planningId]);
        $cardId = (int) $pdo->lastInsertId();

        $pdo->prepare(
            "INSERT INTO recurring_items
             (user_id, planning_id, kind, name, category, region, due_day, default_amount_brl, currency,
              is_fixed, is_installment, start_date, end_date, source_financial_account_id, active)
             VALUES (?, ?, 'expense', 'Parcela no banco PHPUnit', 'Geral', 'geral', 15, 400, 'BRL',
                     1, 1, '2026-07-01', '2026-09-01', ?, 1)"
        )->execute([self::$ownerId, $planningId, $bankId]);

        MonthPlanService::syncAllFixedForMonth($pdo, $planningId, $year, $month);

        $forecast = AccountService::creditMonthForecast($pdo, $planningId, $cardId, $year, $month);
        $this->assertSame(0.0, $forecast['pendingBrl']);
        $this->assertSame(0.0, $forecast['totalBrl']);
    }

    /** @return array<string, mixed> */
    private function fetchAccount(int $id): array
    {
        $stmt = self::$pdo->prepare('SELECT * FROM financial_accounts WHERE id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        $this->assertNotFalse($row);

        return $row;
    }
}
