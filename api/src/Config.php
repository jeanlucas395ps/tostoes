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
            'CORS_ORIGIN' => '*',
            'APP_BASE_PATH' => '',
            'APP_URL' => 'http://localhost:4200',
            'APP_TIMEZONE' => 'America/Sao_Paulo',
            'MAIL_DRIVER' => 'log',
            'MAIL_HOST' => '',
            'MAIL_PORT' => '465',
            'MAIL_USERNAME' => '',
            'MAIL_PASSWORD' => '',
            'MAIL_ENCRYPTION' => 'ssl',
            'MAIL_FROM' => '',
            'MAIL_FROM_ADDRESS' => 'noreply@tostoes.app',
            'MAIL_FROM_NAME' => 'Tostoes',
            'APP_NAME' => 'Tostoes',
            'RATE_LIMIT_ENABLED' => 'true',
            'RATE_LIMIT_API_PER_MINUTE' => '120',
            'RATE_LIMIT_API_PER_HOUR' => '2000',
            'RATE_LIMIT_API_PER_DAY' => '10000',
            'RATE_LIMIT_AUTH_PER_MINUTE' => '30',
            'RATE_LIMIT_AUTH_PER_HOUR' => '200',
            'RATE_LIMIT_AUTH_PER_DAY' => '500',
            'RATE_LIMIT_TRUST_PROXY' => 'false',
            'APP_DEBUG' => 'false',
            'OPENAI_API_KEY' => '',
            'OPENAI_API_URL' => 'https://api.openai.com/v1/chat/completions',
            'OPENAI_MODEL' => 'gpt-4o-mini',
            'AI_REPORTS_DAILY_LIMIT' => '2',
            'RATE_LIMIT_AI_REPORTS_PER_MINUTE' => '1',
            'RATE_LIMIT_AI_REPORTS_PER_HOUR' => '2',
            'RATE_LIMIT_AI_REPORTS_PER_DAY' => '3',
            'RATE_LIMIT_AI_REPORTS_IP_PER_MINUTE' => '2',
            'RATE_LIMIT_AI_REPORTS_IP_PER_HOUR' => '8',
            'RATE_LIMIT_AI_REPORTS_IP_PER_DAY' => '20',
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

        // Docker/cPanel: env_file e variáveis do processo sobrescrevem o .env do arquivo.
        foreach (array_keys(self::$env) as $key) {
            $fromEnv = getenv($key);
            if ($fromEnv !== false) {
                self::$env[$key] = $fromEnv;
            }
        }

        self::normalizeDatabaseKeys();
        self::normalizeMailKeys();

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
    }

    /** Aceita MAIL_MAILER (Laravel) como alias de MAIL_DRIVER. */
    private static function normalizeMailKeys(): void
    {
        if (!empty(self::$env['MAIL_MAILER'])) {
            self::$env['MAIL_DRIVER'] = self::$env['MAIL_MAILER'];
        }
        $name = self::$env['MAIL_FROM_NAME'] ?? 'Tostoes';
        if (str_contains($name, '${APP_NAME}')) {
            $appName = self::$env['APP_NAME'] ?? 'Tostoes';
            $name = str_replace('${APP_NAME}', $appName, $name);
            self::$env['MAIL_FROM_NAME'] = $name;
        }
        if (empty(self::$env['MAIL_FROM']) && !empty(self::$env['MAIL_FROM_ADDRESS'])) {
            self::$env['MAIL_FROM'] = sprintf('%s <%s>', $name !== '' ? $name : 'Tostoes', self::$env['MAIL_FROM_ADDRESS']);
        }
    }

    public static function get(string $key, ?string $default = null): string
    {
        if (array_key_exists($key, self::$env)) {
            return (string) self::$env[$key];
        }
        $fromEnv = getenv($key);
        if ($fromEnv !== false) {
            return $fromEnv;
        }

        return $default ?? '';
    }
}
