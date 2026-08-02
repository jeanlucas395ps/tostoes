<?php

declare(strict_types=1);

namespace Gastos\Api\Tests\Unit;

use Gastos\Api\Services\GoalPlanService;
use PDO;
use PDOStatement;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class GoalPlanServiceTest extends TestCase
{
    public function testMonthCount(): void
    {
        $this->assertSame(1, GoalPlanService::monthCount('2026-01-15', '2026-01-20'));
        $this->assertSame(3, GoalPlanService::monthCount('2026-01-01', '2026-03-31'));
        $this->assertSame(13, GoalPlanService::monthCount('2026-01-01', '2027-01-01'));
    }

    public function testMonthlyAmount(): void
    {
        $this->assertSame(100.0, GoalPlanService::monthlyAmount(0, 1200, 12));
        $this->assertSame(0.0, GoalPlanService::monthlyAmount(1000, 500, 5));
        $this->assertSame(33.33, GoalPlanService::monthlyAmount(0, 100, 3));
    }

    public function testMonthsInRange(): void
    {
        $months = GoalPlanService::monthsInRange('2026-06-15', '2026-08-01');
        $this->assertSame([
            ['year' => 2026, 'month' => 6],
            ['year' => 2026, 'month' => 7],
            ['year' => 2026, 'month' => 8],
        ], $months);
    }

    public function testMonthsLeftFrom(): void
    {
        $this->assertSame(3, GoalPlanService::monthsLeftFrom('2026-01-01', '2026-03-31', 2026, 1));
        $this->assertSame(1, GoalPlanService::monthsLeftFrom('2026-01-01', '2026-03-31', 2026, 3));
        $this->assertSame(0, GoalPlanService::monthsLeftFrom('2026-01-01', '2026-03-31', 2027, 1));
    }

    public function testParseDatesHappyPath(): void
    {
        $dates = GoalPlanService::parseDates([
            'startDate' => '2026-01-01',
            'endDate' => '2026-12-31',
        ]);
        $this->assertSame('2026-01-01', $dates['start']);
        $this->assertSame('2026-12-31', $dates['end']);
    }

    public function testParseDatesUsesDeadlineAlias(): void
    {
        $dates = GoalPlanService::parseDates([
            'startDate' => '2026-02-01',
            'deadlineDate' => '2026-06-30',
        ]);
        $this->assertSame('2026-06-30', $dates['end']);
    }

    public function testConfirmedContributions(): void
    {
        $stmt = $this->createMock(PDOStatement::class);
        $stmt->method('execute')->with([1, 9]);
        $stmt->method('fetchColumn')->willReturn('250.5');

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturn($stmt);

        $this->assertSame(250.5, GoalPlanService::confirmedContributions($pdo, 1, 9));
    }

    public function testProjectedForMonth(): void
    {
        $stmt = $this->createMock(PDOStatement::class);
        $stmt->method('execute')->with([1, 9, 2026, 7]);
        $stmt->method('fetchColumn')->willReturn('100');

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturn($stmt);

        $this->assertSame(100.0, GoalPlanService::projectedForMonth($pdo, 1, 9, 2026, 7));
    }

    public function testCurrentAmountWithoutAccountUsesContributions(): void
    {
        $stmt = $this->createMock(PDOStatement::class);
        $stmt->method('execute');
        $stmt->method('fetchColumn')->willReturn('80');

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturn($stmt);

        $amount = GoalPlanService::currentAmountForGoal($pdo, 1, ['id' => 5]);
        $this->assertSame(80.0, $amount);
    }

    public function testCurrentAmountZeroWithoutId(): void
    {
        $pdo = $this->createMock(PDO::class);
        $this->assertSame(0.0, GoalPlanService::currentAmountForGoal($pdo, 1, []));
    }

    public function testRemainingGap(): void
    {
        $stmt = $this->createMock(PDOStatement::class);
        $stmt->method('execute');
        $stmt->method('fetchColumn')->willReturn('200');

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturn($stmt);

        $gap = GoalPlanService::remainingGap($pdo, 1, [
            'id' => 3,
            'target_amount_brl' => 1000,
        ]);
        $this->assertSame(800.0, $gap);
    }

    public function testUniformMonthlyInstallment(): void
    {
        $stmt = $this->createMock(PDOStatement::class);
        $stmt->method('execute');
        $stmt->method('fetchColumn')->willReturn('0');

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturn($stmt);

        $goal = [
            'id' => 1,
            'target_amount_brl' => 1200,
            'start_date' => '2026-01-01',
            'end_date' => '2026-12-31',
        ];
        $installmentJan = GoalPlanService::uniformMonthlyInstallment($pdo, 1, $goal, 2026, 1);
        $installmentAug = GoalPlanService::uniformMonthlyInstallment($pdo, 1, $goal, 2026, 8);
        $this->assertGreaterThan(0, $installmentJan);
        $this->assertGreaterThanOrEqual($installmentJan, $installmentAug);
        $this->assertGreaterThan(0, GoalPlanService::suggestedAmountForEntry($pdo, 1, $goal, 2026, 6));
    }

    public function testUniformMonthlyInstallmentZeroWhenDone(): void
    {
        $stmt = $this->createMock(PDOStatement::class);
        $stmt->method('execute');
        $stmt->method('fetchColumn')->willReturn('1200');

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturn($stmt);

        $this->assertSame(0.0, GoalPlanService::uniformMonthlyInstallment($pdo, 1, [
            'id' => 1,
            'target_amount_brl' => 1200,
            'start_date' => '2026-01-01',
            'end_date' => '2026-12-31',
        ], 2026, 1));
    }

    public function testRefreshGoalsForAccountZeroId(): void
    {
        $pdo = $this->createMock(PDO::class);
        $pdo->expects($this->never())->method('prepare');
        GoalPlanService::refreshGoalsForAccount($pdo, 1, 0);
    }

    public function testRemoveFuturePending(): void
    {
        $stmt = $this->createMock(PDOStatement::class);
        $stmt->expects($this->once())->method('execute')->with([1, 5]);

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturn($stmt);

        GoalPlanService::removeFuturePending($pdo, 1, 5);
    }

    public function testRecalculatePendingAmountsNoGoal(): void
    {
        $stmt = $this->createMock(PDOStatement::class);
        $stmt->method('execute');
        $stmt->method('fetch')->willReturn(false);

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturn($stmt);

        GoalPlanService::recalculatePendingAmounts($pdo, 1, 99);
        $this->assertTrue(true);
    }

    public function testPlannedAmountAtDateAfterEnd(): void
    {
        $pdo = $this->createMock(PDO::class);
        $amount = GoalPlanService::plannedAmountAtDate($pdo, 1, [
            'target_amount_brl' => 5000,
            'start_date' => '2026-01-01',
            'end_date' => '2026-06-30',
        ], '2026-07-01');
        $this->assertSame(5000.0, $amount);
    }
}
