<?php

declare(strict_types=1);

namespace Gastos\Api;

use Gastos\Api\Services\FxRateService;
use PDO;

final class MoneyHelper
{
    public const CURRENCIES = ['BRL', 'EUR', 'USD'];

    /** Cotação manual de reserva EUR (configurações do planejamento). */
    public static function getEurToBrlFallback(PDO $pdo, int $planningId): float
    {
        $stmt = $pdo->prepare('SELECT eur_to_brl FROM planning_settings WHERE planning_id = ? LIMIT 1');
        $stmt->execute([$planningId]);
        $value = $stmt->fetchColumn();

        return $value !== false ? (float) $value : 6.0;
    }

    /** Cotação manual de reserva USD (configurações do planejamento). */
    public static function getUsdToBrlFallback(PDO $pdo, int $planningId): float
    {
        if (!self::hasUsdToBrlColumn($pdo)) {
            return 5.0;
        }
        $stmt = $pdo->prepare('SELECT usd_to_brl FROM planning_settings WHERE planning_id = ? LIMIT 1');
        $stmt->execute([$planningId]);
        $value = $stmt->fetchColumn();

        return $value !== false ? (float) $value : 5.0;
    }

    /** Taxa fallback → BRL conforme a moeda da conta/lançamento. */
    public static function getFxFallback(PDO $pdo, int $planningId, string $currency): float
    {
        return match ($currency) {
            'EUR' => self::getEurToBrlFallback($pdo, $planningId),
            'USD' => self::getUsdToBrlFallback($pdo, $planningId),
            default => 1.0,
        };
    }

    /** @deprecated Use getEurToBrlFallback ou FxRateService::resolveEurToBrl */
    public static function getEurToBrl(PDO $pdo, int $planningId): float
    {
        return self::getEurToBrlFallback($pdo, $planningId);
    }

    /**
     * Converte valor na moeda informada para BRL.
     * $rateToBrl é a cotação da moeda estrangeira (ignorado para BRL).
     */
    public static function toBrl(float $amount, string $currency, float $rateToBrl): float
    {
        if ($currency === 'EUR' || $currency === 'USD') {
            return round($amount * $rateToBrl, 2);
        }

        return round($amount, 2);
    }

    public static function isForeign(string $currency): bool
    {
        return $currency === 'EUR' || $currency === 'USD';
    }

    /**
     * @return array{
     *   currency: string,
     *   amount: float,
     *   amountBrl: float,
     *   eurToBrl: float|null,
     *   usdToBrl: float|null,
     *   fxSource: string|null,
     *   fxDate: string|null
     * }
     */
    public static function parseInput(PDO $pdo, int $planningId, array $input): array
    {
        $currency = $input['currency'] ?? 'BRL';
        $currency = in_array($currency, self::CURRENCIES, true) ? (string) $currency : 'BRL';

        $fxDate = FxRateService::normalizeDate(
            isset($input['transactionDate']) ? (string) $input['transactionDate']
                : (isset($input['date']) ? (string) $input['date'] : null)
        );
        $eurToBrl = null;
        $usdToBrl = null;
        $fxSource = null;
        $rate = null;

        if ($currency === 'EUR') {
            $fx = FxRateService::resolveEurToBrl($pdo, $planningId, $fxDate);
            $eurToBrl = $fx['rate'];
            $rate = $fx['rate'];
            $fxSource = $fx['source'];
        } elseif ($currency === 'USD') {
            $fx = FxRateService::resolveUsdToBrl($pdo, $planningId, $fxDate);
            $usdToBrl = $fx['rate'];
            // Persiste na coluna eur_to_brl (snapshot FX) para não quebrar inserts existentes
            $eurToBrl = $fx['rate'];
            $rate = $fx['rate'];
            $fxSource = $fx['source'];
        }

        if (isset($input['amount'])) {
            $amount = (float) $input['amount'];
        } elseif ($currency === 'BRL' && isset($input['amountBrl'])) {
            $amount = (float) $input['amountBrl'];
        } elseif ($currency === 'BRL' && isset($input['defaultAmountBrl'])) {
            $amount = (float) $input['defaultAmountBrl'];
        } elseif ($currency === 'BRL' && isset($input['suggestedAmountBrl'])) {
            $amount = (float) $input['suggestedAmountBrl'];
        } elseif (isset($input['suggestedAmount'])) {
            $amount = (float) $input['suggestedAmount'];
        } elseif (isset($input['amountOriginal'])) {
            $amount = (float) $input['amountOriginal'];
        } else {
            $amount = 0.0;
        }

        $amount = round($amount, 2);
        $fallback = $rate ?? self::getFxFallback($pdo, $planningId, $currency === 'BRL' ? 'EUR' : $currency);

        return [
            'currency' => $currency,
            'amount' => $amount,
            'amountBrl' => self::toBrl($amount, $currency, $fallback),
            'eurToBrl' => $eurToBrl,
            'usdToBrl' => $usdToBrl,
            'fxSource' => $fxSource,
            'fxDate' => self::isForeign($currency) ? $fxDate : null,
        ];
    }

    /** @param array<string, mixed> $mapped */
    public static function enrichMap(array $mapped, array $row): array
    {
        $currency = $row['currency'] ?? 'BRL';
        $mapped['currency'] = $currency;
        $mapped['amount'] = isset($row['amount_original'])
            ? (float) $row['amount_original']
            : (isset($row['suggested_amount'])
                ? (float) $row['suggested_amount']
                : (float) ($mapped['defaultAmountBrl'] ?? $mapped['suggestedAmountBrl'] ?? $mapped['amountBrl'] ?? 0));

        return $mapped;
    }

    private static function hasUsdToBrlColumn(PDO $pdo): bool
    {
        static $has = null;
        if ($has !== null) {
            return $has;
        }
        $stmt = $pdo->query(
            "SELECT 1 FROM information_schema.columns
             WHERE table_schema = DATABASE()
               AND table_name = 'planning_settings'
               AND column_name = 'usd_to_brl'
             LIMIT 1"
        );
        $has = (bool) ($stmt && $stmt->fetchColumn());

        return $has;
    }
}
