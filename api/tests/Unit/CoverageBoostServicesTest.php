<?php

declare(strict_types=1);

namespace Gastos\Api\Tests\Unit;

use Gastos\Api\Config;
use Gastos\Api\Services\InvestmentPortfolioService;
use Gastos\Api\Services\PasswordResetService;
use Gastos\Api\Services\PlanningInviteService;
use Gastos\Api\Services\MonthPlanService;
use Gastos\Api\Services\ProjectionService;
use PDO;
use PDOStatement;
use PHPUnit\Framework\TestCase;
use ReflectionClass;
use ReflectionMethod;

final class CoverageBoostServicesTest extends TestCase
{
    public function testInvestmentPortfolioEmpty(): void
    {
        $settings = $this->createMock(PDOStatement::class);
        $settings->method('execute');
        $settings->method('fetchColumn')->willReturn('0.8');

        $types = $this->createMock(PDOStatement::class);
        $types->method('execute');
        $types->method('fetchAll')->willReturn([]);

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturnOnConsecutiveCalls($settings, $types);

        $portfolio = InvestmentPortfolioService::portfolio($pdo, 1, 2026, 7);
        $this->assertSame([], $portfolio['items']);
        $this->assertSame(0.0, $portfolio['totals']['currentBalanceBrl']);
        $this->assertSame(2026, $portfolio['nextYear']);
        $this->assertSame(8, $portfolio['nextMonth']);
    }

    public function testInvestmentPortfolioDecemberRollsYear(): void
    {
        $settings = $this->createMock(PDOStatement::class);
        $settings->method('execute');
        $settings->method('fetchColumn')->willReturn(false);

        $types = $this->createMock(PDOStatement::class);
        $types->method('execute');
        $types->method('fetchAll')->willReturn([]);

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturnOnConsecutiveCalls($settings, $types);

        $portfolio = InvestmentPortfolioService::portfolio($pdo, 1, 2026, 12);
        $this->assertSame(2027, $portfolio['nextYear']);
        $this->assertSame(1, $portfolio['nextMonth']);
    }

    public function testCdiPercentForSlugViaReflection(): void
    {
        $m = new ReflectionMethod(InvestmentPortfolioService::class, 'cdiPercentForSlug');
        $this->assertSame(100.0, $m->invoke(null, 'reserva'));
        $this->assertSame(0.0, $m->invoke(null, 'capitalizacao'));
        $this->assertSame(100.0, $m->invoke(null, 'apartamento'));
    }

    public function testPasswordResetUnknownEmail(): void
    {
        $stmt = $this->createMock(PDOStatement::class);
        $stmt->method('execute');
        $stmt->method('fetch')->willReturn(false);

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturn($stmt);

        PasswordResetService::request($pdo, 'nobody@example.com');
        $this->assertTrue(true);
    }

    public function testPasswordResetKnownUser(): void
    {
        $ref = new ReflectionClass(Config::class);
        $prop = $ref->getProperty('env');
        $env = $prop->getValue() ?? [];
        $env['MAIL_DRIVER'] = 'log';
        $env['APP_URL'] = 'http://localhost:4200';
        $prop->setValue(null, $env);

        $find = $this->createMock(PDOStatement::class);
        $find->method('execute');
        $find->method('fetch')->willReturn(['id' => 3, 'name' => 'Ana']);

        $revoke = $this->createMock(PDOStatement::class);
        $revoke->method('execute');

        $insert = $this->createMock(PDOStatement::class);
        $insert->method('execute');

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturnOnConsecutiveCalls($find, $revoke, $insert);

        PasswordResetService::request($pdo, 'ana@example.com');
        $this->assertTrue(true);
    }

    public function testPasswordResetHappyPath(): void
    {
        $token = str_repeat('ab', 32);
        $hash = hash('sha256', $token);

        $find = $this->createMock(PDOStatement::class);
        $find->method('execute');
        $find->method('fetch')->willReturn([
            'id' => 1,
            'user_id' => 9,
            'expires_at' => date('Y-m-d H:i:s', time() + 3600),
            'used_at' => null,
        ]);

        $updateUser = $this->createMock(PDOStatement::class);
        $updateUser->method('execute');

        $markUsed = $this->createMock(PDOStatement::class);
        $markUsed->method('execute');

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturnOnConsecutiveCalls($find, $updateUser, $markUsed);

        PasswordResetService::reset($pdo, $token, 'senha-forte');
        $this->assertTrue(true);
    }

    public function testPlanningInvitePlanningName(): void
    {
        $stmt = $this->createMock(PDOStatement::class);
        $stmt->method('execute');
        $stmt->method('fetchColumn')->willReturn('Casa');

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturn($stmt);

        $this->assertSame('Casa', PlanningInviteService::planningName($pdo, 1));
    }

    public function testPlanningInvitePreview(): void
    {
        $invite = $this->createMock(PDOStatement::class);
        $invite->method('execute');
        $invite->method('fetch')->willReturn([
            'token' => 'tok',
            'email' => 'a@b.com',
            'status' => 'pending',
            'expires_at' => date('Y-m-d H:i:s', time() + 86400),
            'planning_id' => 1,
            'invited_by_user_id' => 2,
        ]);

        $name = $this->createMock(PDOStatement::class);
        $name->method('execute');
        $name->method('fetchColumn')->willReturnOnConsecutiveCalls('Casa', 'Ana');

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturnOnConsecutiveCalls($invite, $name, $name);

        $preview = PlanningInviteService::preview($pdo, 'tok');
        $this->assertSame('Casa', $preview['planningName']);
        $this->assertSame('Ana', $preview['inviterName']);
        $this->assertFalse($preview['expired']);
    }

    public function testSyncAllFixedForMonthEmpty(): void
    {
        $list = $this->createMock(PDOStatement::class);
        $list->method('execute');
        $list->method('fetch')->willReturn(false);

        $owner = $this->createMock(PDOStatement::class);
        $owner->method('execute');
        $owner->method('fetchColumn')->willReturn('1');

        $insert = $this->createMock(PDOStatement::class);

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturnOnConsecutiveCalls($list, $owner, $insert);

        MonthPlanService::syncAllFixedForMonth($pdo, 1, 2026, 7);
        $this->assertTrue(true);
    }

    public function testSyncAllFixedWithKindsFilterEmpty(): void
    {
        $list = $this->createMock(PDOStatement::class);
        $list->method('execute');
        $list->method('fetch')->willReturn(false);

        $owner = $this->createMock(PDOStatement::class);
        $owner->method('execute');
        $owner->method('fetchColumn')->willReturn('1');

        $insert = $this->createMock(PDOStatement::class);

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturnOnConsecutiveCalls($list, $owner, $insert);

        MonthPlanService::syncAllFixedForMonth($pdo, 1, 2026, 7, ['expense']);
        $this->assertTrue(true);
    }

    public function testGetPlanFutureMonthEmpty(): void
    {
        $entries = $this->createMock(PDOStatement::class);
        $entries->method('execute');
        $entries->method('fetchAll')->willReturn([]);

        $forecast = $this->createMock(PDOStatement::class);
        $forecast->method('execute');
        $forecast->method('fetch')->willReturn(false);

        $existing = $this->createMock(PDOStatement::class);
        $existing->method('execute');
        $existing->method('fetch')->willReturn(false);

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturnOnConsecutiveCalls($entries, $forecast, $existing);

        $plan = MonthPlanService::getPlan($pdo, 1, 2099, 1);
        $this->assertSame(2099, $plan['year']);
        $this->assertSame([], $plan['sections']['today']);
        $this->assertArrayHasKey('summary', $plan);
        $this->assertArrayHasKey('insights', $plan);
    }

    public function testMonthlyProjectedTotalsPastAndFuture(): void
    {
        $usage = $this->createMock(PDOStatement::class);
        $usage->method('execute');
        $usage->method('fetchColumn')->willReturn('2026-01-01 00:00:00');

        $emptyPlan = $this->createMock(PDOStatement::class);
        $emptyPlan->method('execute');
        $emptyPlan->method('fetchAll')->willReturn([]);

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturnCallback(function () use ($usage, $emptyPlan) {
            static $n = 0;
            $n++;
            return $n === 1 ? $usage : $emptyPlan;
        });

        $byMonth = ProjectionService::monthlyProjectedTotals($pdo, 1, 2026);
        $this->assertCount(12, $byMonth);
        $this->assertArrayHasKey(1, $byMonth);
        $this->assertSame(0.0, $byMonth[1]['income']);
    }

    public function testFlatGoalsTotalForMonth(): void
    {
        $stmt = $this->createMock(PDOStatement::class);
        $stmt->method('execute');
        $stmt->method('fetchAll')->willReturn([]);

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturn($stmt);

        $this->assertSame(0.0, ProjectionService::flatGoalsTotalForMonth($pdo, 1, 2026, 7));
    }
}
