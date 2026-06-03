<?php

declare(strict_types=1);

namespace Gastos\Api\Services;

use Gastos\Api\Config;

final class MailService
{
    public static function send(string $to, string $subject, string $htmlBody, string $textBody = ''): bool
    {
        $driver = Config::get('MAIL_DRIVER', 'log');
        $textBody = $textBody !== '' ? $textBody : strip_tags($htmlBody);

        if ($driver === 'log') {
            self::log($to, $subject, $textBody);

            return true;
        }

        $from = Config::get('MAIL_FROM', 'Tostoes <noreply@tostoes.app>');
        $headers = implode("\r\n", [
            'MIME-Version: 1.0',
            'Content-type: text/html; charset=UTF-8',
            'From: ' . $from,
        ]);

        return @mail($to, '=?UTF-8?B?' . base64_encode($subject) . '?=', $htmlBody, $headers);
    }

    public static function isLogDriver(): bool
    {
        return Config::get('MAIL_DRIVER', 'log') === 'log';
    }

    private static function log(string $to, string $subject, string $body): void
    {
        $dir = dirname(__DIR__, 2) . '/storage';
        if (!is_dir($dir)) {
            @mkdir($dir, 0775, true);
        }
        $line = sprintf(
            "[%s]\nTo: %s\nSubject: %s\n%s\n---\n",
            date('c'),
            $to,
            $subject,
            $body
        );
        $written = @file_put_contents($dir . '/mail.log', $line, FILE_APPEND);
        if ($written === false) {
            error_log('[mail] ' . trim(str_replace("\n", ' | ', $line)));
        }
    }
}
