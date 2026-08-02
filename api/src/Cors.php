<?php

declare(strict_types=1);

namespace Gastos\Api;

/**
 * CORS para o frontend (origens em CORS_ORIGIN, separadas por vírgula).
 * Suporta:
 * - `*` → qualquer Origin (reflete o Origin do request)
 * - curinga de host, ex.: https://*.seudominio.com
 * - lista explícita
 */
final class Cors
{
    public static function apply(): void
    {
        $raw = Config::get('CORS_ORIGIN', '*');
        $allowed = array_values(array_filter(array_map('trim', explode(',', $raw))));
        if ($allowed === []) {
            $allowed = ['*'];
        }

        $allowAll = in_array('*', $allowed, true);
        $requestOrigin = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');

        if ($allowAll) {
            if ($requestOrigin !== '') {
                // Reflete Origin (compatível com Authorization + browsers).
                header('Access-Control-Allow-Origin: ' . $requestOrigin);
                header('Access-Control-Allow-Credentials: true');
                header('Vary: Origin');
            } else {
                header('Access-Control-Allow-Origin: *');
            }
        } else {
            $configured = $allowed;
            // Capacitor / Ionic WebView,  além da lista configurada.
            foreach ([
                'https://localhost',
                'http://localhost',
                'capacitor://localhost',
                'ionic://localhost',
                'https://app.tostoes.com.br',
            ] as $mobileOrigin) {
                if (!in_array($mobileOrigin, $allowed, true)) {
                    $allowed[] = $mobileOrigin;
                }
            }

            if ($requestOrigin !== '' && self::originAllowed($requestOrigin, $allowed)) {
                header('Access-Control-Allow-Origin: ' . $requestOrigin);
                header('Access-Control-Allow-Credentials: true');
                header('Vary: Origin');
            } elseif (count($configured) === 1 && !str_contains($configured[0], '*')) {
                header('Access-Control-Allow-Origin: ' . $configured[0]);
            }
        }

        header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Planning-Id, X-Requested-With');
        header('Access-Control-Max-Age: 86400');
    }

    /** @param list<string> $allowed */
    private static function originAllowed(string $origin, array $allowed): bool
    {
        foreach ($allowed as $entry) {
            if ($entry === '*' || $entry === $origin) {
                return true;
            }
            if (str_contains($entry, '*') && self::wildcardMatch($entry, $origin)) {
                return true;
            }
        }

        return false;
    }

    /** Ex.: https://*.example.com casa com https://app.example.com */
    private static function wildcardMatch(string $pattern, string $origin): bool
    {
        if ($pattern === '*') {
            return true;
        }
        $quoted = preg_quote($pattern, '#');
        $regex = '#^' . str_replace('\*', '[^/]+', $quoted) . '$#';

        return (bool) preg_match($regex, $origin);
    }
}
