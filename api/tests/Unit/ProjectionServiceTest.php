<?php

declare(strict_types=1);

namespace Gastos\Api\Tests\Unit;

use Gastos\Api\Services\ProjectionService;
use PDO;
use PDOStatement;
use PHPUnit\Framework\TestCase;

final class ProjectionServiceTest extends TestCase
{
    public function testEmptyTotals(): void
    {
        $t = ProjectionService::emptyTotals();
        $this->assertSame(0.0, $t['income']);
        $this->assertSame(0.0, $t['expense']);
        $this->assertSame(0.0, $t['investment']);
        $this->assertSame(0.0, $t['goals']);
        $this->assertSame(0.0, $t['leisure']);
    }

    public function testCurrentYearMonth(): void
    {
        $ym = ProjectionService::currentYearMonth();
        $this->assertSame((int) date('Y'), $ym['year']);
        $this->assertSame((int) date('n'), $ym['month']);
    }

    public function testIsBeforeAndCurrentOrFutureMonth(): void
    {
        $y = (int) date('Y');
        $m = (int) date('n');
        $this->assertTrue(ProjectionService::isBeforeCurrentMonth($y - 1, 12));
        $this->assertFalse(ProjectionService::isBeforeCurrentMonth($y + 1, 1));
        $this->assertFalse(ProjectionService::isBeforeCurrentMonth($y, $m));
        if ($m > 1) {
            $this->assertTrue(ProjectionService::isBeforeCurrentMonth($y, $m - 1));
        }
        $this->assertTrue(ProjectionService::isCurrentOrFutureMonth($y, $m));
        $this->assertTrue(ProjectionService::isCurrentOrFutureMonth($y + 1, 1));
    }

    public function testSqlCurrentOrFutureMonthClause(): void
    {
        $y = (int) date('Y');
        $m = (int) date('n');
        $sql = ProjectionService::sqlCurrentOrFutureMonthClause('y', 'm');
        $this->assertStringContainsString("y > {$y}", $sql);
        $this->assertStringContainsString("m >= {$m}", $sql);
    }

    public function testFxReferenceDate(): void
    {
        $y = (int) date('Y');
        $m = (int) date('n');
        $this->assertSame(date('Y-m-d'), ProjectionService::fxReferenceDate($y, $m));
        $this->assertSame(
            sprintf('%04d-%02d-01', $y + 1, 3),
            ProjectionService::fxReferenceDate($y + 1, 3)
        );
    }

    public function testAmountInBrlForMonthBrl(): void
    {
        $pdo = $this->createMock(PDO::class);
        $this->assertSame(42.5, ProjectionService::amountInBrlForMonth($pdo, 1, 2026, 1, 'BRL', 42.5));
        $this->assertSame(10.0, ProjectionService::amountInBrlForMonth($pdo, 1, 2026, 1, 'BRL', 99, 10.0));
    }

    public function testEntrySuggestedBrlBrl(): void
    {
        $pdo = $this->createMock(PDO::class);
        $brl = ProjectionService::entrySuggestedBrl($pdo, 1, 2026, 7, [
            'currency' => 'BRL',
            'suggested_amount' => 50,
            'suggested_amount_brl' => 50,
        ]);
        $this->assertSame(50.0, $brl);
    }

    public function testAccumulatePlanEntrySkipsAndGoals(): void
    {
        $pdo = $this->createMock(PDO::class);
        $totals = ProjectionService::emptyTotals();

        ProjectionService::accumulatePlanEntry($totals, $pdo, 1, 2026, 7, [
            'status' => 'skipped',
            'kind' => 'expense',
            'currency' => 'BRL',
            'suggested_amount_brl' => 100,
        ]);
        $this->assertSame(0.0, $totals['expense']);

        ProjectionService::accumulatePlanEntry($totals, $pdo, 1, 2026, 7, [
            'status' => 'pending',
            'kind' => 'investment',
            'financial_goal_id' => 3,
            'currency' => 'BRL',
            'suggested_amount' => 200,
            'suggested_amount_brl' => 200,
        ]);
        $this->assertSame(200.0, $totals['goals']);
        $this->assertSame(0.0, $totals['investment']);

        ProjectionService::accumulatePlanEntry($totals, $pdo, 1, 2026, 7, [
            'status' => 'pending',
            'kind' => 'income',
            'currency' => 'BRL',
            'suggested_amount' => 1000,
            'suggested_amount_brl' => 1000,
        ]);
        $this->assertSame(1000.0, $totals['income']);
    }

    public function testProjectedTotalsFromPlanEntries(): void
    {
        $stmt = $this->createMock(PDOStatement::class);
        $stmt->method('execute');
        $stmt->method('fetchAll')->willReturn([
            [
                'kind' => 'expense',
                'currency' => 'BRL',
                'suggested_amount' => 30,
                'suggested_amount_brl' => 30,
                'status' => 'pending',
                'financial_goal_id' => null,
            ],
            [
                'kind' => 'income',
                'currency' => 'BRL',
                'suggested_amount' => 100,
                'suggested_amount_brl' => 100,
                'status' => 'confirmed',
                'financial_goal_id' => null,
            ],
        ]);

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturn($stmt);

        $totals = ProjectionService::projectedTotalsFromPlanEntries($pdo, 1, 2026, 7);
        $this->assertSame(30.0, $totals['expense']);
        $this->assertSame(100.0, $totals['income']);
    }
}
