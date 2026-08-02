<?php

declare(strict_types=1);

namespace Gastos\Api\Tests\Unit;

use Gastos\Api\Services\FxRateService;
use PDO;
use PDOStatement;
use PHPUnit\Framework\Attributes\RunInSeparateProcess;
use PHPUnit\Framework\TestCase;

final class FxRateServiceTest extends TestCase
{
    public function testNormalizeDateValid(): void
    {
        $this->assertSame('2026-07-15', FxRateService::normalizeDate('2026-07-15'));
    }

    public function testNormalizeDateInvalidFallsBackToToday(): void
    {
        $this->assertSame(date('Y-m-d'), FxRateService::normalizeDate(null));
        $this->assertSame(date('Y-m-d'), FxRateService::normalizeDate('15/07/2026'));
    }

    public function testResolveToBrlForBrlCurrency(): void
    {
        $pdo = $this->createMock(PDO::class);
        $result = FxRateService::resolveToBrl($pdo, 1, 'BRL', '2026-01-01');
        $this->assertSame(1.0, $result['rate']);
        $this->assertSame('fallback', $result['source']);
        $this->assertSame('2026-01-01', $result['date']);
    }

    #[RunInSeparateProcess]
    public function testResolveEurToBrlUsesCache(): void
    {
        $infoStmt = $this->createMock(PDOStatement::class);
        $infoStmt->method('fetchColumn')->willReturn(1);

        $cacheStmt = $this->createMock(PDOStatement::class);
        $cacheStmt->method('execute');
        $cacheStmt->method('fetch')->willReturn([
            'rate' => '6.25',
            'source' => 'api',
        ]);

        $pdo = $this->createMock(PDO::class);
        $pdo->method('query')->willReturn($infoStmt);
        $pdo->method('prepare')->willReturn($cacheStmt);

        $result = FxRateService::resolveEurToBrl($pdo, 1, '2026-06-01');
        $this->assertSame(6.25, $result['rate']);
        $this->assertSame('api', $result['source']);
        $this->assertSame('2026-06-01', $result['date']);
    }
}
