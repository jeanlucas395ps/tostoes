<?php

declare(strict_types=1);

namespace Gastos\Api\Tests\Integration;

use Gastos\Api\Config;
use Gastos\Api\Services\AccountService;
use PDO;
use PDOException;
use PHPUnit\Framework\TestCase;

/**
 * Valida transferência espontânea banco → investimento:
 * saldos mudam e o modo aporte é usado (entrada visível).
 */
final class BankToInvestmentTransferTest extends TestCase
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

    public function testBankToInvestmentCreatesAporteAndMovesBalances(): void
    {
        $pdo = self::$pdo;
        $planningId = self::$planningId;

        $pdo->prepare(
            "INSERT INTO financial_accounts
             (planning_id, name, type, currency, initial_balance, initial_balance_date, sort_order, active)
             VALUES (?, 'Banco PHPUnit', 'bank', 'BRL', 1000, '2026-01-01', 0, 1)"
        )->execute([$planningId]);
        $bankId = (int) $pdo->lastInsertId();

        $pdo->prepare(
            "INSERT INTO financial_accounts
             (planning_id, name, type, currency, initial_balance, initial_balance_date, sort_order, active)
             VALUES (?, 'Invest PHPUnit', 'investment', 'BRL', 200, '2026-01-01', 0, 1)"
        )->execute([$planningId]);
        $invId = (int) $pdo->lastInsertId();

        $bankBefore = AccountService::computeBalance($pdo, $this->fetchAccount($bankId));
        $invBefore = AccountService::computeBalance($pdo, $this->fetchAccount($invId));
        $this->assertSame(1000.0, $bankBefore);
        $this->assertSame(200.0, $invBefore);

        $pair = AccountService::createConfirmedTransfer($pdo, [
            'planningId' => $planningId,
            'ownerUserId' => self::$ownerId,
            'registeredBy' => self::$ownerId,
            'sourceAccountId' => $bankId,
            'targetAccountId' => $invId,
            'amount' => 150,
            'currency' => 'BRL',
            'transactionDate' => '2026-08-15',
            'description' => 'Aporte espontâneo teste',
        ]);

        $this->assertSame('aporte', $pair['mode']);
        $this->assertGreaterThan(0, $pair['outTxId']);
        $this->assertGreaterThan(0, $pair['inTxId']);

        $out = $pdo->query(
            'SELECT kind, notes, account_id, amount FROM transactions WHERE id = ' . (int) $pair['outTxId']
        )->fetch(PDO::FETCH_ASSOC);
        $in = $pdo->query(
            'SELECT kind, notes, account_id, amount FROM transactions WHERE id = ' . (int) $pair['inTxId']
        )->fetch(PDO::FETCH_ASSOC);

        $this->assertSame('investment', $out['kind']);
        $this->assertSame('income', $in['kind']);
        $this->assertSame($bankId, (int) $out['account_id']);
        $this->assertSame($invId, (int) $in['account_id']);
        $this->assertStringContainsString('Aporte →', (string) $out['notes']);
        $this->assertStringContainsString('Aporte ←', (string) $in['notes']);

        $bankAfter = AccountService::computeBalance($pdo, $this->fetchAccount($bankId));
        $invAfter = AccountService::computeBalance($pdo, $this->fetchAccount($invId));
        $this->assertSame(850.0, $bankAfter);
        $this->assertSame(350.0, $invAfter);
    }

    public function testBankToBankKeepsTransferKind(): void
    {
        $pdo = self::$pdo;
        $planningId = self::$planningId;

        $pdo->prepare(
            "INSERT INTO financial_accounts
             (planning_id, name, type, currency, initial_balance, initial_balance_date, sort_order, active)
             VALUES (?, 'Banco A PHPUnit', 'bank', 'BRL', 500, '2026-01-01', 0, 1)"
        )->execute([$planningId]);
        $a = (int) $pdo->lastInsertId();

        $pdo->prepare(
            "INSERT INTO financial_accounts
             (planning_id, name, type, currency, initial_balance, initial_balance_date, sort_order, active)
             VALUES (?, 'Banco B PHPUnit', 'bank', 'BRL', 100, '2026-01-01', 0, 1)"
        )->execute([$planningId]);
        $b = (int) $pdo->lastInsertId();

        $pair = AccountService::createConfirmedTransfer($pdo, [
            'planningId' => $planningId,
            'ownerUserId' => self::$ownerId,
            'registeredBy' => self::$ownerId,
            'sourceAccountId' => $a,
            'targetAccountId' => $b,
            'amount' => 80,
            'currency' => 'BRL',
            'transactionDate' => '2026-08-15',
            'description' => 'Transf banco-banco',
        ]);

        $this->assertSame('transfer', $pair['mode']);
        $this->assertSame(420.0, AccountService::computeBalance($pdo, $this->fetchAccount($a)));
        $this->assertSame(180.0, AccountService::computeBalance($pdo, $this->fetchAccount($b)));
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
