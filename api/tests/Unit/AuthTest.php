<?php

declare(strict_types=1);

namespace Gastos\Api\Tests\Unit;

use Gastos\Api\Auth;
use Gastos\Api\Config;
use PHPUnit\Framework\TestCase;
use ReflectionClass;

final class AuthTest extends TestCase
{
    protected function setUp(): void
    {
        $ref = new ReflectionClass(Config::class);
        $prop = $ref->getProperty('env');
        $env = $prop->getValue() ?? [];
        $env['JWT_SECRET'] = 'test-secret';
        $prop->setValue(null, $env);
        unset($_SERVER['HTTP_AUTHORIZATION'], $_SERVER['REDIRECT_HTTP_AUTHORIZATION']);
        unset($_SERVER['HTTP_X_PLANNING_ID'], $_GET['planningId']);
    }

    public function testCreateAndValidateToken(): void
    {
        $token = Auth::createToken(42);
        $this->assertSame(42, Auth::validateToken($token));
    }

    public function testValidateTokenRejectsTamperedSig(): void
    {
        $token = Auth::createToken(1);
        [$payload] = explode('.', $token, 2);
        $this->assertNull(Auth::validateToken($payload . '.deadbeef'));
    }

    public function testValidateTokenRejectsMalformed(): void
    {
        $this->assertNull(Auth::validateToken('only-one-part'));
        $this->assertNull(Auth::validateToken('!!!'));
    }

    public function testValidateTokenRejectsExpired(): void
    {
        $payload = base64_encode(json_encode(['sub' => 1, 'exp' => time() - 10], JSON_THROW_ON_ERROR));
        $sig = hash_hmac('sha256', $payload, 'test-secret');
        $this->assertNull(Auth::validateToken($payload . '.' . $sig));
    }

    public function testValidateTokenRejectsMissingSub(): void
    {
        $payload = base64_encode(json_encode(['exp' => time() + 100], JSON_THROW_ON_ERROR));
        $sig = hash_hmac('sha256', $payload, 'test-secret');
        $this->assertNull(Auth::validateToken($payload . '.' . $sig));
    }

    public function testBearerUserIdFromHeader(): void
    {
        $_SERVER['HTTP_AUTHORIZATION'] = 'Bearer ' . Auth::createToken(7);
        $this->assertSame(7, Auth::bearerUserId());
    }

    public function testBearerUserIdNullWithoutHeader(): void
    {
        $this->assertNull(Auth::bearerUserId());
    }

    public function testBearerUserIdFromRedirectHeader(): void
    {
        $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] = 'Bearer ' . Auth::createToken(3);
        $this->assertSame(3, Auth::bearerUserId());
    }

    public function testPlanningIdHeader(): void
    {
        $this->assertNull(Auth::planningIdHeader());
        $_SERVER['HTTP_X_PLANNING_ID'] = '15';
        $this->assertSame(15, Auth::planningIdHeader());
        $_SERVER['HTTP_X_PLANNING_ID'] = '0';
        $this->assertNull(Auth::planningIdHeader());
    }

    public function testPlanningIdFromQuery(): void
    {
        $_GET['planningId'] = '22';
        $this->assertSame(22, Auth::planningIdHeader());
    }
}
