<?php

declare(strict_types=1);

namespace Gastos\Api\Controllers;

use Gastos\Api\Auth;
use Gastos\Api\Database;
use Gastos\Api\Response;
use Gastos\Api\Services\FxRateService;

final class FxRateController
{
    public static function eurToBrl(): void
    {
        Auth::requireUser();
        $planningId = Auth::requirePlanningId();
        $date = FxRateService::normalizeDate($_GET['date'] ?? null);
        $pdo = Database::connection();
        $fx = FxRateService::resolveEurToBrl($pdo, $planningId, $date);

        Response::json([
            'date' => $fx['date'],
            'eurToBrl' => $fx['rate'],
            'source' => $fx['source'],
            'fallback' => $fx['source'] === 'fallback',
        ]);
    }

    public static function usdToBrl(): void
    {
        Auth::requireUser();
        $planningId = Auth::requirePlanningId();
        $date = FxRateService::normalizeDate($_GET['date'] ?? null);
        $pdo = Database::connection();
        $fx = FxRateService::resolveUsdToBrl($pdo, $planningId, $date);

        Response::json([
            'date' => $fx['date'],
            'usdToBrl' => $fx['rate'],
            'source' => $fx['source'],
            'fallback' => $fx['source'] === 'fallback',
        ]);
    }
}
