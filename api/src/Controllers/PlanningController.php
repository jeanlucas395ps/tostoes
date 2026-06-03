<?php

declare(strict_types=1);

namespace Gastos\Api\Controllers;

use Gastos\Api\Auth;
use Gastos\Api\Database;
use Gastos\Api\Response;
use Gastos\Api\Services\MailService;
use Gastos\Api\Services\PlanningAccess;
use Gastos\Api\Services\PlanningInviteService;
use Gastos\Api\Services\PlanningService;
use PDO;

final class PlanningController
{
    public static function index(): void
    {
        $userId = Auth::requireUser();
        $pdo = Database::connection();
        Response::json(['items' => PlanningService::listForUser($pdo, $userId)]);
    }

    public static function store(): void
    {
        $userId = Auth::requireUser();
        $body = json_decode(file_get_contents('php://input') ?: '{}', true) ?? [];
        $name = trim((string) ($body['name'] ?? 'Novo planejamento'));

        $pdo = Database::connection();
        $id = PlanningService::create($pdo, $userId, $name);
        $items = PlanningService::listForUser($pdo, $userId);
        $planning = null;
        foreach ($items as $item) {
            if ($item['id'] === $id) {
                $planning = $item;
                break;
            }
        }
        Response::json(['item' => $planning], 201);
    }

    public static function members(int $planningId): void
    {
        $userId = Auth::requireUser();
        PlanningAccess::requireMemberForPlanning($planningId);
        $pdo = Database::connection();
        Response::json([
            'items' => PlanningService::members($pdo, $planningId, $userId),
        ]);
    }

    public static function addMember(int $planningId): void
    {
        PlanningAccess::requireMemberForPlanning($planningId);
        $userId = Auth::requireUser();
        $body = json_decode(file_get_contents('php://input') ?: '{}', true) ?? [];
        $email = strtolower(trim((string) ($body['email'] ?? '')));
        $bodyPlanningId = isset($body['planningId']) ? (int) $body['planningId'] : 0;

        if ($bodyPlanningId > 0 && $bodyPlanningId !== $planningId) {
            Response::error('O planejamento informado não confere com o convite.', 422);
        }
        if ($email === '') {
            Response::error('Informe o e-mail para convidar.', 422);
        }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            Response::error('Informe um e-mail válido.', 422);
        }

        $pdo = Database::connection();
        $result = PlanningInviteService::createAndSend(
            $pdo,
            $planningId,
            $userId,
            $email
        );

        $planningName = PlanningInviteService::planningName($pdo, $planningId);

        $payload = [
            'message' => 'Convite enviado para ' . $result['email']
                . ' no planejamento "' . $planningName . '".',
            'email' => $result['email'],
            'planningId' => $planningId,
            'planningName' => $planningName,
        ];
        if (MailService::isLogDriver()) {
            $payload['inviteUrl'] = $result['inviteUrl'];
        }

        Response::json($payload, 201);
    }
}
