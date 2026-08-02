<?php

declare(strict_types=1);

namespace Gastos\Api\Controllers;

use Gastos\Api\Auth;
use Gastos\Api\Database;
use Gastos\Api\Response;
use Gastos\Api\Services\PlanningAccess;
use PDO;

final class ProfileController
{
    public static function update(): void
    {
        $userId = Auth::requireUser();
        $body = json_decode(file_get_contents('php://input') ?: '{}', true) ?? [];
        $pdo = Database::connection();

        $name = isset($body['name']) ? trim((string) $body['name']) : null;
        $genderRaw = $body['gender'] ?? null;
        $gender = $genderRaw !== null && in_array($genderRaw, ['male', 'female'], true)
            ? $genderRaw
            : null;

        if ($name !== null && $name === '') {
            Response::error('Nome não pode ser vazio.', 422);
        }

        $sets = [];
        $params = [];
        if ($name !== null) {
            $sets[] = 'name = ?';
            $params[] = $name;
        }
        if ($gender !== null) {
            $sets[] = 'gender = ?';
            $params[] = $gender;
        }
        if ($sets === []) {
            Response::error('Nada para atualizar.', 422);
        }
        $params[] = $userId;
        $pdo->prepare('UPDATE users SET ' . implode(', ', $sets) . ' WHERE id = ?')
            ->execute($params);

        self::show();
    }

    public static function changePassword(): void
    {
        $userId = Auth::requireUser();
        $body = json_decode(file_get_contents('php://input') ?: '{}', true) ?? [];
        $current = (string) ($body['currentPassword'] ?? '');
        $next = (string) ($body['newPassword'] ?? '');

        if (strlen($next) < 8) {
            Response::error('Nova senha deve ter pelo menos 8 caracteres.', 422);
        }

        $pdo = Database::connection();
        $stmt = $pdo->prepare('SELECT password_hash FROM users WHERE id = ?');
        $stmt->execute([$userId]);
        $hash = $stmt->fetchColumn();
        if ($hash === false || !password_verify($current, (string) $hash)) {
            Response::error('Senha atual incorreta.', 401);
        }

        $pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ?')
            ->execute([password_hash($next, PASSWORD_DEFAULT), $userId]);

        Response::json(['ok' => true, 'message' => 'Senha alterada com sucesso.']);
    }

    public static function uploadAvatar(): void
    {
        $userId = Auth::requireUser();
        if (!isset($_FILES['avatar']) || !is_uploaded_file($_FILES['avatar']['tmp_name'])) {
            Response::error('Envie uma imagem (campo avatar).', 422);
        }

        $file = $_FILES['avatar'];
        if (($file['error'] ?? UPLOAD_ERR_OK) !== UPLOAD_ERR_OK) {
            $msg = match ($file['error'] ?? UPLOAD_ERR_OK) {
                UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE => 'Arquivo excede o limite do servidor PHP.',
                default => 'Falha no upload.',
            };
            Response::error($msg, 422);
        }

        $maxBytes = 5 * 1024 * 1024; // 5 MB
        if (($file['size'] ?? 0) > $maxBytes) {
            Response::error('A foto deve ter no máximo 5 MB.', 422);
        }

        $finfo = new \finfo(FILEINFO_MIME_TYPE);
        $mime = $finfo->file($file['tmp_name']) ?: '';
        $extMap = [
            'image/jpeg' => 'jpg',
            'image/png' => 'png',
            'image/webp' => 'webp',
            'image/gif' => 'gif',
        ];
        if (!isset($extMap[$mime])) {
            Response::error('Formato inválido. Use JPG, PNG, WebP ou GIF.', 422);
        }
        $ext = $extMap[$mime];

        $dir = dirname(__DIR__, 2) . '/storage/avatars';
        if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) {
            Response::error('Não foi possível guardar a imagem.', 500);
        }

        $relative = 'avatars/user-' . $userId . '.' . $ext;
        $dest = dirname(__DIR__, 2) . '/storage/' . $relative;
        foreach (['jpg', 'png', 'webp', 'gif'] as $old) {
            $oldPath = dirname(__DIR__, 2) . '/storage/avatars/user-' . $userId . '.' . $old;
            if (is_file($oldPath)) {
                @unlink($oldPath);
            }
        }
        if (!move_uploaded_file($file['tmp_name'], $dest)) {
            Response::error('Não foi possível guardar a imagem.', 500);
        }

        $pdo = Database::connection();
        $pdo->prepare('UPDATE users SET avatar_path = ? WHERE id = ?')
            ->execute([$relative, $userId]);

        self::show();
    }

    public static function avatar(int $targetUserId): void
    {
        $viewerId = Auth::requireUser();
        $pdo = Database::connection();
        PlanningAccess::assertUsersSharePlanning($pdo, $viewerId, $targetUserId);

        $stmt = $pdo->prepare('SELECT avatar_path FROM users WHERE id = ?');
        $stmt->execute([$targetUserId]);
        $path = $stmt->fetchColumn();
        if ($path === false || $path === null || $path === '') {
            Response::error('Sem foto.', 404);
        }

        $path = (string) $path;
        // Só caminhos relativos sob storage/avatars/user-{id}.{ext}
        if (!preg_match('#^avatars/user-\d+\.(jpg|png|webp|gif)$#', $path)) {
            Response::error('Arquivo não encontrado.', 404);
        }

        $storageRoot = realpath(dirname(__DIR__, 2) . '/storage');
        $full = $storageRoot !== false ? realpath($storageRoot . '/' . $path) : false;
        if (
            $storageRoot === false
            || $full === false
            || !str_starts_with($full, $storageRoot . DIRECTORY_SEPARATOR)
            || !is_file($full)
        ) {
            Response::error('Arquivo não encontrado.', 404);
        }

        $finfo = new \finfo(FILEINFO_MIME_TYPE);
        $mime = $finfo->file($full) ?: 'application/octet-stream';
        header('Content-Type: ' . $mime);
        header('Cache-Control: private, max-age=3600');
        readfile($full);
        exit;
    }

    public static function show(): void
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
        Response::json(['user' => AuthController::mapUser($user)]);
    }
}
