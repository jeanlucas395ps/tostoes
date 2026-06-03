<?php

declare(strict_types=1);

namespace Gastos\Api\Services;

use Gastos\Api\Config;
use Gastos\Api\Response;
use PDO;

final class PasswordResetService
{
    private const TTL_MINUTES = 60;

    public static function request(PDO $pdo, string $email): void
    {
        $email = strtolower(trim($email));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            Response::error('Informe um e-mail válido.', 422);
        }

        $stmt = $pdo->prepare('SELECT id, name FROM users WHERE email = ? LIMIT 1');
        $stmt->execute([$email]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        // Resposta genérica (evita enumeração de e-mails)
        if (!$user) {
            return;
        }

        $userId = (int) $user['id'];
        $token = bin2hex(random_bytes(32));
        $hash = hash('sha256', $token);
        $expires = (new \DateTimeImmutable('+' . self::TTL_MINUTES . ' minutes'))->format('Y-m-d H:i:s');

        $pdo->prepare(
            'UPDATE password_reset_tokens SET used_at = NOW()
             WHERE user_id = ? AND used_at IS NULL'
        )->execute([$userId]);

        $pdo->prepare(
            'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)'
        )->execute([$userId, $hash, $expires]);

        $resetUrl = rtrim(Config::get('APP_URL', 'http://localhost:4200'), '/')
            . '/redefinir-senha?token=' . $token;

        $name = (string) $user['name'];
        $subject = 'Redefinir senha , Tostoes';
        $html = '<p>Olá, ' . htmlspecialchars($name, ENT_QUOTES, 'UTF-8') . '.</p>'
            . '<p>Recebemos um pedido para redefinir sua senha. O link expira em '
            . self::TTL_MINUTES . ' minutos.</p>'
            . '<p><a href="' . htmlspecialchars($resetUrl, ENT_QUOTES, 'UTF-8') . '">Redefinir senha</a></p>'
            . '<p>Se não foi você, ignore este e-mail.</p>';
        MailService::send($email, $subject, $html, $resetUrl);
    }

    public static function reset(PDO $pdo, string $token, string $newPassword): void
    {
        $token = trim($token);
        if (strlen($token) < 32) {
            Response::error('Link inválido ou expirado.', 422);
        }
        if (strlen($newPassword) < 8) {
            Response::error('Senha deve ter pelo menos 8 caracteres.', 422);
        }

        $hash = hash('sha256', $token);
        $stmt = $pdo->prepare(
            'SELECT id, user_id, expires_at, used_at FROM password_reset_tokens
             WHERE token_hash = ? LIMIT 1'
        );
        $stmt->execute([$hash]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row || $row['used_at'] !== null) {
            Response::error('Link inválido ou expirado.', 422);
        }
        if (strtotime((string) $row['expires_at']) < time()) {
            Response::error('Link expirado. Solicite um novo e-mail.', 422);
        }

        $userId = (int) $row['user_id'];
        $pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ?')
            ->execute([password_hash($newPassword, PASSWORD_DEFAULT), $userId]);
        $pdo->prepare('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ?')
            ->execute([(int) $row['id']]);
    }
}
