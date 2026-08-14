<?php

declare(strict_types=1);

namespace Gastos\Api\Tests\Integration;

use DateTimeImmutable;
use Gastos\Api\Config;
use Gastos\Api\Services\AiReportDataCollector;
use PDO;
use PDOException;
use PHPUnit\Framework\TestCase;

/**
 * Exercita AiReportDataCollector::collect() ponta a ponta contra um planejamento
 * isolado (criado e revertido dentro da própria transação), cobrindo os três
 * modos de análise (historical/current/forecast/mixed) e todos os sub-relatórios
 * (top expenses, incomes, investments, installments, goals, portfolio).
 * Usa MySQL local (api/.env) dentro de uma transação revertida.
 */
final class AiReportDataCollectorTest extends TestCase
{
    private static ?PDO $pdo = null;
    private static bool $ready = false;
    private int $planningId = 0;
    private int $ownerId = 1;

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
            $exists = self::$pdo->query('SELECT id FROM users LIMIT 1')->fetchColumn();
            if ($exists === false) {
                self::markTestSkipped('Nenhum usuário no banco.');
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

        $this->ownerId = (int) self::$pdo->query('SELECT id FROM users ORDER BY id LIMIT 1')->fetchColumn();
        self::$pdo->prepare(
            "INSERT INTO plannings (name, created_by_user_id) VALUES ('AI Report PHPUnit', ?)"
        )->execute([$this->ownerId]);
        $this->planningId = (int) self::$pdo->lastInsertId();
    }

    protected function tearDown(): void
    {
        if (self::$pdo?->inTransaction()) {
            self::$pdo->rollBack();
        }
    }

    /** @return array{year: int, month: int} */
    private function monthOffset(int $offset): array
    {
        $tz = new \DateTimeZone((string) Config::get('APP_TIMEZONE', 'America/Sao_Paulo'));
        $now = new DateTimeImmutable('first day of this month', $tz);
        $shifted = $now->modify(sprintf('%+d months', $offset));

        return ['year' => (int) $shifted->format('Y'), 'month' => (int) $shifted->format('n')];
    }

    private function seedMonth(int $year, int $month, string $dayOfMonth = '10', ?int $investmentTypeId = null): void
    {
        $pdo = self::$pdo;
        $date = sprintf('%04d-%02d-%s', $year, $month, $dayOfMonth);

        $insertTx = $pdo->prepare(
            'INSERT INTO transactions
             (user_id, planning_id, registered_by_user_id, transaction_date, kind,
              description, amount, currency, amount_brl, category, region)
             VALUES (?, ?, ?, ?, ?, ?, ?, "BRL", ?, ?, "geral")'
        );
        $insertTx->execute([$this->ownerId, $this->planningId, $this->ownerId, $date, 'income', 'Salário PHPUnit', 5000, 5000, 'Salário']);
        $insertTx->execute([$this->ownerId, $this->planningId, $this->ownerId, $date, 'expense', 'Mercado PHPUnit', 300, 300, 'Mercado']);
        $insertTx->execute([$this->ownerId, $this->planningId, $this->ownerId, $date, 'expense', 'Aluguel PHPUnit', 1200, 1200, 'Moradia']);

        if ($investmentTypeId !== null) {
            $pdo->prepare(
                'INSERT INTO transactions
                 (user_id, planning_id, registered_by_user_id, transaction_date, kind,
                  description, amount, currency, amount_brl, category, region, investment_type_id)
                 VALUES (?, ?, ?, ?, "investment", "Aporte PHPUnit", 400, "BRL", 400, "Investimento", "geral", ?)'
            )->execute([$this->ownerId, $this->planningId, $this->ownerId, $date, $investmentTypeId]);
        } else {
            $insertTx->execute([$this->ownerId, $this->planningId, $this->ownerId, $date, 'investment', 'Aporte PHPUnit', 400, 400, 'Investimento']);
        }
    }

    /** @return int transaction id */
    private function insertTransaction(int $year, int $month, string $kind, string $description, float $amount, string $category): int
    {
        $pdo = self::$pdo;
        $date = sprintf('%04d-%02d-10', $year, $month);
        $pdo->prepare(
            'INSERT INTO transactions
             (user_id, planning_id, registered_by_user_id, transaction_date, kind,
              description, amount, currency, amount_brl, category, region)
             VALUES (?, ?, ?, ?, ?, ?, ?, "BRL", ?, ?, "geral")'
        )->execute([$this->ownerId, $this->planningId, $this->ownerId, $date, $kind, $description, $amount, $amount, $category]);

        return (int) $pdo->lastInsertId();
    }

    private function insertInvestmentType(string $name): int
    {
        $pdo = self::$pdo;
        $slug = strtolower(str_replace(' ', '-', $name));
        $pdo->prepare(
            'INSERT INTO investment_types (user_id, planning_id, name, slug) VALUES (?, ?, ?, ?)'
        )->execute([$this->ownerId, $this->planningId, $name, $slug]);

        return (int) $pdo->lastInsertId();
    }

    private function insertGoalLinkedInvestment(int $year, int $month, float $amountBrl): int
    {
        $pdo = self::$pdo;

        $pdo->prepare(
            "INSERT INTO financial_goals (planning_id, name, target_amount_brl, is_active)
             VALUES (?, 'Meta PHPUnit', 3000, 1)"
        )->execute([$this->planningId]);
        $goalId = (int) $pdo->lastInsertId();

        $txId = $this->insertTransaction($year, $month, 'investment', 'Aporte meta PHPUnit', $amountBrl, 'Meta');

        $pdo->prepare(
            "INSERT INTO month_plan_entries
             (user_id, planning_id, year, month, financial_goal_id, kind, name, category, region,
              suggested_amount_brl, currency, status, transaction_id, confirmed_amount_brl)
             VALUES (?, ?, ?, ?, ?, 'investment', 'Meta PHPUnit', 'Meta', 'geral', ?, 'BRL', 'confirmed', ?, ?)"
        )->execute([$this->ownerId, $this->planningId, $year, $month, $goalId, $amountBrl, $txId, $amountBrl]);

        return $goalId;
    }

    private function insertInstallmentCharge(int $year, int $month): void
    {
        $pdo = self::$pdo;
        $start = sprintf('%04d-%02d-01', $year, $month);
        $end = (new DateTimeImmutable($start))->modify('+5 months')->format('Y-m-d');

        $pdo->prepare(
            "INSERT INTO recurring_items
             (user_id, planning_id, kind, name, category, region, due_day, default_amount_brl, currency,
              is_fixed, is_installment, start_date, end_date, active)
             VALUES (?, ?, 'expense', 'TV 6x PHPUnit', 'Geral', 'geral', 15, 200, 'BRL', 1, 1, ?, ?, 1)"
        )->execute([$this->ownerId, $this->planningId, $start, $end]);
        $itemId = (int) $pdo->lastInsertId();

        $pdo->prepare(
            "INSERT INTO month_plan_entries
             (user_id, planning_id, year, month, recurring_item_id, kind, name, category, region,
              suggested_amount_brl, currency, status)
             VALUES (?, ?, ?, ?, ?, 'expense', 'TV 6x PHPUnit', 'Geral', 'geral', 200, 'BRL', 'pending')"
        )->execute([$this->ownerId, $this->planningId, $year, $month, $itemId]);
    }

    public function testCollectSingleHistoricalMonth(): void
    {
        $ym = $this->monthOffset(-6);
        $investmentTypeId = $this->insertInvestmentType('Reserva PHPUnit');
        $this->seedMonth($ym['year'], $ym['month'], '10', $investmentTypeId);
        $this->insertGoalLinkedInvestment($ym['year'], $ym['month'], 250.0);
        $this->insertInstallmentCharge($ym['year'], $ym['month']);

        $result = AiReportDataCollector::collect(self::$pdo, $this->planningId, [$ym]);

        $this->assertSame('historical', $result['analysisMode']);
        $this->assertFalse($result['period']['includesFutureMonths']);
        $this->assertCount(1, $result['months']);
        $this->assertSame('historical', $result['months'][0]['kind']);

        $totals = $result['periodTotals'];
        $this->assertSame(5000.0, $totals['income']);
        $this->assertSame(1500.0, $totals['expense']);
        $this->assertSame(400.0, $totals['investment']);
        $this->assertSame(250.0, $totals['goals']);
        $this->assertSame(5000.0 - 1500.0 - 400.0 - 250.0, $totals['balance']);

        $categories = array_column($result['months'][0]['expensesByCategory'], 'category');
        $this->assertContains('Mercado', $categories);
        $this->assertContains('Moradia', $categories);

        $topDescriptions = array_column($result['topExpenses'], 'description');
        $this->assertContains('Aluguel PHPUnit', $topDescriptions);
        // Maior valor primeiro.
        $this->assertSame('Aluguel PHPUnit', $result['topExpenses'][0]['description']);

        $incomeCategories = array_column($result['incomes'], 'category');
        $this->assertContains('Salário', $incomeCategories);

        $investmentNames = array_column($result['investments'], 'name');
        $this->assertContains('Reserva PHPUnit', $investmentNames);

        $this->assertCount(1, $result['installments']);
        $this->assertSame('TV 6x PHPUnit', $result['installments'][0]['name']);
        $this->assertCount(1, $result['installments'][0]['chargesInPeriod']);

        $this->assertCount(1, $result['goals']);
        $this->assertSame('Meta PHPUnit', $result['goals'][0]['name']);
        $this->assertSame(250.0, $result['goals'][0]['confirmedContributionsBrl']);
        $this->assertSame(250.0, $result['goals'][0]['currentAmountBrl']);
        $this->assertSame(2750.0, $result['goals'][0]['remainingAmountBrl']);

        $this->assertArrayHasKey('portfolio', $result);
        $this->assertSame('BRL', $result['currency']);
    }

    public function testCollectMixedRangeAcrossPastCurrentAndFuture(): void
    {
        $past = $this->monthOffset(-1);
        $current = $this->monthOffset(0);
        $future = $this->monthOffset(1);

        $this->seedMonth($past['year'], $past['month']);
        $this->seedMonth($current['year'], $current['month']);
        // Mês futuro: sem transações confirmadas, só o forecast entra em jogo.

        $result = AiReportDataCollector::collect(self::$pdo, $this->planningId, [$past, $current, $future]);

        $this->assertSame('mixed', $result['analysisMode']);
        $this->assertTrue($result['period']['includesFutureMonths']);
        $this->assertCount(3, $result['months']);
        $this->assertSame('historical', $result['months'][0]['kind']);
        $this->assertSame('current', $result['months'][1]['kind']);
        $this->assertSame('forecast', $result['months'][2]['kind']);

        // Duas ocorrências do mês semeado (passado + atual).
        $this->assertSame(10000.0, $result['periodTotals']['income']);
    }

    public function testCollectAllForecastMonths(): void
    {
        $future1 = $this->monthOffset(2);
        $future2 = $this->monthOffset(3);

        $result = AiReportDataCollector::collect(self::$pdo, $this->planningId, [$future1, $future2]);

        $this->assertSame('forecast', $result['analysisMode']);
        $this->assertTrue($result['period']['includesFutureMonths']);
        $this->assertSame('forecast', $result['months'][0]['kind']);
        $this->assertSame('forecast', $result['months'][1]['kind']);
        // Sem transações confirmadas nos meses futuros.
        $this->assertSame(0.0, $result['periodTotals']['income']);
        $this->assertSame([], $result['topExpenses']);
        $this->assertSame([], $result['goals']);
    }

    public function testParsePeriodIntegratesWithCollect(): void
    {
        $ym = $this->monthOffset(-2);
        $this->seedMonth($ym['year'], $ym['month']);
        $label = sprintf('%04d-%02d', $ym['year'], $ym['month']);

        $period = AiReportDataCollector::parsePeriod($label, $label);
        $result = AiReportDataCollector::collect(self::$pdo, $this->planningId, $period['months']);

        $this->assertSame($label, $result['period']['start']);
        $this->assertSame($label, $result['period']['end']);
        $this->assertSame(5000.0, $result['periodTotals']['income']);
    }
}
