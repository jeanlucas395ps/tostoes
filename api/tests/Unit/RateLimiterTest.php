<?php

declare(strict_types=1);

namespace Gastos\Api\Tests\Unit;

use Gastos\Api\Config;
use Gastos\Api\RateLimiter;
use Gastos\Api\Response;
use Gastos\Api\ResponseExitException;
use PHPUnit\Framework\TestCase;
use ReflectionClass;
use ReflectionMethod;

final class RateLimiterTest extends TestCase
{
    private string $dir;

    protected function setUp(): void
    {
        $this->dir = sys_get_temp_dir() . '/tostoes-rl-' . bin2hex(random_bytes(4));
        mkdir($this->dir, 0775, true);
        RateLimiter::$storageDirOverride = $this->dir;
        RateLimiter::$clientIpOverride = '203.0.113.10';
        Response::$throwInsteadOfExit = true;

        $ref = new ReflectionClass(Config::class);
        $prop = $ref->getProperty('env');
        $env = $prop->getValue() ?? [];
        $env['RATE_LIMIT_ENABLED'] = 'true';
        $env['RATE_LIMIT_API_PER_MINUTE'] = '3';
        $env['RATE_LIMIT_API_PER_HOUR'] = '100';
        $env['RATE_LIMIT_API_PER_DAY'] = '1000';
        $env['RATE_LIMIT_AUTH_PER_MINUTE'] = '2';
        $env['RATE_LIMIT_AUTH_PER_HOUR'] = '50';
        $env['RATE_LIMIT_AUTH_PER_DAY'] = '100';
        $env['RATE_LIMIT_TRUST_PROXY'] = 'false';
        $prop->setValue(null, $env);
    }

    protected function tearDown(): void
    {
        RateLimiter::$storageDirOverride = null;
        RateLimiter::$clientIpOverride = null;
        foreach (glob($this->dir . '/*') ?: [] as $f) {
            @unlink($f);
        }
        @rmdir($this->dir);
    }

    public function testAllowsUnderLimitThenBlocks(): void
    {
        RateLimiter::enforce('api');
        RateLimiter::enforce('api');
        RateLimiter::enforce('api');

        $this->expectException(ResponseExitException::class);
        try {
            RateLimiter::enforce('api');
        } catch (ResponseExitException $e) {
            $this->assertSame(429, $e->status);
            $this->assertIsArray($e->payload);
            $this->assertSame('minute', $e->payload['window'] ?? null);
            throw $e;
        }
    }

    public function testDisabledSkips(): void
    {
        $ref = new ReflectionClass(Config::class);
        $prop = $ref->getProperty('env');
        $env = $prop->getValue() ?? [];
        $env['RATE_LIMIT_ENABLED'] = 'false';
        $prop->setValue(null, $env);

        for ($i = 0; $i < 10; $i++) {
            RateLimiter::enforce('api');
        }
        $this->assertTrue(true);
    }

    public function testAuthBucketSeparateLimits(): void
    {
        RateLimiter::enforce('auth');
        RateLimiter::enforce('auth');
        $this->expectException(ResponseExitException::class);
        RateLimiter::enforce('auth');
    }

    public function testClientIpFromRemoteAddr(): void
    {
        RateLimiter::$clientIpOverride = null;
        $_SERVER['REMOTE_ADDR'] = '198.51.100.7';
        $this->assertSame('198.51.100.7', RateLimiter::clientIp());
    }

    public function testTrustProxyXff(): void
    {
        RateLimiter::$clientIpOverride = null;
        $ref = new ReflectionClass(Config::class);
        $prop = $ref->getProperty('env');
        $env = $prop->getValue() ?? [];
        $env['RATE_LIMIT_TRUST_PROXY'] = 'true';
        $prop->setValue(null, $env);

        $_SERVER['HTTP_X_FORWARDED_FOR'] = '198.51.100.20, 10.0.0.1';
        $this->assertSame('198.51.100.20', RateLimiter::clientIp());
    }

    public function testTrustProxyFallsBackToXRealIp(): void
    {
        RateLimiter::$clientIpOverride = null;
        $ref = new ReflectionClass(Config::class);
        $prop = $ref->getProperty('env');
        $env = $prop->getValue() ?? [];
        $env['RATE_LIMIT_TRUST_PROXY'] = 'true';
        $prop->setValue(null, $env);
        unset($_SERVER['HTTP_X_FORWARDED_FOR']);
        $_SERVER['HTTP_X_REAL_IP'] = '198.51.100.33';
        $this->assertSame('198.51.100.33', RateLimiter::clientIp());
    }

    public function testTrustProxyInvalidXffUsesRemote(): void
    {
        RateLimiter::$clientIpOverride = null;
        $ref = new ReflectionClass(Config::class);
        $prop = $ref->getProperty('env');
        $env = $prop->getValue() ?? [];
        $env['RATE_LIMIT_TRUST_PROXY'] = 'true';
        $prop->setValue(null, $env);
        $_SERVER['HTTP_X_FORWARDED_FOR'] = 'not-an-ip';
        unset($_SERVER['HTTP_X_REAL_IP']);
        $_SERVER['REMOTE_ADDR'] = '198.51.100.9';
        $this->assertSame('198.51.100.9', RateLimiter::clientIp());
    }

    public function testInvalidRemoteAddrFallback(): void
    {
        RateLimiter::$clientIpOverride = null;
        unset($_SERVER['HTTP_X_FORWARDED_FOR'], $_SERVER['HTTP_X_REAL_IP']);
        $_SERVER['REMOTE_ADDR'] = 'not-valid';
        $this->assertSame('0.0.0.0', RateLimiter::clientIp());
    }

    public function testIntConfigInvalidUsesDefault(): void
    {
        $ref = new ReflectionClass(Config::class);
        $prop = $ref->getProperty('env');
        $env = $prop->getValue() ?? [];
        $env['RATE_LIMIT_API_PER_MINUTE'] = '0';
        $prop->setValue(null, $env);
        $limits = RateLimiter::limitsFor('api');
        $this->assertSame(120, $limits['minute']);
    }

    public function testStorageDirFallbackWhenMkdirFails(): void
    {
        $blocker = $this->dir . '/not-a-dir';
        file_put_contents($blocker, 'x');
        RateLimiter::$storageDirOverride = $blocker . '/child';
        $m = new ReflectionMethod(RateLimiter::class, 'storageDir');
        $dir = $m->invoke(null);
        $this->assertStringContainsString('tostoes-rate-limit', $dir);
    }

    public function testStorageDirDefaultAndReadCorruptState(): void
    {
        RateLimiter::$storageDirOverride = null;
        $m = new ReflectionMethod(RateLimiter::class, 'storageDir');
        $dir = $m->invoke(null);
        $this->assertNotSame('', $dir);

        $path = $this->dir . '/corrupt.json';
        file_put_contents($path, '{not-json');
        $read = new ReflectionMethod(RateLimiter::class, 'readState');
        $this->assertSame([], $read->invoke(null, $path));
        file_put_contents($path, '');
        $this->assertSame([], $read->invoke(null, $path));
    }

    public function testWriteStateCreatesMissingDir(): void
    {
        $nested = $this->dir . '/nested/deep';
        $path = $nested . '/state.json';
        $write = new ReflectionMethod(RateLimiter::class, 'writeState');
        $write->invoke(null, $path, ['ok' => true]);
        $this->assertFileExists($path);
    }

    public function testLimitsForDefaults(): void
    {
        $api = RateLimiter::limitsFor('api');
        $this->assertSame(3, $api['minute']);
        $auth = RateLimiter::limitsFor('auth');
        $this->assertSame(2, $auth['minute']);
    }
}
