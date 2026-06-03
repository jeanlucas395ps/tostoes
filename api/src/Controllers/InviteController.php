<?php

declare(strict_types=1);

namespace Gastos\Api\Controllers;

use Gastos\Api\Auth;
use Gastos\Api\Database;
use Gastos\Api\Response;
use Gastos\Api\Services\MailService;
use Gastos\Api\Services\PlanningInviteService;
use Gastos\Api\Services\PlanningService;

final class InviteController
{
    public static function show(string $token): void
    {
        $pdo = Database::connection();
        Response::json([
            'invite' => PlanningInviteService::preview($pdo, $token),
        ]);
    }

    public static function accept(string $token): void
    {
        $userId = Auth::requireUser();
        $pdo = Database::connection();
        $result = PlanningInviteService::accept($pdo, $token, $userId);
        $plannings = PlanningService::listForUser($pdo, $userId);

        Response::json([
            'planningId' => $result['planningId'],
            'planningName' => $result['planningName'],
            'plannings' => $plannings,
            'message' => 'Convite aceito! Você agora faz parte do planejamento.',
        ]);
    }
}
