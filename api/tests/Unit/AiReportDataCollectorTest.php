<?php

declare(strict_types=1);

namespace Gastos\Api\Tests\Unit;

use Gastos\Api\Services\AiReportDataCollector;
use InvalidArgumentException;
use PHPUnit\Framework\TestCase;

final class AiReportDataCollectorTest extends TestCase
{
    public function testParseSingleMonth(): void
    {
        $period = AiReportDataCollector::parsePeriod('2026-03', '2026-03');
        $this->assertSame('2026-03', $period['periodStart']);
        $this->assertSame('2026-03', $period['periodEnd']);
        $this->assertCount(1, $period['months']);
        $this->assertSame(['year' => 2026, 'month' => 3], $period['months'][0]);
    }

    public function testParseThreeMonthsCrossingYear(): void
    {
        $period = AiReportDataCollector::parsePeriod('2025-11', '2026-01');
        $this->assertCount(3, $period['months']);
        $this->assertSame(11, $period['months'][0]['month']);
        $this->assertSame(12, $period['months'][1]['month']);
        $this->assertSame(1, $period['months'][2]['month']);
        $this->assertSame(2026, $period['months'][2]['year']);
    }

    public function testRejectsMoreThanThreeMonths(): void
    {
        $this->expectException(InvalidArgumentException::class);
        AiReportDataCollector::parsePeriod('2026-01', '2026-04');
    }

    public function testRejectsInvertedPeriod(): void
    {
        $this->expectException(InvalidArgumentException::class);
        AiReportDataCollector::parsePeriod('2026-05', '2026-03');
    }
}
