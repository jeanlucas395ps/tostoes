<?php

declare(strict_types=1);

namespace Gastos\Api\Tests\Unit;

use Gastos\Api\Cors;
use PHPUnit\Framework\TestCase;
use ReflectionMethod;

final class CorsTest extends TestCase
{
    private function callPrivate(string $method, array $args): mixed
    {
        $m = new ReflectionMethod(Cors::class, $method);
        return $m->invoke(null, ...$args);
    }

    public function testExactOriginAllowed(): void
    {
        $this->assertTrue($this->callPrivate('originAllowed', [
            'http://localhost:4200',
            ['http://localhost:4200'],
        ]));
    }

    public function testOriginRejectedWhenNotListed(): void
    {
        $this->assertFalse($this->callPrivate('originAllowed', [
            'https://evil.com',
            ['http://localhost:4200'],
        ]));
    }

    public function testWildcardOriginAllowed(): void
    {
        $this->assertTrue($this->callPrivate('wildcardMatch', [
            'https://*.example.com',
            'https://app.example.com',
        ]));
        $this->assertFalse($this->callPrivate('wildcardMatch', [
            'https://*.example.com',
            'https://evil.com',
        ]));
    }

    public function testOriginAllowedViaWildcardList(): void
    {
        $this->assertTrue($this->callPrivate('originAllowed', [
            'https://app.tostoes.com',
            ['https://*.tostoes.com'],
        ]));
    }

    public function testApplySingleConfiguredOriginFallback(): void
    {
        $ref = new \ReflectionClass(\Gastos\Api\Config::class);
        $prop = $ref->getProperty('env');
        $env = $prop->getValue() ?? [];
        $prev = $_SERVER['HTTP_ORIGIN'] ?? null;
        try {
            $env['CORS_ORIGIN'] = 'https://only.example.com';
            $prop->setValue(null, $env);
            unset($_SERVER['HTTP_ORIGIN']);
            Cors::apply();

            $_SERVER['HTTP_ORIGIN'] = 'https://localhost';
            Cors::apply();
            $this->assertTrue(true);
        } finally {
            if ($prev === null) {
                unset($_SERVER['HTTP_ORIGIN']);
            } else {
                $_SERVER['HTTP_ORIGIN'] = $prev;
            }
        }
    }
}
