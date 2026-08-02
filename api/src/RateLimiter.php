<?php

declare(strict_types=1);

namespace Gastos\Api;

/**
 * Rate limit por IP (arquivo em storage/rate-limit).
 * Janelas: minuto / hora / dia,  configuráveis via RATE_LIMIT_*.
 */
final class RateLimiter
{
    /** @var string|null Override de IP nos testes. */
    public static ?string $clientIpOverride = null;

    /** @var string|null Diretório de storage nos testes. */
    public static ?string $storageDirOverride = null;

    public static function enforce(string $bucket = 'api'): void
    {
        if (!self::enabled()) {
            return;
        }

        $limits = self::limitsFor($bucket);
        $ip = self::clientIp();
        $key = hash('sha256', $bucket . '|' . $ip);
        $path = self::storageDir() . '/' . $key . '.json';

        $now = time();
        $state = self::readState($path);
        $state = self::rollWindows($state, $now);
        $state['ip'] = $ip;
        $state['bucket'] = $bucket;

        foreach (['minute' => 60, 'hour' => 3600, 'day' => 86400] as $window => $seconds) {
            $limit = $limits[$window];
            $count = (int) ($state[$window]['count'] ?? 0);
            if ($count >= $limit) {
                $retryAfter = max(1, ((int) $state[$window]['start'] + $seconds) - $now);
                header('Retry-After: ' . $retryAfter);
                header('X-RateLimit-Limit: ' . $limit);
                header('X-RateLimit-Remaining: 0');
                header('X-RateLimit-Window: ' . $window);
                Response::error('Muitas requisições. Tente novamente em breve.', 429, [
                    'retryAfter' => $retryAfter,
                    'window' => $window,
                ]);
            }
        }

        foreach (['minute', 'hour', 'day'] as $window) {
            $state[$window]['count'] = (int) ($state[$window]['count'] ?? 0) + 1;
        }
        self::writeState($path, $state);

        $minLimit = $limits['minute'];
        $minUsed = (int) $state['minute']['count'];
        header('X-RateLimit-Limit: ' . $minLimit);
        header('X-RateLimit-Remaining: ' . max(0, $minLimit - $minUsed));
    }

    public static function enabled(): bool
    {
        $raw = strtolower(trim(Config::get('RATE_LIMIT_ENABLED', 'true')));

        return in_array($raw, ['1', 'true', 'yes', 'on'], true);
    }

    /** @return array{minute: int, hour: int, day: int} */
    public static function limitsFor(string $bucket): array
    {
        if ($bucket === 'auth') {
            return [
                'minute' => self::intConfig('RATE_LIMIT_AUTH_PER_MINUTE', 30),
                'hour' => self::intConfig('RATE_LIMIT_AUTH_PER_HOUR', 200),
                'day' => self::intConfig('RATE_LIMIT_AUTH_PER_DAY', 500),
            ];
        }

        return [
            'minute' => self::intConfig('RATE_LIMIT_API_PER_MINUTE', 120),
            'hour' => self::intConfig('RATE_LIMIT_API_PER_HOUR', 2000),
            'day' => self::intConfig('RATE_LIMIT_API_PER_DAY', 10000),
        ];
    }

    public static function clientIp(): string
    {
        if (self::$clientIpOverride !== null && self::$clientIpOverride !== '') {
            return self::$clientIpOverride;
        }

        $trustProxy = in_array(
            strtolower(trim(Config::get('RATE_LIMIT_TRUST_PROXY', 'false'))),
            ['1', 'true', 'yes', 'on'],
            true
        );

        if ($trustProxy) {
            $xff = (string) ($_SERVER['HTTP_X_FORWARDED_FOR'] ?? '');
            if ($xff !== '') {
                $parts = array_map('trim', explode(',', $xff));
                $first = $parts[0] ?? '';
                if (filter_var($first, FILTER_VALIDATE_IP)) {
                    return $first;
                }
            }
            $real = (string) ($_SERVER['HTTP_X_REAL_IP'] ?? '');
            if (filter_var($real, FILTER_VALIDATE_IP)) {
                return $real;
            }
        }

        $remote = (string) ($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');

        return filter_var($remote, FILTER_VALIDATE_IP) ? $remote : '0.0.0.0';
    }

    private static function intConfig(string $key, int $default): int
    {
        $raw = Config::get($key, (string) $default);
        $n = (int) $raw;

        return $n > 0 ? $n : $default;
    }

    private static function storageDir(): string
    {
        if (self::$storageDirOverride !== null) {
            $dir = self::$storageDirOverride;
        } else {
            $dir = dirname(__DIR__) . '/storage/rate-limit';
        }
        if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) {
            // Sem disco: falha aberta (não derruba a API).
            return sys_get_temp_dir() . '/tostoes-rate-limit';
        }

        return $dir;
    }

    /** @return array<string, mixed> */
    private static function readState(string $path): array
    {
        if (!is_file($path)) {
            return [];
        }
        $raw = @file_get_contents($path);
        if ($raw === false || $raw === '') {
            return [];
        }
        $data = json_decode($raw, true);

        return is_array($data) ? $data : [];
    }

    /** @param array<string, mixed> $state */
    private static function writeState(string $path, array $state): void
    {
        $dir = dirname($path);
        if (!is_dir($dir)) {
            @mkdir($dir, 0775, true);
        }
        $json = json_encode($state, JSON_THROW_ON_ERROR);
        @file_put_contents($path, $json, LOCK_EX);
    }

    /**
     * @param array<string, mixed> $state
     * @return array<string, mixed>
     */
    private static function rollWindows(array $state, int $now): array
    {
        foreach (['minute' => 60, 'hour' => 3600, 'day' => 86400] as $window => $seconds) {
            $start = (int) ($state[$window]['start'] ?? 0);
            if ($start <= 0 || ($now - $start) >= $seconds) {
                $state[$window] = ['start' => $now, 'count' => 0];
            }
        }

        return $state;
    }
}
