<?php

declare(strict_types=1);

namespace Gastos\Api\Services;

use Gastos\Api\MoneyHelper;
use PDO;

final class FxRateService
{
    /**
     * Cotação EUR→BRL para uma data (Frankfurter API; fallback em planning_settings).
     *
     * @return array{rate: float, source: 'api'|'fallback', date: string}
     */
    public static function resolveEurToBrl(PDO $pdo, int $planningId, string $date): array
    {
        $date = self::normalizeDate($date);
        $cached = self::getCached($pdo, $date);
        if ($cached !== null) {
            return [
                'rate' => $cached['rate'],
                'source' => $cached['source'],
                'date' => $date,
            ];
        }

        $fromApi = self::fetchFromFrankfurter($date);
        if ($fromApi !== null && $fromApi > 0) {
            self::cacheRate($pdo, $date, $fromApi, 'api');

            return ['rate' => $fromApi, 'source' => 'api', 'date' => $date];
        }

        $fallback = MoneyHelper::getEurToBrlFallback($pdo, $planningId);
        self::cacheRate($pdo, $date, $fallback, 'fallback');

        return ['rate' => $fallback, 'source' => 'fallback', 'date' => $date];
    }

    public static function normalizeDate(?string $date): string
    {
        if ($date !== null && preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
            return $date;
        }

        return date('Y-m-d');
    }

    /** @return array{rate: float, source: 'api'|'fallback'}|null */
    private static function getCached(PDO $pdo, string $date): ?array
    {
        if (!self::tableExists($pdo)) {
            return null;
        }
        $stmt = $pdo->prepare(
            'SELECT eur_to_brl, source FROM fx_daily_rates WHERE rate_date = ? LIMIT 1'
        );
        $stmt->execute([$date]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            return null;
        }

        return [
            'rate' => (float) $row['eur_to_brl'],
            'source' => ($row['source'] ?? 'api') === 'fallback' ? 'fallback' : 'api',
        ];
    }

    private static function cacheRate(PDO $pdo, string $date, float $rate, string $source): void
    {
        if (!self::tableExists($pdo)) {
            return;
        }
        $stmt = $pdo->prepare(
            'INSERT INTO fx_daily_rates (rate_date, eur_to_brl, source)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE eur_to_brl = VALUES(eur_to_brl), source = VALUES(source), fetched_at = CURRENT_TIMESTAMP'
        );
        $stmt->execute([$date, round($rate, 6), $source]);
    }

    private static function fetchFromFrankfurter(string $date): ?float
    {
        $today = date('Y-m-d');
        $path = $date > $today ? 'latest' : $date;
        $url = 'https://api.frankfurter.app/' . rawurlencode($path) . '?from=EUR&to=BRL';

        $json = self::httpGet($url);
        if ($json === null) {
            return null;
        }

        $data = json_decode($json, true);
        if (!is_array($data) || !isset($data['rates']['BRL'])) {
            return null;
        }

        return (float) $data['rates']['BRL'];
    }

    private static function httpGet(string $url): ?string
    {
        if (function_exists('curl_init')) {
            $ch = curl_init($url);
            if ($ch === false) {
                return null;
            }
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT => 8,
                CURLOPT_FOLLOWLOCATION => true,
                CURLOPT_HTTPHEADER => ['Accept: application/json'],
            ]);
            $body = curl_exec($ch);
            $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);
            if ($body === false || $code < 200 || $code >= 300) {
                return null;
            }

            return $body;
        }

        $ctx = stream_context_create([
            'http' => [
                'timeout' => 8,
                'header' => "Accept: application/json\r\n",
            ],
        ]);
        $body = @file_get_contents($url, false, $ctx);

        return $body !== false ? $body : null;
    }

    private static function tableExists(PDO $pdo): bool
    {
        static $exists = null;
        if ($exists !== null) {
            return $exists;
        }
        $stmt = $pdo->query(
            "SELECT 1 FROM information_schema.tables
             WHERE table_schema = DATABASE() AND table_name = 'fx_daily_rates' LIMIT 1"
        );
        $exists = (bool) $stmt->fetchColumn();

        return $exists;
    }
}
