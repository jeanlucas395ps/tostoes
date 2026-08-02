<?php

declare(strict_types=1);

namespace Gastos\Api\Tests\Unit;

use Gastos\Api\MoneyHelper;
use PDO;
use PDOStatement;
use PHPUnit\Framework\TestCase;

final class MoneyHelperExtendedTest extends TestCase
{
    public function testIsForeign(): void
    {
        $this->assertTrue(MoneyHelper::isForeign('EUR'));
        $this->assertTrue(MoneyHelper::isForeign('USD'));
        $this->assertFalse(MoneyHelper::isForeign('BRL'));
    }

    public function testToBrlUsd(): void
    {
        $this->assertSame(50.0, MoneyHelper::toBrl(10.0, 'USD', 5.0));
    }

    public function testGetEurToBrlFallbackFromDb(): void
    {
        $stmt = $this->createMock(PDOStatement::class);
        $stmt->method('execute')->with([1]);
        $stmt->method('fetchColumn')->willReturn('6.5');

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturn($stmt);

        $this->assertSame(6.5, MoneyHelper::getEurToBrlFallback($pdo, 1));
        $this->assertSame(6.5, MoneyHelper::getEurToBrl($pdo, 1));
    }

    public function testGetEurToBrlFallbackDefault(): void
    {
        $stmt = $this->createMock(PDOStatement::class);
        $stmt->method('execute');
        $stmt->method('fetchColumn')->willReturn(false);

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturn($stmt);

        $this->assertSame(6.0, MoneyHelper::getEurToBrlFallback($pdo, 9));
    }

    public function testGetFxFallback(): void
    {
        $stmt = $this->createMock(PDOStatement::class);
        $stmt->method('execute');
        $stmt->method('fetchColumn')->willReturn('7.1');

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturn($stmt);

        $this->assertSame(7.1, MoneyHelper::getFxFallback($pdo, 1, 'EUR'));
        $this->assertSame(1.0, MoneyHelper::getFxFallback($pdo, 1, 'BRL'));
    }

    private function pdoWithEurFallback(string|false $rate = '6.0'): PDO
    {
        $stmt = $this->createMock(PDOStatement::class);
        $stmt->method('execute');
        $stmt->method('fetchColumn')->willReturn($rate);

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturn($stmt);

        return $pdo;
    }

    public function testParseInputBrlFromAmount(): void
    {
        $pdo = $this->pdoWithEurFallback();
        $result = MoneyHelper::parseInput($pdo, 1, ['currency' => 'BRL', 'amount' => 12.345]);
        $this->assertSame('BRL', $result['currency']);
        $this->assertSame(12.35, $result['amount']);
        $this->assertSame(12.35, $result['amountBrl']);
        $this->assertNull($result['fxDate']);
    }

    public function testParseInputInvalidCurrencyDefaultsToBrl(): void
    {
        $pdo = $this->pdoWithEurFallback();
        $result = MoneyHelper::parseInput($pdo, 1, ['currency' => 'XYZ', 'amountBrl' => 10]);
        $this->assertSame('BRL', $result['currency']);
        $this->assertSame(10.0, $result['amount']);
    }

    public function testParseInputUsesSuggestedAmount(): void
    {
        $pdo = $this->pdoWithEurFallback();
        $result = MoneyHelper::parseInput($pdo, 1, ['suggestedAmount' => 33]);
        $this->assertSame(33.0, $result['amount']);
    }

    public function testEnrichMapUsesSuggestedAmountBrl(): void
    {
        $mapped = MoneyHelper::enrichMap(
            ['suggestedAmountBrl' => 55],
            ['currency' => 'BRL']
        );
        $this->assertSame(55.0, $mapped['amount']);
    }
}
