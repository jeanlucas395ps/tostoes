<?php

declare(strict_types=1);

namespace Gastos\Api\Tests\Unit;

use Gastos\Api\MoneyHelper;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class MoneyHelperTest extends TestCase
{
    #[DataProvider('toBrlProvider')]
    public function testToBrl(float $amount, string $currency, float $rate, float $expected): void
    {
        $this->assertSame($expected, MoneyHelper::toBrl($amount, $currency, $rate));
    }

    /** @return list<array{0: float, 1: string, 2: float, 3: float}> */
    public static function toBrlProvider(): array
    {
        return [
            [100.0, 'BRL', 6.2, 100.0],
            [10.0, 'EUR', 6.2, 62.0],
            [1.115, 'EUR', 6.0, 6.69],
            [0.0, 'EUR', 6.2, 0.0],
        ];
    }

    public function testEnrichMapUsesAmountOriginal(): void
    {
        $mapped = MoneyHelper::enrichMap(
            ['defaultAmountBrl' => 50],
            ['currency' => 'EUR', 'amount_original' => 12.5]
        );
        $this->assertSame('EUR', $mapped['currency']);
        $this->assertSame(12.5, $mapped['amount']);
    }

    public function testEnrichMapFallsBackToSuggestedAmount(): void
    {
        $mapped = MoneyHelper::enrichMap(
            ['suggestedAmountBrl' => 80],
            ['currency' => 'BRL', 'suggested_amount' => 75.5]
        );
        $this->assertSame(75.5, $mapped['amount']);
    }

    public function testEnrichMapFallsBackToDefaultBrl(): void
    {
        $mapped = MoneyHelper::enrichMap(
            ['defaultAmountBrl' => 40],
            ['currency' => 'BRL']
        );
        $this->assertSame(40.0, $mapped['amount']);
    }
}
