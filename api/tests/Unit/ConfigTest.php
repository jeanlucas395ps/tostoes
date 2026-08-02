<?php

declare(strict_types=1);

namespace Gastos\Api\Tests\Unit;

use Gastos\Api\Config;
use PHPUnit\Framework\TestCase;
use ReflectionClass;

final class ConfigTest extends TestCase
{
    private string $tmpDir;

    protected function setUp(): void
    {
        $this->tmpDir = sys_get_temp_dir() . '/gastos-config-' . uniqid('', true);
        mkdir($this->tmpDir);
    }

    protected function tearDown(): void
    {
        $env = $this->tmpDir . '/.env';
        if (is_file($env)) {
            unlink($env);
        }
        if (is_dir($this->tmpDir)) {
            rmdir($this->tmpDir);
        }
    }

    public function testLoadDefaultsWithoutEnvFile(): void
    {
        Config::load($this->tmpDir);
        $this->assertSame('127.0.0.1', Config::get('DB_HOST'));
        $this->assertSame('change-me-in-production', Config::get('JWT_SECRET'));
        $this->assertSame('missing-default', Config::get('NO_SUCH_KEY', 'missing-default'));
        $this->assertSame('', Config::get('NO_SUCH_KEY'));
    }

    public function testLoadParsesEnvFileAndAliases(): void
    {
        file_put_contents(
            $this->tmpDir . '/.env',
            implode("\n", [
                '# comment',
                '',
                'DB_DATABASE=mydb',
                'DB_USERNAME=myuser',
                'DB_PASSWORD="secret"',
                'MAIL_MAILER=smtp',
                'MAIL_FROM_ADDRESS=a@b.com',
                'MAIL_FROM_NAME=${APP_NAME}',
                'APP_NAME=MeuApp',
                'INVALID_LINE_WITHOUT_EQ',
            ])
        );

        Config::load($this->tmpDir);
        $this->assertSame('mydb', Config::get('DB_NAME'));
        $this->assertSame('myuser', Config::get('DB_USER'));
        $this->assertSame('secret', Config::get('DB_PASS'));
        $this->assertSame('smtp', Config::get('MAIL_DRIVER'));
        $this->assertSame('MeuApp', Config::get('MAIL_FROM_NAME'));
        $this->assertStringContainsString('a@b.com', Config::get('MAIL_FROM'));
    }
}
