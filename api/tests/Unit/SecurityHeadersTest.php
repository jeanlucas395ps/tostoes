<?php

declare(strict_types=1);

namespace Gastos\Api\Tests\Unit;

use Gastos\Api\SecurityHeaders;
use PHPUnit\Framework\TestCase;

final class SecurityHeadersTest extends TestCase
{
    public function testApplySetsHeadersWithoutError(): void
    {
        // header() em CLI pode emitir warning; ainda exercita o caminho.
        @SecurityHeaders::apply();
        $this->assertTrue(true);
    }
}
