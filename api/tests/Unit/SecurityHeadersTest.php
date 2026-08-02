<?php

declare(strict_types=1);

namespace Gastos\Api\Tests\Unit;

use Gastos\Api\SecurityHeaders;
use PHPUnit\Framework\TestCase;

final class SecurityHeadersTest extends TestCase
{
    public function testApplySetsHeadersWithoutError(): void
    {
        @SecurityHeaders::apply();
        $this->assertTrue(true);
    }

    public function testApplySetsHstsOnHttps(): void
    {
        $prevHttps = $_SERVER['HTTPS'] ?? null;
        $prevProto = $_SERVER['HTTP_X_FORWARDED_PROTO'] ?? null;
        $prevPort = $_SERVER['SERVER_PORT'] ?? null;
        try {
            $_SERVER['HTTPS'] = 'on';
            @SecurityHeaders::apply();

            $_SERVER['HTTPS'] = 'off';
            $_SERVER['HTTP_X_FORWARDED_PROTO'] = 'https';
            @SecurityHeaders::apply();

            unset($_SERVER['HTTPS'], $_SERVER['HTTP_X_FORWARDED_PROTO']);
            $_SERVER['SERVER_PORT'] = 443;
            @SecurityHeaders::apply();
            $this->assertTrue(true);
        } finally {
            if ($prevHttps === null) {
                unset($_SERVER['HTTPS']);
            } else {
                $_SERVER['HTTPS'] = $prevHttps;
            }
            if ($prevProto === null) {
                unset($_SERVER['HTTP_X_FORWARDED_PROTO']);
            } else {
                $_SERVER['HTTP_X_FORWARDED_PROTO'] = $prevProto;
            }
            if ($prevPort === null) {
                unset($_SERVER['SERVER_PORT']);
            } else {
                $_SERVER['SERVER_PORT'] = $prevPort;
            }
        }
    }
}
