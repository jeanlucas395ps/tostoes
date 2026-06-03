<?php

declare(strict_types=1);

namespace Gastos\Api\Controllers;

use Gastos\Api\Auth;
use Gastos\Api\Database;
use Gastos\Api\Response;
use Gastos\Api\Services\PasswordResetService;
use Gastos\Api\Services\PlanningInviteService;
use Gastos\Api\Services\PlanningService;
use PDO;

final class AuthController
{
    public static function login(): void
    {
        $body = json_decode(file_get_contents('php://input') ?: '{}', true) ?? [];
        $username = strtolower(trim((string) ($body['username'] ?? '')));
        $password = (string) ($body['password'] ?? '');

        if ($username === '' || $password === '') {
            Response::error('Usuário e senha são obrigatórios.', 422);
        }

        $pdo = Database::connection();
        $stmt = $pdo->prepare(
            'SELECT id, username, email, password_hash, name, gender FROM users WHERE username = ? LIMIT 1'
        );
        $stmt->execute([$username]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$user || !password_verify($password, $user['password_hash'])) {
            Response::error('Credenciais inválidas.', 401);
        }

        $userId = (int) $user['id'];
        Response::json([
            'token' => Auth::createToken($userId),
            'user' => self::mapUser($user),
            'plannings' => PlanningService::listForUser($pdo, $userId),
        ]);
    }

    public static function register(): void
    {
        $body = json_decode(file_get_contents('php://input') ?: '{}', true) ?? [];
        $username = strtolower(trim((string) ($body['username'] ?? '')));
        $password = (string) ($body['password'] ?? '');
        $name = trim((string) ($body['name'] ?? ''));
        $email = strtolower(trim((string) ($body['email'] ?? '')));
        $inviteToken = trim((string) ($body['inviteToken'] ?? ''));
        $genderRaw = $body['gender'] ?? 'male';
        $gender = in_array($genderRaw, ['male', 'female'], true) ? $genderRaw : 'male';

        if ($username === '' || strlen($username) < 3) {
            Response::error('Usuário deve ter pelo menos 3 caracteres.', 422);
        }
        if (!preg_match('/^[a-z0-9_]+$/', $username)) {
            Response::error('Usuário só pode conter letras minúsculas, números e _.', 422);
        }
        if (strlen($password) < 8) {
            Response::error('Senha deve ter pelo menos 8 caracteres.', 422);
        }
        if ($name === '') {
            Response::error('Nome é obrigatório.', 422);
        }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            Response::error('Informe um e-mail válido.', 422);
        }

        $pdo = Database::connection();
        $check = $pdo->prepare('SELECT 1 FROM users WHERE username = ? OR email = ? LIMIT 1');
        $check->execute([$username, $email]);
        if ($check->fetch()) {
            Response::error('Usuário ou e-mail já cadastrado.', 422);
        }

        $pdo->prepare(
            'INSERT INTO users (username, email, password_hash, name, gender) VALUES (?, ?, ?, ?, ?)'
        )->execute([$username, $email, password_hash($password, PASSWORD_DEFAULT), $name, $gender]);

        $userId = (int) $pdo->lastInsertId();
        $defaultPlanningId = null;

        if ($inviteToken !== '') {
            $accepted = PlanningInviteService::acceptForNewUser($pdo, $inviteToken, $userId, $email);
            $defaultPlanningId = $accepted['planningId'];
        } else {
            $planningName = trim((string) ($body['planningName'] ?? '')) ?: "Planejamento de {$name}";
            $defaultPlanningId = PlanningService::create($pdo, $userId, $planningName);
        }

        $stmt = $pdo->prepare('SELECT id, username, email, name, gender FROM users WHERE id = ?');
        $stmt->execute([$userId]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        Response::json([
            'token' => Auth::createToken($userId),
            'user' => self::mapUser($user ?: []),
            'plannings' => PlanningService::listForUser($pdo, $userId),
            'defaultPlanningId' => $defaultPlanningId,
        ], 201);
    }

    public static function me(): void
    {
        $userId = Auth::requireUser();
        $pdo = Database::connection();
        $stmt = $pdo->prepare(
            'SELECT id, username, email, name, gender, avatar_path FROM users WHERE id = ?'
        );
        $stmt->execute([$userId]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$user) {
            Response::error('Usuário não encontrado.', 404);
        }
        Response::json([
            'user' => self::mapUser($user),
            'plannings' => PlanningService::listForUser($pdo, $userId),
        ]);
    }

    public static function forgotPassword(): void
    {
        $body = json_decode(file_get_contents('php://input') ?: '{}', true) ?? [];
        $email = strtolower(trim((string) ($body['email'] ?? '')));
        $pdo = Database::connection();
        PasswordResetService::request($pdo, $email);
        Response::json([
            'ok' => true,
            'message' => 'Se o e-mail estiver cadastrado, você receberá um link em breve.',
        ]);
    }

    public static function resetPassword(): void
    {
        $body = json_decode(file_get_contents('php://input') ?: '{}', true) ?? [];
        $token = trim((string) ($body['token'] ?? ''));
        $password = (string) ($body['password'] ?? '');
        $pdo = Database::connection();
        PasswordResetService::reset($pdo, $token, $password);
        Response::json(['ok' => true, 'message' => 'Senha redefinida. Faça login com a nova senha.']);
    }

    public static function householdUsers(): void
    {
        Auth::requireUser();
        $planningId = Auth::requirePlanningId();
        $pdo = Database::connection();
        Response::json([
            'items' => PlanningService::members($pdo, $planningId, Auth::requireUser()),
        ]);
    }

    /** @param array<string, mixed> $user */
    public static function mapUser(array $user): array
    {
        $avatarPath = $user['avatar_path'] ?? null;
        $avatarUrl = null;
        if ($avatarPath !== null && $avatarPath !== '') {
            $storageFile = dirname(__DIR__, 2) . '/storage/' . $avatarPath;
            $v = is_file($storageFile) ? (string) filemtime($storageFile) : (string) time();
            $avatarUrl = '/auth/avatars/' . (int) $user['id'] . '?v=' . $v;
        }

        return [
            'id' => (int) $user['id'],
            'username' => $user['username'],
            'email' => $user['email'] ?? null,
            'name' => $user['name'],
            'gender' => $user['gender'] ?? 'male',
            'avatarUrl' => $avatarUrl,
        ];
    }
}
