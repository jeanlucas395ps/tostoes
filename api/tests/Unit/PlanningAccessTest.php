<?php

declare(strict_types=1);

namespace Gastos\Api\Tests\Unit;

use Gastos\Api\Services\PlanningAccess;
use PDO;
use PDOStatement;
use PHPUnit\Framework\TestCase;

final class PlanningAccessTest extends TestCase
{
    public function testAssertRowInPlanningOk(): void
    {
        $stmt = $this->createMock(PDOStatement::class);
        $stmt->method('execute');
        $stmt->method('fetch')->willReturn([1]);

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturn($stmt);

        PlanningAccess::assertRowInPlanning($pdo, 'transactions', 5, 1);
        $this->assertTrue(true);
    }

    public function testAssertUsersSharePlanningSameUser(): void
    {
        $pdo = $this->createMock(PDO::class);
        $pdo->expects($this->never())->method('prepare');
        PlanningAccess::assertUsersSharePlanning($pdo, 3, 3);
    }

    public function testAssertUsersSharePlanningOk(): void
    {
        $stmt = $this->createMock(PDOStatement::class);
        $stmt->method('execute');
        $stmt->method('fetch')->willReturn([1]);

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturn($stmt);

        PlanningAccess::assertUsersSharePlanning($pdo, 1, 2);
        $this->assertTrue(true);
    }
}
