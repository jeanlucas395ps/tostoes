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
        $stmt = $pdo->prepare(
            'SELECT eur_to_brl, leisure_monthly_brl, montante_inicial_brl, cdi_monthly_rate
             FROM planning_settings WHERE planning_id = ?'
        );
        $stmt->execute([$planningId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            Response::json(self::defaults());
        }
        $fallback = (float) $row['eur_to_brl'];
        Response::json([
            'eurToBrl' => $fallback,
            'eurToBrlFallback' => $fallback,
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
        $cdi = isset($body['cdiMonthlyRate']) ? (float) $body['cdiMonthlyRate'] : null;
        $leisure = isset($body['leisureMonthlyBrl']) ? (float) $body['leisureMonthlyBrl'] : null;
        $montante = isset($body['montanteInicialBrl']) ? (float) $body['montanteInicialBrl'] : null;

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

        self::get();
    }

    private static function defaults(): array
    {
        return [
            'eurToBrl' => 6.0,
            'eurToBrlFallback' => 6.0,
            'cdiMonthlyRate' => 0.0095,
            'leisureMonthlyBrl' => 0.0,
            'montanteInicialBrl' => 0.0,
        ];
    }
}
