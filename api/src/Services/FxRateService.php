<?php

declare(strict_types=1);

namespace Gastos\Api\Services;

use Gastos\Api\MoneyHelper;
use PDO;

final class FxRateService
{
    /** Força fallback file_get_contents (testes). */
    public static bool $forceStreamHttp = false;

    /**
     * Cotação EUR→BRL para uma data (Frankfurter API; fallback em planning_settings).
     *
     * @return array{rate: float, source: 'api'|'fallback', date: string}
     */
    public static function resolveEurToBrl(PDO $pdo, int $planningId, string $date): array
    {
        return self::resolveToBrl($pdo, $planningId, 'EUR', $date);
    }

    /**
     * Cotação USD→BRL para uma data (Frankfurter API; fallback em planning_settings).
     *
     * @return array{rate: float, source: 'api'|'fallback', date: string}
     */
    public static function resolveUsdToBrl(PDO $pdo, int $planningId, string $date): array
    {
        return self::resolveToBrl($pdo, $planningId, 'USD', $date);
    }

    /**
     * @return array{rate: float, source: 'api'|'fallback', date: string}
     */
    public static function resolveToBrl(PDO $pdo, int $planningId, string $fromCurrency, string $date): array
    {
        $fromCurrency = strtoupper($fromCurrency);
        if ($fromCurrency === 'BRL') {
            return ['rate' => 1.0, 'source' => 'fallback', 'date' => self::normalizeDate($date)];
        }

        $date = self::normalizeDate($date);
        $cached = self::getCached($pdo, $date, $fromCurrency);
        if ($cached !== null) {
            return [
                'rate' => $cached['rate'],
                'source' => $cached['source'],
                'date' => $date,
            ];
        }

        $fromApi = self::fetchFromFrankfurter($date, $fromCurrency);
        if ($fromApi !== null && $fromApi > 0) {
            self::cacheRate($pdo, $date, $fromCurrency, $fromApi, 'api');

            return ['rate' => $fromApi, 'source' => 'api', 'date' => $date];
        }

        $fallback = MoneyHelper::getFxFallback($pdo, $planningId, $fromCurrency);
        self::cacheRate($pdo, $date, $fromCurrency, $fallback, 'fallback');

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
    private static function getCached(PDO $pdo, string $date, string $fromCurrency): ?array
    {
        if (!self::tableExists($pdo)) {
            return null;
        }
        $column = $fromCurrency === 'USD' ? 'usd_to_brl' : 'eur_to_brl';
        if ($fromCurrency === 'USD' && !self::hasUsdColumn($pdo)) {
            return null;
        }
        $stmt = $pdo->prepare(
            "SELECT {$column} AS rate, source FROM fx_daily_rates WHERE rate_date = ? LIMIT 1"
        );
        $stmt->execute([$date]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row || $row['rate'] === null || (float) $row['rate'] <= 0) {
            return null;
        }

        return [
            'rate' => (float) $row['rate'],
            'source' => ($row['source'] ?? 'api') === 'fallback' ? 'fallback' : 'api',
        ];
    }

    private static function cacheRate(
        PDO $pdo,
        string $date,
        string $fromCurrency,
        float $rate,
        string $source
    ): void {
        if (!self::tableExists($pdo)) {
            return;
        }
        $rounded = round($rate, 6);
        if ($fromCurrency === 'USD' && self::hasUsdColumn($pdo)) {
            $stmt = $pdo->prepare(
                'INSERT INTO fx_daily_rates (rate_date, eur_to_brl, usd_to_brl, source)
                 VALUES (?, 0, ?, ?)
                 ON DUPLICATE KEY UPDATE
                   usd_to_brl = VALUES(usd_to_brl),
                   source = VALUES(source),
                   fetched_at = CURRENT_TIMESTAMP'
            );
            $stmt->execute([$date, $rounded, $source]);

            return;
        }

        $stmt = $pdo->prepare(
            'INSERT INTO fx_daily_rates (rate_date, eur_to_brl, source)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE eur_to_brl = VALUES(eur_to_brl), source = VALUES(source), fetched_at = CURRENT_TIMESTAMP'
        );
        $stmt->execute([$date, $rounded, $source]);
    }

    private static function fetchFromFrankfurter(string $date, string $fromCurrency): ?float
    {
        $today = date('Y-m-d');
        $path = $date > $today ? 'latest' : $date;
        $from = $fromCurrency === 'USD' ? 'USD' : 'EUR';
        $url = 'https://api.frankfurter.app/' . rawurlencode($path) . '?from=' . $from . '&to=BRL';

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
        if (!self::$forceStreamHttp && function_exists('curl_init')) {
            return self::httpGetCurl($url);
        }

        return self::httpGetStream($url);
    }

    private static function httpGetCurl(string $url): ?string
    {
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

    private static function httpGetStream(string $url): ?string
    {
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

    private static function hasUsdColumn(PDO $pdo): bool
    {
        static $has = null;
        if ($has !== null) {
            return $has;
        }
        $stmt = $pdo->query(
            "SELECT 1 FROM information_schema.columns
             WHERE table_schema = DATABASE()
               AND table_name = 'fx_daily_rates'
               AND column_name = 'usd_to_brl'
             LIMIT 1"
        );
        $has = (bool) ($stmt && $stmt->fetchColumn());

        return $has;
    }
}
