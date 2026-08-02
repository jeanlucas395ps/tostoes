<?php

declare(strict_types=1);

namespace Gastos\Api\Tests\Unit;

use Gastos\Api\ResponsibleUser;
use PDO;
use PDOStatement;
use PHPUnit\Framework\TestCase;

final class ResponsibleUserTest extends TestCase
{
    public function testSelectColumnsAndJoin(): void
    {
        $this->assertStringContainsString('resp.id AS resp_id', ResponsibleUser::selectColumns());
        $this->assertStringContainsString(
            'LEFT JOIN users resp ON resp.id = t.responsible_user_id',
            ResponsibleUser::joinClause('t')
        );
    }

    public function testParseFromBodyJointByNullId(): void
    {
        $pdo = $this->createMock(PDO::class);
        $result = ResponsibleUser::parseFromBody($pdo, ['responsibleUserId' => null], 1);
        $this->assertNull($result['responsibleUserId']);
        $this->assertSame('Conjunto', $result['responsible']);
    }

    public function testParseFromBodyJointByText(): void
    {
        $pdo = $this->createMock(PDO::class);
        $result = ResponsibleUser::parseFromBody($pdo, ['responsible' => 'conjunto'], 1);
        $this->assertNull($result['responsibleUserId']);
        $this->assertSame('Conjunto', $result['responsible']);
    }

    public function testParseFromBodyResolvesMemberByName(): void
    {
        $stmt = $this->createMock(PDOStatement::class);
        $stmt->method('execute');
        $stmt->method('fetch')->willReturn(['id' => 5, 'name' => 'Ana']);

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturn($stmt);

        $result = ResponsibleUser::parseFromBody($pdo, ['responsible' => 'Ana'], 1);
        $this->assertSame(5, $result['responsibleUserId']);
        $this->assertSame('Ana', $result['responsible']);
    }

    public function testParseFromBodyKeepsUnknownText(): void
    {
        $stmt = $this->createMock(PDOStatement::class);
        $stmt->method('execute');
        $stmt->method('fetch')->willReturn(false);

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturn($stmt);

        $result = ResponsibleUser::parseFromBody($pdo, ['responsible' => 'Desconhecido'], 1);
        $this->assertNull($result['responsibleUserId']);
        $this->assertSame('Desconhecido', $result['responsible']);
    }

    public function testMapFromRowNullWhenNoResp(): void
    {
        $this->assertNull(ResponsibleUser::mapFromRow([]));
    }

    public function testMapFromRowMapsUser(): void
    {
        $mapped = ResponsibleUser::mapFromRow([
            'resp_id' => 3,
            'resp_username' => 'ana',
            'resp_name' => 'Ana',
            'resp_gender' => 'female',
            'resp_avatar_path' => null,
        ]);
        $this->assertSame(3, $mapped['id']);
        $this->assertSame('Ana', $mapped['name']);
        $this->assertSame('female', $mapped['gender']);
    }

    public function testEnrichMapSetsJointLabel(): void
    {
        $mapped = ResponsibleUser::enrichMap([], [
            'responsible_user_id' => null,
        ]);
        $this->assertNull($mapped['responsibleUserId']);
        $this->assertNull($mapped['responsibleUser']);
        $this->assertSame('Conjunto', $mapped['responsible']);
    }

    public function testNameForId(): void
    {
        $stmt = $this->createMock(PDOStatement::class);
        $stmt->method('execute')->with([8]);
        $stmt->method('fetchColumn')->willReturn('Jean');

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturn($stmt);

        $this->assertSame('Jean', ResponsibleUser::nameForId($pdo, 8));
    }

    public function testNameForIdEmptyWhenMissing(): void
    {
        $stmt = $this->createMock(PDOStatement::class);
        $stmt->method('execute');
        $stmt->method('fetchColumn')->willReturn(false);

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturn($stmt);

        $this->assertSame('', ResponsibleUser::nameForId($pdo, 99));
    }
}
