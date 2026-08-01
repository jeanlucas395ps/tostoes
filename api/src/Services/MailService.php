<?php

declare(strict_types=1);

namespace Gastos\Api\Services;

use Gastos\Api\Config;
use RuntimeException;

final class MailService
{
    public static function send(string $to, string $subject, string $htmlBody, string $textBody = ''): bool
    {
        $driver = strtolower(Config::get('MAIL_DRIVER', 'log'));
        $textBody = $textBody !== '' ? $textBody : strip_tags($htmlBody);

        if ($driver === 'log') {
            self::log($to, $subject, $textBody);

            return true;
        }

        if ($driver === 'smtp') {
            return self::sendSmtp($to, $subject, $htmlBody, $textBody);
        }

        $from = self::fromHeader();
        $headers = implode("\r\n", [
            'MIME-Version: 1.0',
            'Content-type: text/html; charset=UTF-8',
            'From: ' . $from,
        ]);

        return @mail($to, '=?UTF-8?B?' . base64_encode($subject) . '?=', $htmlBody, $headers);
    }

    public static function isLogDriver(): bool
    {
        return strtolower(Config::get('MAIL_DRIVER', 'log')) === 'log';
    }

    private static function fromHeader(): string
    {
        $from = trim(Config::get('MAIL_FROM', ''));
        if ($from !== '') {
            return $from;
        }

        $address = Config::get('MAIL_FROM_ADDRESS', 'noreply@tostoes.app');
        $name = Config::get('MAIL_FROM_NAME', Config::get('APP_NAME', 'Tostoes'));
        if ($name === '' || str_contains($name, '${')) {
            $name = 'Tostoes';
        }

        return sprintf('%s <%s>', self::encodeHeader($name), $address);
    }

    private static function sendSmtp(
        string $to,
        string $subject,
        string $htmlBody,
        string $textBody
    ): bool {
        $host = Config::get('MAIL_HOST');
        $port = (int) Config::get('MAIL_PORT', '465');
        $user = Config::get('MAIL_USERNAME');
        $pass = Config::get('MAIL_PASSWORD');
        $encryption = strtolower(Config::get('MAIL_ENCRYPTION', 'ssl'));
        $fromAddress = Config::get('MAIL_FROM_ADDRESS', $user !== '' ? $user : 'noreply@tostoes.app');
        $fromHeader = self::fromHeader();

        if ($host === '' || $user === '' || $pass === '') {
            error_log('[mail] SMTP incompleto: defina MAIL_HOST, MAIL_USERNAME e MAIL_PASSWORD.');
            self::log($to, '[SMTP FALHOU] ' . $subject, $textBody);

            return false;
        }

        $boundary = 'b_' . bin2hex(random_bytes(12));
        $encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
        $message = self::buildMimeMessage(
            $fromHeader,
            $to,
            $encodedSubject,
            $htmlBody,
            $textBody,
            $boundary
        );

        try {
            $socket = self::connect($host, $port, $encryption);
            self::expect($socket, [220]);
            self::command($socket, 'EHLO tostoes.com.br', [250]);
            self::command($socket, 'AUTH LOGIN', [334]);
            self::command($socket, base64_encode($user), [334]);
            self::command($socket, base64_encode($pass), [235]);
            self::command($socket, 'MAIL FROM:<' . $fromAddress . '>', [250]);
            self::command($socket, 'RCPT TO:<' . $to . '>', [250, 251]);
            self::command($socket, 'DATA', [354]);
            fwrite($socket, $message . "\r\n.\r\n");
            self::expect($socket, [250]);
            self::command($socket, 'QUIT', [221]);
            fclose($socket);

            return true;
        } catch (\Throwable $e) {
            error_log('[mail] SMTP error: ' . $e->getMessage());
            self::log($to, '[SMTP FALHOU] ' . $subject, $textBody . "\n\nError: " . $e->getMessage());

            return false;
        }
    }

    /** @return resource */
    private static function connect(string $host, int $port, string $encryption)
    {
        $useSsl = in_array($encryption, ['ssl', 'smtps'], true) || $port === 465;
        $remote = $useSsl
            ? 'ssl://' . $host . ':' . $port
            : 'tcp://' . $host . ':' . $port;

        $errno = 0;
        $errstr = '';
        $socket = @stream_socket_client(
            $remote,
            $errno,
            $errstr,
            30,
            STREAM_CLIENT_CONNECT,
            stream_context_create([
                'ssl' => [
                    'verify_peer' => true,
                    'verify_peer_name' => true,
                    'allow_self_signed' => false,
                ],
            ])
        );
        if ($socket === false) {
            throw new RuntimeException("Não conectou em {$remote}: {$errstr} ({$errno})");
        }
        stream_set_timeout($socket, 30);

        return $socket;
    }

    /** @param resource $socket @param list<int> $ok */
    private static function command($socket, string $cmd, array $ok): void
    {
        fwrite($socket, $cmd . "\r\n");
        self::expect($socket, $ok);
    }

    /** @param resource $socket @param list<int> $ok */
    private static function expect($socket, array $ok): void
    {
        $response = '';
        while (($line = fgets($socket, 515)) !== false) {
            $response .= $line;
            if (isset($line[3]) && $line[3] === ' ') {
                break;
            }
        }
        $code = (int) substr($response, 0, 3);
        if (!in_array($code, $ok, true)) {
            throw new RuntimeException('SMTP inesperado: ' . trim($response));
        }
    }

    private static function buildMimeMessage(
        string $fromHeader,
        string $to,
        string $encodedSubject,
        string $htmlBody,
        string $textBody,
        string $boundary
    ): string {
        $headers = [
            'Date: ' . date('r'),
            'From: ' . $fromHeader,
            'To: ' . $to,
            'Subject: ' . $encodedSubject,
            'MIME-Version: 1.0',
            'Content-Type: multipart/alternative; boundary="' . $boundary . '"',
        ];

        $body = implode("\r\n", [
            '--' . $boundary,
            'Content-Type: text/plain; charset=UTF-8',
            'Content-Transfer-Encoding: base64',
            '',
            rtrim(chunk_split(base64_encode($textBody))),
            '--' . $boundary,
            'Content-Type: text/html; charset=UTF-8',
            'Content-Transfer-Encoding: base64',
            '',
            rtrim(chunk_split(base64_encode($htmlBody))),
            '--' . $boundary . '--',
            '',
        ]);

        return implode("\r\n", $headers) . "\r\n\r\n" . $body;
    }

    private static function encodeHeader(string $value): string
    {
        if (preg_match('/^[\x20-\x7E]+$/', $value) === 1) {
            return $value;
        }

        return '=?UTF-8?B?' . base64_encode($value) . '?=';
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
