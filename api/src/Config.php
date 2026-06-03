<?php

declare(strict_types=1);

namespace Gastos\Api;

final class Config
{
    private static array $env = [];

    public static function load(string $root): void
    {
        $path = $root . '/.env';
        $defaults = [
            'DB_HOST' => '127.0.0.1',
            'DB_PORT' => '3306',
            'DB_NAME' => 'gastos',
            'DB_USER' => 'root',
            'DB_PASS' => '',
            'JWT_SECRET' => 'change-me-in-production',
            'CORS_ORIGIN' => 'http://localhost:4200',
            'APP_BASE_PATH' => '',
            'APP_URL' => 'http://localhost:4200',
            'APP_TIMEZONE' => 'America/Sao_Paulo',
            'MAIL_DRIVER' => 'log',
            'MAIL_FROM' => 'Tostoes <noreply@tostoes.app>',
            'SETUP_USER' => '',
            'SETUP_PASSWORD' => '',
            'SETUP_NAME' => '',
        ];

        self::$env = $defaults;
        if (is_file($path)) {
            foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
                $line = trim($line);
                if ($line === '' || str_starts_with($line, '#')) {
                    continue;
                }
                $eq = strpos($line, '=');
                if ($eq === false) {
                    continue;
                }
                $key = trim(substr($line, 0, $eq));
                $value = trim(substr($line, $eq + 1));
                if (
                    (str_starts_with($value, '"') && str_ends_with($value, '"')) ||
                    (str_starts_with($value, "'") && str_ends_with($value, "'"))
                ) {
                    $value = substr($value, 1, -1);
                }
                self::$env[$key] = $value;
            }
        }

        foreach (array_keys(self::$env) as $key) {
            $fromEnv = getenv($key);
            if ($fromEnv !== false) {
                self::$env[$key] = $fromEnv;
            }
        }

        self::normalizeDatabaseKeys();

        date_default_timezone_set(self::$env['APP_TIMEZONE']);
    }

    /** Aceita DB_NAME/DB_USER/DB_PASS ou DB_DATABASE/DB_USERNAME/DB_PASSWORD (cPanel). */
    private static function normalizeDatabaseKeys(): void
    {
        if (!empty(self::$env['DB_DATABASE'])) {
            self::$env['DB_NAME'] = self::$env['DB_DATABASE'];
        }
        if (!empty(self::$env['DB_USERNAME'])) {
            self::$env['DB_USER'] = self::$env['DB_USERNAME'];
        }
        if (isset(self::$env['DB_PASSWORD']) && self::$env['DB_PASSWORD'] !== '') {
            self::$env['DB_PASS'] = self::$env['DB_PASSWORD'];
        }
        if (empty(self::$env['DB_NAME']) && !empty(self::$env['DB_DATABASE'])) {
            self::$env['DB_NAME'] = self::$env['DB_DATABASE'];
        }
        if (empty(self::$env['DB_USER']) && !empty(self::$env['DB_USERNAME'])) {
            self::$env['DB_USER'] = self::$env['DB_USERNAME'];
        }
    }

    public static function get(string $key, ?string $default = null): string
    {
        return self::$env[$key] ?? $default ?? '';
    }
}
