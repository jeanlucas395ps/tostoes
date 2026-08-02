<?php

declare(strict_types=1);

namespace Gastos\Api\Tests\Unit;

use Gastos\Api\Config;
use Gastos\Api\Services\MailService;
use PHPUnit\Framework\TestCase;
use ReflectionClass;

final class MailServiceTest extends TestCase
{
    private string $logFile;

    protected function setUp(): void
    {
        $ref = new ReflectionClass(Config::class);
        $prop = $ref->getProperty('env');
        $env = $prop->getValue() ?? [];
        $env['MAIL_DRIVER'] = 'log';
        $env['MAIL_FROM'] = 'Tostoes <noreply@tostoes.app>';
        $prop->setValue(null, $env);

        $this->logFile = dirname(__DIR__, 2) . '/storage/mail.log';
        if (is_file($this->logFile)) {
            unlink($this->logFile);
        }
    }

    public function testIsLogDriver(): void
    {
        $this->assertTrue(MailService::isLogDriver());
    }

    public function testSendLogDriverWritesFile(): void
    {
        $ok = MailService::send('a@b.com', 'Assunto', '<b>Oi</b>', 'Oi');
        $this->assertTrue($ok);
        $this->assertFileExists($this->logFile);
        $contents = file_get_contents($this->logFile);
        $this->assertStringContainsString('a@b.com', $contents);
        $this->assertStringContainsString('Assunto', $contents);
    }

    public function testSendSmtpIncompleteFallsBackToLog(): void
    {
        $ref = new ReflectionClass(Config::class);
        $prop = $ref->getProperty('env');
        $env = $prop->getValue() ?? [];
        $env['MAIL_DRIVER'] = 'smtp';
        $env['MAIL_HOST'] = '';
        $env['MAIL_USERNAME'] = '';
        $env['MAIL_PASSWORD'] = '';
        $prop->setValue(null, $env);

        $ok = MailService::send('x@y.com', 'Fail', '<p>x</p>');
        $this->assertFalse($ok);
        $this->assertFileExists($this->logFile);
    }
}
