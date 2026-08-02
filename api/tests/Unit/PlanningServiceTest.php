<?php

declare(strict_types=1);

namespace Gastos\Api\Tests\Unit;

use Gastos\Api\Services\PlanningService;
use PDO;
use PDOStatement;
use PHPUnit\Framework\TestCase;

final class PlanningServiceTest extends TestCase
{
    public function testUsageStartFromTimestamp(): void
    {
        $start = PlanningService::usageStartFromTimestamp('2026-06-15 10:00:00');
        $this->assertSame(2026, $start['year']);
        $this->assertSame(6, $start['month']);
        $this->assertSame('2026-06-15', $start['date']);
    }

    public function testUsageStartFromTimestampInvalid(): void
    {
        $start = PlanningService::usageStartFromTimestamp(null);
        $this->assertSame((int) date('Y'), $start['year']);
        $this->assertSame((int) date('n'), $start['month']);
    }

    public function testIsBeforeUsageStart(): void
    {
        $this->assertTrue(PlanningService::isBeforeUsageStart(2025, 12, 2026, 6));
        $this->assertFalse(PlanningService::isBeforeUsageStart(2027, 1, 2026, 6));
        $this->assertTrue(PlanningService::isBeforeUsageStart(2026, 5, 2026, 6));
        $this->assertFalse(PlanningService::isBeforeUsageStart(2026, 6, 2026, 6));
    }

    public function testAccountUsageStartFallsBack(): void
    {
        $planning = ['year' => 2026, 'month' => 6, 'date' => '2026-06-01'];
        $this->assertSame($planning, PlanningService::accountUsageStart([], $planning));
        $fromAccount = PlanningService::accountUsageStart(['created_at' => '2026-08-01'], $planning);
        $this->assertSame(8, $fromAccount['month']);
    }

    public function testAssertMemberOk(): void
    {
        $stmt = $this->createMock(PDOStatement::class);
        $stmt->method('execute');
        $stmt->method('fetch')->willReturn([1]);

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturn($stmt);

        PlanningService::assertMember($pdo, 1, 2);
        $this->assertTrue(true);
    }

    public function testAssertOwnerOk(): void
    {
        $stmt = $this->createMock(PDOStatement::class);
        $stmt->method('execute');
        $stmt->method('fetchColumn')->willReturn('owner');

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturn($stmt);

        PlanningService::assertOwner($pdo, 1, 2);
        $this->assertTrue(true);
    }

    public function testOwnerUserId(): void
    {
        $stmt = $this->createMock(PDOStatement::class);
        $stmt->method('execute');
        $stmt->method('fetchColumn')->willReturn('7');

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturn($stmt);

        $this->assertSame(7, PlanningService::ownerUserId($pdo, 1));
    }

    public function testOwnerUserIdDefault(): void
    {
        $stmt = $this->createMock(PDOStatement::class);
        $stmt->method('execute');
        $stmt->method('fetchColumn')->willReturn(false);

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturn($stmt);

        $this->assertSame(1, PlanningService::ownerUserId($pdo, 1));
    }

    public function testUsageStart(): void
    {
        $stmt = $this->createMock(PDOStatement::class);
        $stmt->method('execute');
        $stmt->method('fetchColumn')->willReturn('2026-06-01 00:00:00');

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturn($stmt);

        $start = PlanningService::usageStart($pdo, 3);
        $this->assertSame(2026, $start['year']);
        $this->assertSame(6, $start['month']);
    }

    public function testDefaultPlanningForUser(): void
    {
        $stmt = $this->createMock(PDOStatement::class);
        $stmt->method('execute');
        $stmt->method('fetchColumn')->willReturn('11');

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturn($stmt);

        $this->assertSame(11, PlanningService::defaultPlanningForUser($pdo, 5));
    }

    public function testListForUser(): void
    {
        $stmt = $this->createMock(PDOStatement::class);
        $stmt->method('execute');
        $stmt->method('fetch')->willReturnOnConsecutiveCalls(
            [
                'id' => 1,
                'name' => 'Casa',
                'role' => 'owner',
                'member_count' => 2,
                'created_at' => '2026-01-01',
            ],
            false
        );

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturn($stmt);

        $items = PlanningService::listForUser($pdo, 1);
        $this->assertCount(1, $items);
        $this->assertSame('Casa', $items[0]['name']);
        $this->assertSame(2, $items[0]['memberCount']);
    }

    public function testFindForUser(): void
    {
        $row = [
            'id' => 2,
            'name' => 'Viagem',
            'role' => 'member',
            'member_count' => 1,
            'created_at' => '2026-01-01',
        ];

        $stmtHit = $this->createMock(PDOStatement::class);
        $stmtHit->method('execute');
        $stmtHit->method('fetch')->willReturnOnConsecutiveCalls($row, false);

        $stmtMiss = $this->createMock(PDOStatement::class);
        $stmtMiss->method('execute');
        $stmtMiss->method('fetch')->willReturn(false);

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturnOnConsecutiveCalls($stmtHit, $stmtMiss);

        $found = PlanningService::findForUser($pdo, 1, 2);
        $this->assertNotNull($found);
        $this->assertSame(2, $found['id']);
        $this->assertNull(PlanningService::findForUser($pdo, 1, 99));
    }

    public function testCreate(): void
    {
        $insertPlanning = $this->createMock(PDOStatement::class);
        $insertPlanning->expects($this->once())->method('execute')->with(['Casa', 5]);

        $insertMember = $this->createMock(PDOStatement::class);
        $insertMember->expects($this->once())->method('execute')->with([42, 5, 'owner']);

        $insertSettings = $this->createMock(PDOStatement::class);
        $insertSettings->expects($this->once())->method('execute')->with([42]);

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturnOnConsecutiveCalls(
            $insertPlanning,
            $insertMember,
            $insertSettings
        );
        $pdo->method('lastInsertId')->willReturn('42');

        $this->assertSame(42, PlanningService::create($pdo, 5, 'Casa'));
    }

    public function testCreateDefaultName(): void
    {
        $stmt = $this->createMock(PDOStatement::class);
        $stmt->method('execute');

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturn($stmt);
        $pdo->method('lastInsertId')->willReturn('1');

        $this->assertSame(1, PlanningService::create($pdo, 1, '   '));
    }

    public function testUpdateHappyPath(): void
    {
        $assert = $this->createMock(PDOStatement::class);
        $assert->method('execute');
        $assert->method('fetchColumn')->willReturn('owner');

        $update = $this->createMock(PDOStatement::class);
        $update->method('execute')->with(['Novo', 3]);
        $update->method('rowCount')->willReturn(1);

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturnOnConsecutiveCalls($assert, $update);

        PlanningService::update($pdo, 3, 1, 'Novo');
        $this->assertTrue(true);
    }

    public function testDestroyHappyPath(): void
    {
        $assert = $this->createMock(PDOStatement::class);
        $assert->method('execute');
        $assert->method('fetchColumn')->willReturn('owner');

        $delete = $this->createMock(PDOStatement::class);
        $delete->method('execute')->with([3]);
        $delete->method('rowCount')->willReturn(1);

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturnOnConsecutiveCalls($assert, $delete);

        PlanningService::destroy($pdo, 3, 1);
        $this->assertTrue(true);
    }
}
