<?php

declare(strict_types=1);

namespace Gastos\Api;

use Gastos\Api\Database;
use Gastos\Api\Response;
use Gastos\Api\Services\PlanningService;
use PDO;

final class Auth
{
    public static function bearerUserId(): ?int
    {
        $header = self::authorizationHeader();
        if (!preg_match('/^Bearer\s+(.+)$/i', $header, $m)) {
            return null;
        }
        return self::validateToken($m[1]);
    }

    private static function authorizationHeader(): string
    {
        if (!empty($_SERVER['HTTP_AUTHORIZATION'])) {
            return $_SERVER['HTTP_AUTHORIZATION'];
        }
        if (!empty($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
            return $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
        }
        if (function_exists('apache_request_headers')) {
            $headers = apache_request_headers();
            foreach ($headers as $key => $value) {
                if (strtolower($key) === 'authorization') {
                    return $value;
                }
            }
        }
        return '';
    }

    public static function planningIdHeader(): ?int
    {
        $raw = $_SERVER['HTTP_X_PLANNING_ID'] ?? $_GET['planningId'] ?? '';
        if ($raw === '' || $raw === null) {
            return null;
        }
        $id = (int) $raw;
        return $id > 0 ? $id : null;
    }

    public static function requireUser(): int
    {
        $id = self::bearerUserId();
        if ($id === null) {
            Response::error('Não autorizado.', 401);
        }
        return $id;
    }

    public static function requirePlanningId(): int
    {
        $userId = self::requireUser();
        $pdo = Database::connection();
        $planningId = self::planningIdHeader();
        if ($planningId !== null && $planningId <= 0) {
            Response::error('Planejamento inválido.', 422);
        }
        if ($planningId === null) {
            $planningId = PlanningService::defaultPlanningForUser($pdo, $userId);
        }
        PlanningService::assertMember($pdo, $planningId, $userId);
        return $planningId;
    }

    /** @deprecated use requirePlanningId() */
    public static function householdUserId(): int
    {
        return self::requirePlanningId();
    }

    public static function createToken(int $userId): string
    {
        $payload = base64_encode(json_encode([
            'sub' => $userId,
            'exp' => time() + 60 * 60 * 24 * 30,
        ], JSON_THROW_ON_ERROR));
        $sig = hash_hmac('sha256', $payload, Config::get('JWT_SECRET'));
        return $payload . '.' . $sig;
    }

    public static function validateToken(string $token): ?int
    {
        $parts = explode('.', $token, 2);
        if (count($parts) !== 2) {
            return null;
        }
        [$payload, $sig] = $parts;
        $expected = hash_hmac('sha256', $payload, Config::get('JWT_SECRET'));
        if (!hash_equals($expected, $sig)) {
            return null;
        }
        try {
            $data = json_decode(base64_decode($payload, true), true, 512, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            return null;
        }
        if (($data['exp'] ?? 0) < time()) {
            return null;
        }
        return isset($data['sub']) ? (int) $data['sub'] : null;
    }
}
