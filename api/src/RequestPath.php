<?php

declare(strict_types=1);

namespace Gastos\Api;

/** Normaliza REQUEST_URI para rotas da API (suporta /api e /~usuario/... no cPanel). */
final class RequestPath
{
    public static function fromUri(string $uri): string
    {
        $path = parse_url($uri, PHP_URL_PATH) ?? '/';

        // cPanel: /~conta/api/auth/login → /api/auth/login
        if (preg_match('#^/~[^/]+#', $path)) {
            $path = preg_replace('#^/~[^/]+#', '', $path) ?: '/';
        }

        $base = rtrim(Config::get('APP_BASE_PATH', ''), '/');
        $prefixes = ['/api'];
        if ($base !== '' && !str_starts_with($base, '/~')) {
            array_unshift($prefixes, $base . '/api', $base);
        }

        usort($prefixes, static fn (string $a, string $b): int => strlen($b) <=> strlen($a));

        foreach ($prefixes as $prefix) {
            if ($prefix !== '' && str_starts_with($path, $prefix)) {
                $path = substr($path, strlen($prefix)) ?: '/';
                break;
            }
        }

        return $path === '' ? '/' : $path;
    }
}
