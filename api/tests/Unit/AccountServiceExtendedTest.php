<?php

declare(strict_types=1);

namespace Gastos\Api\Tests\Unit;

use Gastos\Api\Services\AccountService;
use PDO;
use PDOStatement;
use PHPUnit\Framework\TestCase;

final class AccountServiceExtendedTest extends TestCase
{
    public function testListActiveWithAndWithoutType(): void
    {
        $stmt = $this->createMock(PDOStatement::class);
        $stmt->method('execute');
        $stmt->method('fetchAll')->willReturn([
            ['id' => 1, 'type' => 'bank', 'name' => 'Itaú'],
        ]);

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturn($stmt);

        $all = AccountService::listActive($pdo, 1);
        $this->assertCount(1, $all);

        $credit = AccountService::listActive($pdo, 1, 'credit');
        $this->assertCount(1, $credit);
    }

    public function testComputeBalanceBank(): void
    {
        $txs = $this->createMock(PDOStatement::class);
        $txs->method('execute');
        $txs->method('fetch')->willReturnOnConsecutiveCalls(
            [
                'kind' => 'income',
                'amount' => 100,
                'currency' => 'BRL',
                'amount_brl' => 100,
                'eur_to_brl' => null,
                'notes' => null,
            ],
            [
                'kind' => 'expense',
                'amount' => 40,
                'currency' => 'BRL',
                'amount_brl' => 40,
                'eur_to_brl' => null,
                'notes' => null,
            ],
            false
        );

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturn($txs);

        $balance = AccountService::computeBalance($pdo, [
            'id' => 1,
            'planning_id' => 1,
            'currency' => 'BRL',
            'type' => 'bank',
            'initial_balance' => 50,
            'initial_balance_date' => '2026-01-01',
        ], 6.0);

        $this->assertSame(110.0, $balance);
    }

    public function testBalanceAtDate(): void
    {
        $txs = $this->createMock(PDOStatement::class);
        $txs->method('execute');
        $txs->method('fetch')->willReturnOnConsecutiveCalls(
            [
                'kind' => 'income',
                'amount' => 20,
                'currency' => 'BRL',
                'amount_brl' => 20,
                'eur_to_brl' => null,
                'notes' => null,
                'transaction_date' => '2026-01-05',
            ],
            false
        );

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturn($txs);

        $balance = AccountService::balanceAtDate($pdo, [
            'id' => 1,
            'planning_id' => 1,
            'currency' => 'BRL',
            'type' => 'bank',
            'initial_balance' => 10,
            'initial_balance_date' => '2026-01-01',
        ], '2026-01-31', 6.0);

        $this->assertSame(30.0, $balance);
    }

    public function testBalanceToBrlUsd(): void
    {
        $this->assertSame(50.0, AccountService::balanceToBrl(10, 'USD', 5.0));
    }

    public function testMapAccountBankWithoutStatement(): void
    {
        $fx = $this->createMock(PDOStatement::class);
        $fx->method('execute');
        $fx->method('fetchColumn')->willReturn('6.2');

        $txs = $this->createMock(PDOStatement::class);
        $txs->method('execute');
        $txs->method('fetch')->willReturn(false);

        $pdo = $this->createMock(PDO::class);
        // getEurToBrlFallback, getUsdToBrlFallback (hasUsd column query + select), computeBalance txs
        $info = $this->createMock(PDOStatement::class);
        $info->method('fetchColumn')->willReturn(false);

        $pdo->method('query')->willReturn($info);
        $pdo->method('prepare')->willReturnCallback(function () use ($fx, $txs) {
            static $i = 0;
            $i++;
            return $i <= 2 ? $fx : $txs;
        });

        $mapped = AccountService::mapAccount($pdo, [
            'id' => 1,
            'planning_id' => 1,
            'name' => 'Banco',
            'type' => 'bank',
            'currency' => 'BRL',
            'color' => '#000',
            'initial_balance' => 100,
            'initial_balance_date' => '2026-01-01',
            'sort_order' => 0,
            'active' => 1,
            'credit_limit' => null,
            'due_day' => null,
            'closing_day' => null,
            'created_at' => '2026-01-01',
        ], false);

        $this->assertSame(1, $mapped['id']);
        $this->assertSame('Banco', $mapped['name']);
        $this->assertSame(100.0, $mapped['balance']);
        $this->assertArrayNotHasKey('statement', $mapped);
    }

    public function testCreditMonthForecastEmpty(): void
    {
        $stmt = $this->createMock(PDOStatement::class);
        $stmt->method('execute');
        $stmt->method('fetchAll')->willReturn([]);

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturn($stmt);

        $forecast = AccountService::creditMonthForecast($pdo, 1, 5, 2026, 7, 6.0);
        $this->assertArrayHasKey('pendingBrl', $forecast);
        $this->assertArrayHasKey('confirmedBrl', $forecast);
        $this->assertArrayHasKey('totalBrl', $forecast);
        $this->assertSame(0.0, $forecast['totalBrl']);
    }

    public function testFutureInstallmentsCommittedEmpty(): void
    {
        $stmt = $this->createMock(PDOStatement::class);
        $stmt->method('execute');
        $stmt->method('fetchAll')->willReturn([]);

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturn($stmt);

        $this->assertSame(
            0.0,
            AccountService::futureInstallmentsCommitted($pdo, 1, 5, 'BRL', 6.0)
        );
    }
}
