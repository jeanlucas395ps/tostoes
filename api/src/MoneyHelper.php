<?php

declare(strict_types=1);

namespace Gastos\Api;

use Gastos\Api\Services\FxRateService;
use PDO;

final class MoneyHelper
{
    /** Cotação manual de reserva (configurações do planejamento). */
    public static function getEurToBrlFallback(PDO $pdo, int $planningId): float
    {
        $stmt = $pdo->prepare('SELECT eur_to_brl FROM planning_settings WHERE planning_id = ? LIMIT 1');
        $stmt->execute([$planningId]);
        $value = $stmt->fetchColumn();

        return $value !== false ? (float) $value : 6.0;
    }

    /** @deprecated Use getEurToBrlFallback ou FxRateService::resolveEurToBrl */
    public static function getEurToBrl(PDO $pdo, int $planningId): float
    {
        return self::getEurToBrlFallback($pdo, $planningId);
    }

    public static function toBrl(float $amount, string $currency, float $eurToBrl): float
    {
        if ($currency === 'EUR') {
            return round($amount * $eurToBrl, 2);
        }

        return round($amount, 2);
    }

    /**
     * @return array{
     *   currency: string,
     *   amount: float,
     *   amountBrl: float,
     *   eurToBrl: float|null,
     *   fxSource: string|null,
     *   fxDate: string|null
     * }
     */
    public static function parseInput(PDO $pdo, int $planningId, array $input): array
    {
        $currency = $input['currency'] ?? 'BRL';
        $currency = in_array($currency, ['BRL', 'EUR'], true) ? (string) $currency : 'BRL';

        $fxDate = FxRateService::normalizeDate(
            isset($input['transactionDate']) ? (string) $input['transactionDate']
                : (isset($input['date']) ? (string) $input['date'] : null)
        );
        $eurToBrl = null;
        $fxSource = null;
        if ($currency === 'EUR') {
            $fx = FxRateService::resolveEurToBrl($pdo, $planningId, $fxDate);
            $eurToBrl = $fx['rate'];
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

        return [
            'currency' => $currency,
            'amount' => $amount,
            'amountBrl' => self::toBrl($amount, $currency, $eurToBrl ?? self::getEurToBrlFallback($pdo, $planningId)),
            'eurToBrl' => $eurToBrl,
            'fxSource' => $fxSource,
            'fxDate' => $currency === 'EUR' ? $fxDate : null,
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
}
