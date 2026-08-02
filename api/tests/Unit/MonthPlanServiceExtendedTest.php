<?php

declare(strict_types=1);

namespace Gastos\Api\Tests\Unit;

use Gastos\Api\Services\MonthPlanService;
use PDO;
use PHPUnit\Framework\TestCase;

final class MonthPlanServiceExtendedTest extends TestCase
{
    public function testTodayDayForMonth(): void
    {
        $y = (int) date('Y');
        $m = (int) date('n');
        $this->assertSame((int) date('j'), MonthPlanService::todayDayForMonth($y, $m));
        $this->assertSame(31, MonthPlanService::todayDayForMonth($y - 1, 12));
        $this->assertSame(0, MonthPlanService::todayDayForMonth($y + 1, 1));
    }

    public function testMapEntryMinimal(): void
    {
        $mapped = MonthPlanService::mapEntry([
            'id' => 10,
            'year' => 2026,
            'month' => 7,
            'kind' => 'expense',
            'name' => 'Mercado',
            'category' => 'Mercado',
            'region' => 'BR',
            'status' => 'pending',
            'suggested_amount_brl' => 100,
            'suggested_amount' => 100,
            'currency' => 'BRL',
            'due_day' => 5,
            'recurring_item_id' => 3,
            'financial_goal_id' => null,
            'responsible' => null,
            'responsible_user_id' => null,
            'investment_type_id' => null,
            'financial_account_id' => 1,
            'source_financial_account_id' => 2,
            'custom_tab_id' => null,
            'item_category_id' => null,
            'confirmed_amount_brl' => null,
            'transaction_id' => null,
            'is_installment' => 0,
            'notes' => null,
        ]);

        $this->assertSame(10, $mapped['id']);
        $this->assertSame('expense', $mapped['kind']);
        $this->assertSame('Mercado', $mapped['name']);
        $this->assertSame(3, $mapped['recurringItemId']);
        $this->assertSame(100.0, $mapped['suggestedAmountBrl']);
        $this->assertSame('Conjunto', $mapped['responsible']);
    }

    public function testMapEntryConfirmedGoal(): void
    {
        $mapped = MonthPlanService::mapEntry([
            'id' => 11,
            'year' => 2026,
            'month' => 7,
            'kind' => 'investment',
            'name' => 'Meta Casa',
            'category' => 'Meta',
            'region' => 'geral',
            'status' => 'confirmed',
            'suggested_amount_brl' => 500,
            'suggested_amount' => 500,
            'currency' => 'BRL',
            'due_day' => 1,
            'recurring_item_id' => null,
            'financial_goal_id' => 9,
            'financial_goal_color' => '#abc',
            'responsible' => 'Ana',
            'responsible_user_id' => null,
            'investment_type_id' => null,
            'financial_account_id' => null,
            'source_financial_account_id' => null,
            'custom_tab_id' => null,
            'item_category_id' => null,
            'confirmed_amount_brl' => 500,
            'transaction_id' => 77,
            'is_installment' => 1,
            'investment_type_name' => null,
            'investment_type_color' => null,
            'financial_account_name' => null,
            'source_financial_account_name' => null,
            'custom_tab_name' => null,
            'item_category_name' => null,
            'item_category_icon' => null,
        ]);

        $this->assertSame(9, $mapped['financialGoalId']);
        $this->assertSame(500.0, $mapped['confirmedAmountBrl']);
        $this->assertTrue($mapped['isInstallment']);
        $this->assertSame(77, $mapped['transactionId']);
    }

    public function testBuildSummaryBrl(): void
    {
        $pdo = $this->createMock(PDO::class);
        $entries = [
            MonthPlanService::mapEntry([
                'id' => 1,
                'year' => 2026,
                'month' => 7,
                'kind' => 'income',
                'name' => 'Salário',
                'category' => 'Salário',
                'region' => 'geral',
                'status' => 'confirmed',
                'suggested_amount_brl' => 1000,
                'suggested_amount' => 1000,
                'currency' => 'BRL',
                'due_day' => 1,
                'recurring_item_id' => 1,
                'financial_goal_id' => null,
                'responsible' => null,
                'responsible_user_id' => null,
                'investment_type_id' => null,
                'financial_account_id' => null,
                'source_financial_account_id' => null,
                'custom_tab_id' => null,
                'item_category_id' => null,
                'confirmed_amount_brl' => 1000,
                'transaction_id' => 1,
                'is_installment' => 0,
            ]),
            MonthPlanService::mapEntry([
                'id' => 2,
                'year' => 2026,
                'month' => 7,
                'kind' => 'expense',
                'name' => 'Luz',
                'category' => 'Casa',
                'region' => 'geral',
                'status' => 'pending',
                'suggested_amount_brl' => 200,
                'suggested_amount' => 200,
                'currency' => 'BRL',
                'due_day' => 10,
                'recurring_item_id' => 2,
                'financial_goal_id' => null,
                'responsible' => null,
                'responsible_user_id' => null,
                'investment_type_id' => null,
                'financial_account_id' => null,
                'source_financial_account_id' => null,
                'custom_tab_id' => null,
                'item_category_id' => null,
                'confirmed_amount_brl' => null,
                'transaction_id' => null,
                'is_installment' => 0,
            ]),
            MonthPlanService::mapEntry([
                'id' => 3,
                'year' => 2026,
                'month' => 7,
                'kind' => 'transfer',
                'name' => 'Pagamento fatura',
                'category' => 'Transfer',
                'region' => 'geral',
                'status' => 'pending',
                'suggested_amount_brl' => 50,
                'suggested_amount' => 50,
                'currency' => 'BRL',
                'due_day' => 15,
                'recurring_item_id' => null,
                'financial_goal_id' => null,
                'responsible' => null,
                'responsible_user_id' => null,
                'investment_type_id' => null,
                'financial_account_id' => null,
                'source_financial_account_id' => null,
                'custom_tab_id' => null,
                'item_category_id' => null,
                'confirmed_amount_brl' => null,
                'transaction_id' => null,
                'is_installment' => 0,
            ]),
            MonthPlanService::mapEntry([
                'id' => 4,
                'year' => 2026,
                'month' => 7,
                'kind' => 'expense',
                'name' => 'Skip',
                'category' => 'X',
                'region' => 'geral',
                'status' => 'skipped',
                'suggested_amount_brl' => 999,
                'suggested_amount' => 999,
                'currency' => 'BRL',
                'due_day' => 1,
                'recurring_item_id' => 4,
                'financial_goal_id' => null,
                'responsible' => null,
                'responsible_user_id' => null,
                'investment_type_id' => null,
                'financial_account_id' => null,
                'source_financial_account_id' => null,
                'custom_tab_id' => null,
                'item_category_id' => null,
                'confirmed_amount_brl' => null,
                'transaction_id' => null,
                'is_installment' => 0,
            ]),
        ];

        $forecast = [
            [
                'kind' => 'expense',
                'suggestedAmountBrl' => 80.0,
            ],
        ];

        $summary = MonthPlanService::buildSummary($pdo, 1, 2026, 7, $entries, $forecast);
        $this->assertSame(1000.0, $summary['projected']['income']);
        $this->assertSame(280.0, $summary['projected']['expense']);
        $this->assertSame(1000.0, $summary['confirmed']['income']);
        $this->assertArrayHasKey('pendingFixedCount', $summary);
        $this->assertArrayHasKey('pendingVariableCount', $summary);
    }

    public function testScrubPendingOutsideInstallmentWindowEmpty(): void
    {
        $stmt = $this->createMock(\PDOStatement::class);
        $stmt->method('execute');
        $stmt->method('fetch')->willReturn(false);

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturn($stmt);

        MonthPlanService::scrubPendingOutsideInstallmentWindow($pdo, 1, 9);
        $this->assertTrue(true);
    }

    public function testRemoveFuturePendingForRecurring(): void
    {
        $stmt = $this->createMock(\PDOStatement::class);
        $stmt->expects($this->once())->method('execute')->with([1, 9]);

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturn($stmt);

        MonthPlanService::removeFuturePendingForRecurring($pdo, 1, 9);
    }

    public function testFindEntryForTransactionDirect(): void
    {
        $stmt = $this->createMock(\PDOStatement::class);
        $stmt->method('execute');
        $stmt->method('fetch')->willReturn([
            'id' => 5,
            'transaction_id' => 99,
        ]);

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturn($stmt);

        $entry = MonthPlanService::findEntryForTransaction($pdo, 1, 99);
        $this->assertNotNull($entry);
        $this->assertSame(5, $entry['id']);
    }

    public function testDeleteLinkedTransactions(): void
    {
        $primary = $this->createMock(\PDOStatement::class);
        $primary->method('execute');
        $primary->method('fetch')->willReturn([
            'id' => 99,
            'account_id' => 3,
            'notes' => 'Pagamento (#100)',
        ]);

        $mirrors = $this->createMock(\PDOStatement::class);
        $mirrors->method('execute');
        $mirrors->method('fetchAll')->willReturn([
            ['id' => 101, 'account_id' => 4],
        ]);

        $delete = $this->createMock(\PDOStatement::class);
        $delete->method('execute');

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturnOnConsecutiveCalls($primary, $mirrors, $delete);

        $accounts = MonthPlanService::deleteLinkedTransactions($pdo, 1, 99);
        $this->assertContains(3, $accounts);
        $this->assertContains(4, $accounts);
    }
}
