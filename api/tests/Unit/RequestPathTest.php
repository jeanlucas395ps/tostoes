<?php

declare(strict_types=1);

namespace Gastos\Api\Tests\Unit;

use Gastos\Api\RequestPath;
use Gastos\Api\Config;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use ReflectionClass;

final class RequestPathTest extends TestCase
{
    protected function setUp(): void
    {
        // Garante APP_BASE_PATH vazio nos testes unitários.
        $ref = new ReflectionClass(Config::class);
        $prop = $ref->getProperty('env');
        $env = $prop->getValue();
        $env['APP_BASE_PATH'] = '';
        $prop->setValue(null, $env);
    }

    #[DataProvider('uriProvider')]
    public function testFromUri(string $uri, string $expected): void
    {
        $this->assertSame($expected, RequestPath::fromUri($uri));
    }

    /** @return list<array{0: string, 1: string}> */
    public static function uriProvider(): array
    {
        return [
            ['/api/accounts', '/accounts'],
            ['/api/accounts/summary?x=1', '/accounts/summary'],
            ['/~user/api/auth/login', '/auth/login'],
            ['/api', '/'],
            ['/api/', '/'],
            ['/health', '/health'],
        ];
    }
}
