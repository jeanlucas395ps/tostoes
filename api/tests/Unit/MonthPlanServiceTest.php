<?php

declare(strict_types=1);

namespace Gastos\Api\Tests\Unit;

use Gastos\Api\Services\MonthPlanService;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class MonthPlanServiceTest extends TestCase
{
    #[DataProvider('installmentWindowProvider')]
    public function testRecurringAppliesToMonth(
        array $row,
        int $year,
        int $month,
        bool $expected
    ): void {
        $this->assertSame(
            $expected,
            MonthPlanService::recurringAppliesToMonth($row, $year, $month)
        );
    }

    /** @return list<array{0: array<string, mixed>, 1: int, 2: int, 3: bool}> */
    public static function installmentWindowProvider(): array
    {
        return [
            'fixed always applies' => [
                ['is_installment' => 0],
                2026,
                7,
                true,
            ],
            'installment without dates' => [
                ['is_installment' => 1],
                2026,
                7,
                false,
            ],
            'inside window' => [
                [
                    'is_installment' => 1,
                    'start_date' => '2026-07-01',
                    'end_date' => '2026-12-01',
                ],
                2026,
                9,
                true,
            ],
            'start inclusive' => [
                [
                    'is_installment' => true,
                    'start_date' => '2026-07-15',
                    'end_date' => '2026-09-01',
                ],
                2026,
                7,
                true,
            ],
            'end inclusive' => [
                [
                    'is_installment' => 1,
                    'start_date' => '2026-07-01',
                    'end_date' => '2026-09-30',
                ],
                2026,
                9,
                true,
            ],
            'before window' => [
                [
                    'is_installment' => 1,
                    'start_date' => '2026-07-01',
                    'end_date' => '2026-12-01',
                ],
                2026,
                6,
                false,
            ],
            'after window' => [
                [
                    'is_installment' => 1,
                    'start_date' => '2026-07-01',
                    'end_date' => '2026-12-01',
                ],
                2027,
                1,
                false,
            ],
            'yyyy-mm dates' => [
                [
                    'is_installment' => 1,
                    'start_date' => '2026-07',
                    'end_date' => '2026-08',
                ],
                2026,
                8,
                true,
            ],
        ];
    }
}
