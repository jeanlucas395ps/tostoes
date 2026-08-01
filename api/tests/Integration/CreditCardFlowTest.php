<?php

declare(strict_types=1);

namespace Gastos\Api\Tests\Integration;

use Gastos\Api\Config;
use Gastos\Api\Services\AccountService;
use Gastos\Api\Services\AccountFlowGraphService;
use PDO;
use PDOException;
use PHPUnit\Framework\TestCase;

/**
 * Fluxo cartão: dívida, forecast e nós no grafo.
 * Usa MySQL local (api/.env) dentro de uma transação revertida.
 */
final class CreditCardFlowTest extends TestCase
{
    private static ?PDO $pdo = null;
    private static int $planningId = 0;
    private static bool $ready = false;

    public static function setUpBeforeClass(): void
    {
        Config::load(dirname(__DIR__, 2));
        // No Docker o host é host.docker.internal; nos testes CLI usamos 127.0.0.1.
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
            $stmt = self::$pdo->query('SELECT id FROM plannings ORDER BY id LIMIT 1');
            $id = $stmt ? $stmt->fetchColumn() : false;
            if ($id === false) {
                self::markTestSkipped('Nenhum planejamento no banco.');
            }
            self::$planningId = (int) $id;
            // Garante coluna type=credit
            $col = self::$pdo->query("SHOW COLUMNS FROM financial_accounts LIKE 'type'")->fetch(PDO::FETCH_ASSOC);
            if ($col && !str_contains(strtolower((string) ($col['Type'] ?? '')), 'credit')) {
                self::markTestSkipped('Migration 024 (credit cards) não aplicada.');
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

    public function testCreditBalancePurchaseAndPayment(): void
    {
        $pdo = self::$pdo;
        $planningId = self::$planningId;

        $pdo->prepare(
            "INSERT INTO financial_accounts
             (planning_id, name, type, currency, initial_balance, credit_limit, closing_day, due_day,
              initial_balance_date, color, sort_order, active)
             VALUES (?, 'Cartão Teste PHPUnit', 'credit', 'BRL', 500, 5000, 1, 10, '2026-07-01', '#f59e0b', 0, 1)"
        )->execute([$planningId]);
        $cardId = (int) $pdo->lastInsertId();

        $owner = (int) $pdo->query(
            "SELECT created_by_user_id FROM plannings WHERE id = {$planningId}"
        )->fetchColumn();

        $pdo->prepare(
            "INSERT INTO transactions
             (user_id, planning_id, account_id, registered_by_user_id, transaction_date, kind,
              description, amount, currency, amount_brl, category, region)
             VALUES (?, ?, ?, ?, '2026-07-05', 'expense', 'Compra teste', 200, 'BRL', 200, 'Geral', 'geral')"
        )->execute([$owner, $planningId, $cardId, $owner]);

        $pdo->prepare(
            "INSERT INTO transactions
             (user_id, planning_id, account_id, registered_by_user_id, transaction_date, kind,
              description, amount, currency, amount_brl, category, region)
             VALUES (?, ?, ?, ?, '2026-07-08', 'income', 'Pagamento fatura', 100, 'BRL', 100, 'Geral', 'geral')"
        )->execute([$owner, $planningId, $cardId, $owner]);

        $acc = $pdo->query("SELECT * FROM financial_accounts WHERE id = {$cardId}")->fetch(PDO::FETCH_ASSOC);
        $balance = AccountService::computeBalance($pdo, $acc);
        // dívida inicial 500 + compra 200 - pagamento 100 = 600
        $this->assertSame(600.0, $balance);

        $mapped = AccountService::mapAccount($pdo, $acc, false);
        $this->assertSame('credit', $mapped['type']);
        $this->assertSame(600.0, $mapped['usedLimit']);
        $this->assertSame(4400.0, $mapped['availableLimit']);
        $this->assertSame(12.0, $mapped['limitUsagePercent']);
    }

    public function testUsedLimitIncludesFutureInstallments(): void
    {
        $pdo = self::$pdo;
        $planningId = self::$planningId;

        // Congela "hoje" relativo: parcelas de jul–dez 2026; teste assume data do sistema.
        // Usa janela que inclui o mês corrente via start no passado recente.
        $now = new \DateTimeImmutable('today');
        $start = $now->modify('first day of this month')->format('Y-m-d');
        $end = $now->modify('first day of this month')->modify('+5 months')->format('Y-m-d');
        $monthsLeft = 6; // mês corrente + 5

        $pdo->prepare(
            "INSERT INTO financial_accounts
             (planning_id, name, type, currency, initial_balance, credit_limit, closing_day, due_day,
              initial_balance_date, color, sort_order, active)
             VALUES (?, 'Cartão Parcelas PHPUnit', 'credit', 'BRL', 0, 10000, 1, 10, ?, '#f59e0b', 0, 1)"
        )->execute([$planningId, $start]);
        $cardId = (int) $pdo->lastInsertId();

        $owner = (int) $pdo->query(
            "SELECT created_by_user_id FROM plannings WHERE id = {$planningId}"
        )->fetchColumn();

        $pdo->prepare(
            "INSERT INTO recurring_items
             (user_id, planning_id, kind, name, category, region, due_day, default_amount_brl, currency,
              is_fixed, is_installment, start_date, end_date, source_financial_account_id, active)
             VALUES (?, ?, 'expense', 'TV 6x PHPUnit', 'Geral', 'geral', 15, 200, 'BRL',
                     1, 1, ?, ?, ?, 1)"
        )->execute([$owner, $planningId, $start, $end, $cardId]);

        $acc = $pdo->query("SELECT * FROM financial_accounts WHERE id = {$cardId}")->fetch(PDO::FETCH_ASSOC);
        $mapped = AccountService::mapAccount($pdo, $acc, false);

        $expectedFuture = 200.0 * $monthsLeft;
        $this->assertSame($expectedFuture, $mapped['futureInstallments']);
        $this->assertSame($expectedFuture, $mapped['usedLimit']);
        $this->assertSame(round(10000 - $expectedFuture, 2), $mapped['availableLimit']);

        // Confirma a parcela do mês corrente → some do "futuro", entra na dívida via tx
        $year = (int) $now->format('Y');
        $month = (int) $now->format('n');
        \Gastos\Api\Services\MonthPlanService::syncAllFixedForMonth($pdo, $planningId, $year, $month);
        $entryId = (int) $pdo->query(
            "SELECT id FROM month_plan_entries
             WHERE planning_id = {$planningId} AND year = {$year} AND month = {$month}
               AND source_financial_account_id = {$cardId}
             LIMIT 1"
        )->fetchColumn();
        $this->assertGreaterThan(0, $entryId);

        $pdo->prepare(
            "INSERT INTO transactions
             (user_id, planning_id, account_id, registered_by_user_id, transaction_date, kind,
              description, amount, currency, amount_brl, category, region)
             VALUES (?, ?, ?, ?, ?, 'expense', 'Parcela 1', 200, 'BRL', 200, 'Geral', 'geral')"
        )->execute([$owner, $planningId, $cardId, $owner, $start]);
        $txId = (int) $pdo->lastInsertId();
        $pdo->prepare(
            "UPDATE month_plan_entries
             SET status = 'confirmed', confirmed_amount_brl = 200, transaction_id = ?
             WHERE id = ?"
        )->execute([$txId, $entryId]);

        $acc = $pdo->query("SELECT * FROM financial_accounts WHERE id = {$cardId}")->fetch(PDO::FETCH_ASSOC);
        $mapped = AccountService::mapAccount($pdo, $acc, false);
        $expectedFutureAfter = 200.0 * ($monthsLeft - 1);
        $this->assertSame(200.0, $mapped['balance']);
        $this->assertSame($expectedFutureAfter, $mapped['futureInstallments']);
        $this->assertSame(200.0 + $expectedFutureAfter, $mapped['usedLimit']);
    }

    public function testCreditMonthForecastAndGraphNodes(): void
    {
        $pdo = self::$pdo;
        $planningId = self::$planningId;
        $year = 2026;
        $month = 7;

        $pdo->prepare(
            "INSERT INTO financial_accounts
             (planning_id, name, type, currency, initial_balance, credit_limit, closing_day, due_day,
              initial_balance_date, color, sort_order, active)
             VALUES (?, 'Cartão Grafo PHPUnit', 'credit', 'BRL', 0, 8000, 5, 15, '2026-07-01', '#820AD1', 0, 1)"
        )->execute([$planningId]);
        $cardId = (int) $pdo->lastInsertId();

        $owner = (int) $pdo->query(
            "SELECT created_by_user_id FROM plannings WHERE id = {$planningId}"
        )->fetchColumn();

        $pdo->prepare(
            "INSERT INTO recurring_items
             (user_id, planning_id, kind, name, category, region, due_day, default_amount_brl, currency,
              is_fixed, is_installment, start_date, end_date, source_financial_account_id, active)
             VALUES (?, ?, 'expense', 'Parcela PHPUnit', 'Geral', 'geral', 15, 150, 'BRL',
                     1, 1, '2026-07-01', '2026-12-01', ?, 1)"
        )->execute([$owner, $planningId, $cardId]);

        // Sync materializa entry
        \Gastos\Api\Services\MonthPlanService::syncAllFixedForMonth($pdo, $planningId, $year, $month);

        $forecast = AccountService::creditMonthForecast($pdo, $planningId, $cardId, $year, $month);
        $this->assertGreaterThanOrEqual(150.0, $forecast['totalBrl']);
        $this->assertGreaterThanOrEqual(150.0, $forecast['pendingBrl']);

        $graph = AccountFlowGraphService::build($pdo, $planningId, $year, $month, 'planned');
        $creditNodes = array_values(array_filter(
            $graph['nodes'],
            static fn (array $n) => ($n['type'] ?? '') === 'credit' && ($n['accountId'] ?? null) === $cardId
        ));
        $this->assertNotEmpty($creditNodes, 'Cartão deve aparecer no grafo');

        $billNodes = array_values(array_filter(
            $graph['nodes'],
            static fn (array $n) => ($n['type'] ?? '') === 'bill'
                && str_contains((string) ($n['label'] ?? ''), 'vence dia 15')
        ));
        $this->assertNotEmpty($billNodes, 'Fatura com vencimento deve aparecer no grafo');
    }
}
