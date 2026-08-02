<?php

declare(strict_types=1);

namespace Gastos\Api\Controllers;

use Gastos\Api\Auth;
use Gastos\Api\Database;
use Gastos\Api\Response;
use Gastos\Api\Services\PlanningService;
use PDO;

final class SettingsController
{
    public static function get(): void
    {
        Auth::requireUser();
        $planningId = Auth::requirePlanningId();
        $pdo = Database::connection();
        $hasUsd = self::hasUsdColumn($pdo);
        $cols = $hasUsd
            ? 'eur_to_brl, usd_to_brl, leisure_monthly_brl, montante_inicial_brl, cdi_monthly_rate'
            : 'eur_to_brl, leisure_monthly_brl, montante_inicial_brl, cdi_monthly_rate';
        $stmt = $pdo->prepare(
            "SELECT {$cols} FROM planning_settings WHERE planning_id = ?"
        );
        $stmt->execute([$planningId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            Response::json(self::defaults());
        }
        $eurFallback = (float) $row['eur_to_brl'];
        $usdFallback = $hasUsd ? (float) ($row['usd_to_brl'] ?? 5.0) : 5.0;
        Response::json([
            'eurToBrl' => $eurFallback,
            'eurToBrlFallback' => $eurFallback,
            'usdToBrl' => $usdFallback,
            'usdToBrlFallback' => $usdFallback,
            'cdiMonthlyRate' => (float) $row['cdi_monthly_rate'],
            'leisureMonthlyBrl' => (float) $row['leisure_monthly_brl'],
            'montanteInicialBrl' => (float) $row['montante_inicial_brl'],
        ]);
    }

    public static function update(): void
    {
        Auth::requireUser();
        $planningId = Auth::requirePlanningId();
        $body = json_decode(file_get_contents('php://input') ?: '{}', true) ?? [];
        $pdo = Database::connection();

        $eur = isset($body['eurToBrl']) ? (float) $body['eurToBrl'] : null;
        $usd = isset($body['usdToBrl']) ? (float) $body['usdToBrl'] : null;
        $cdi = isset($body['cdiMonthlyRate']) ? (float) $body['cdiMonthlyRate'] : null;
        $leisure = isset($body['leisureMonthlyBrl']) ? (float) $body['leisureMonthlyBrl'] : null;
        $montante = isset($body['montanteInicialBrl']) ? (float) $body['montanteInicialBrl'] : null;

        if (self::hasUsdColumn($pdo)) {
            $stmt = $pdo->prepare(
                'INSERT INTO planning_settings
                   (planning_id, eur_to_brl, usd_to_brl, cdi_monthly_rate, leisure_monthly_brl, montante_inicial_brl)
                 VALUES (?, COALESCE(?, 6), COALESCE(?, 5), COALESCE(?, 0.0095), COALESCE(?, 0), COALESCE(?, 0))
                 ON DUPLICATE KEY UPDATE
                   eur_to_brl = COALESCE(?, eur_to_brl),
                   usd_to_brl = COALESCE(?, usd_to_brl),
                   cdi_monthly_rate = COALESCE(?, cdi_monthly_rate),
                   leisure_monthly_brl = COALESCE(?, leisure_monthly_brl),
                   montante_inicial_brl = COALESCE(?, montante_inicial_brl)'
            );
            $stmt->execute([
                $planningId, $eur, $usd, $cdi, $leisure, $montante,
                $eur, $usd, $cdi, $leisure, $montante,
            ]);
        } else {
            $stmt = $pdo->prepare(
                'INSERT INTO planning_settings (planning_id, eur_to_brl, cdi_monthly_rate, leisure_monthly_brl, montante_inicial_brl)
                 VALUES (?, COALESCE(?, 6), COALESCE(?, 0.0095), COALESCE(?, 0), COALESCE(?, 0))
                 ON DUPLICATE KEY UPDATE
                   eur_to_brl = COALESCE(?, eur_to_brl),
                   cdi_monthly_rate = COALESCE(?, cdi_monthly_rate),
                   leisure_monthly_brl = COALESCE(?, leisure_monthly_brl),
                   montante_inicial_brl = COALESCE(?, montante_inicial_brl)'
            );
            $stmt->execute([
                $planningId, $eur, $cdi, $leisure, $montante,
                $eur, $cdi, $leisure, $montante,
            ]);
        }

        self::get();
    }

    private static function defaults(): array
    {
        return [
            'eurToBrl' => 6.0,
            'eurToBrlFallback' => 6.0,
            'usdToBrl' => 5.0,
            'usdToBrlFallback' => 5.0,
            'cdiMonthlyRate' => 0.0095,
            'leisureMonthlyBrl' => 0.0,
            'montanteInicialBrl' => 0.0,
        ];
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
               AND table_name = 'planning_settings'
               AND column_name = 'usd_to_brl'
             LIMIT 1"
        );
        $has = (bool) ($stmt && $stmt->fetchColumn());

        return $has;
    }
}
