<?php

declare(strict_types=1);

namespace Gastos\Api\Services;

use Gastos\Api\Config;
use Gastos\Api\Response;
use PDO;

final class PlanningInviteService
{
    private const EXPIRE_DAYS = 7;

    /** @return array{token: string, inviteUrl: string, email: string} */
    public static function createAndSend(PDO $pdo, int $planningId, int $inviterId, string $email): array
    {
        PlanningService::assertMember($pdo, $planningId, $inviterId);

        $email = strtolower(trim($email));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            Response::error('Informe um e-mail válido.', 422);
        }

        $inviterEmail = self::userEmail($pdo, $inviterId);
        if ($inviterEmail !== null && strcasecmp($inviterEmail, $email) === 0) {
            Response::error('Você não pode convidar a si mesmo.', 422);
        }

        if (self::isEmailAlreadyMember($pdo, $planningId, $email)) {
            Response::error('Este e-mail já faz parte do planejamento.', 422);
        }

        $pdo->prepare(
            'UPDATE planning_invites SET status = "revoked"
             WHERE planning_id = ? AND email = ? AND status = "pending"'
        )->execute([$planningId, $email]);

        $token = bin2hex(random_bytes(32));
        $expiresAt = (new \DateTimeImmutable('+' . self::EXPIRE_DAYS . ' days'))->format('Y-m-d H:i:s');

        $pdo->prepare(
            'INSERT INTO planning_invites
             (planning_id, email, token, invited_by_user_id, expires_at)
             VALUES (?, ?, ?, ?, ?)'
        )->execute([$planningId, $email, $token, $inviterId, $expiresAt]);

        $planningName = self::planningName($pdo, $planningId);
        $inviterName = self::userName($pdo, $inviterId);
        $inviteUrl = rtrim(Config::get('APP_URL', 'http://localhost:4200'), '/') . '/convite/' . $token;

        $mailOk = self::sendInviteEmail($email, $planningName, $inviterName, $inviteUrl);

        return [
            'token' => $token,
            'inviteUrl' => $inviteUrl,
            'email' => $email,
            'mailSent' => $mailOk && !MailService::isLogDriver(),
            'mailLogged' => MailService::isLogDriver(),
        ];
    }

    /** @return array<string, mixed> */
    public static function preview(PDO $pdo, string $token): array
    {
        $invite = self::fetchInvite($pdo, $token);
        self::markExpiredIfNeeded($pdo, $invite);

        $planningName = self::planningName($pdo, (int) $invite['planning_id']);
        $inviterName = self::userName($pdo, (int) $invite['invited_by_user_id']);

        return [
            'token' => $invite['token'],
            'email' => $invite['email'],
            'status' => $invite['status'],
            'expiresAt' => $invite['expires_at'],
            'planningId' => (int) $invite['planning_id'],
            'planningName' => $planningName,
            'inviterName' => $inviterName,
            'expired' => $invite['status'] === 'expired',
        ];
    }

    /** @return array{planningId: int, planningName: string} */
    public static function accept(PDO $pdo, string $token, int $userId): array
    {
        $invite = self::fetchInvite($pdo, $token);
        self::markExpiredIfNeeded($pdo, $invite);

        if ($invite['status'] === 'accepted') {
            Response::error('Este convite já foi aceito.', 422);
        }
        if ($invite['status'] !== 'pending') {
            Response::error('Convite inválido ou expirado.', 422);
        }

        $userEmail = self::userEmail($pdo, $userId);
        if ($userEmail === null || strcasecmp($userEmail, (string) $invite['email']) !== 0) {
            Response::error('Entre com a conta do e-mail convidado para aceitar.', 403);
        }

        $planningId = (int) $invite['planning_id'];
        if (self::isUserMember($pdo, $planningId, $userId)) {
            self::markAccepted($pdo, (int) $invite['id']);
            return [
                'planningId' => $planningId,
                'planningName' => self::planningName($pdo, $planningId),
            ];
        }

        $pdo->prepare(
            'INSERT INTO planning_members (planning_id, user_id, role) VALUES (?, ?, ?)'
        )->execute([$planningId, $userId, 'member']);

        self::markAccepted($pdo, (int) $invite['id']);

        return [
            'planningId' => $planningId,
            'planningName' => self::planningName($pdo, $planningId),
        ];
    }

    public static function acceptForNewUser(PDO $pdo, string $token, int $userId, string $email): array
    {
        $invite = self::fetchInvite($pdo, $token);
        self::markExpiredIfNeeded($pdo, $invite);

        if ($invite['status'] !== 'pending') {
            Response::error('Convite inválido ou expirado.', 422);
        }
        if (strcasecmp($email, (string) $invite['email']) !== 0) {
            Response::error('O e-mail da conta deve ser o mesmo do convite.', 422);
        }

        return self::accept($pdo, $token, $userId);
    }

    /** @return array<string, mixed> */
    private static function fetchInvite(PDO $pdo, string $token): array
    {
        $token = trim($token);
        if ($token === '') {
            Response::error('Convite não encontrado.', 404);
        }

        $stmt = $pdo->prepare(
            'SELECT * FROM planning_invites WHERE token = ? LIMIT 1'
        );
        $stmt->execute([$token]);
        $invite = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$invite) {
            Response::error('Convite não encontrado.', 404);
        }

        return $invite;
    }

    /** @param array<string, mixed> $invite */
    private static function markExpiredIfNeeded(PDO $pdo, array $invite): void
    {
        if ($invite['status'] !== 'pending') {
            return;
        }
        if (strtotime((string) $invite['expires_at']) >= time()) {
            return;
        }
        $pdo->prepare('UPDATE planning_invites SET status = "expired" WHERE id = ?')
            ->execute([(int) $invite['id']]);
        $invite['status'] = 'expired';
    }

    private static function markAccepted(PDO $pdo, int $inviteId): void
    {
        $pdo->prepare(
            'UPDATE planning_invites SET status = "accepted", accepted_at = NOW() WHERE id = ?'
        )->execute([$inviteId]);
    }

    private static function isEmailAlreadyMember(PDO $pdo, int $planningId, string $email): bool
    {
        $stmt = $pdo->prepare(
            'SELECT 1 FROM planning_members pm
             INNER JOIN users u ON u.id = pm.user_id
             WHERE pm.planning_id = ? AND LOWER(u.email) = LOWER(?)
             LIMIT 1'
        );
        $stmt->execute([$planningId, $email]);

        return (bool) $stmt->fetch();
    }

    private static function isUserMember(PDO $pdo, int $planningId, int $userId): bool
    {
        $stmt = $pdo->prepare(
            'SELECT 1 FROM planning_members WHERE planning_id = ? AND user_id = ? LIMIT 1'
        );
        $stmt->execute([$planningId, $userId]);

        return (bool) $stmt->fetch();
    }

    public static function planningName(PDO $pdo, int $planningId): string
    {
        $stmt = $pdo->prepare('SELECT name FROM plannings WHERE id = ? LIMIT 1');
        $stmt->execute([$planningId]);

        return (string) ($stmt->fetchColumn() ?: 'Planejamento');
    }

    private static function userName(PDO $pdo, int $userId): string
    {
        $stmt = $pdo->prepare('SELECT name FROM users WHERE id = ? LIMIT 1');
        $stmt->execute([$userId]);

        return (string) ($stmt->fetchColumn() ?: 'Alguém');
    }

    private static function userEmail(PDO $pdo, int $userId): ?string
    {
        $stmt = $pdo->prepare('SELECT email FROM users WHERE id = ? LIMIT 1');
        $stmt->execute([$userId]);
        $email = $stmt->fetchColumn();

        return $email !== false && $email !== null ? (string) $email : null;
    }

    private static function sendInviteEmail(
        string $email,
        string $planningName,
        string $inviterName,
        string $inviteUrl
    ): bool {
        $subject = "{$inviterName} convidou você para \"{$planningName}\"";
        $safeName = htmlspecialchars($planningName, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $safeInviter = htmlspecialchars($inviterName, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $safeUrl = htmlspecialchars($inviteUrl, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $html = <<<HTML
<!DOCTYPE html>
<html lang="pt-BR">
<body style="font-family: Arial, sans-serif; line-height: 1.5; color: #1a1d2e;">
  <h2 style="margin-bottom: 0.5rem;">Convite para planejamento</h2>
  <p><strong>{$safeInviter}</strong> convidou você para participar do planejamento <strong>{$safeName}</strong> no Tostoes.</p>
  <p>
    <a href="{$safeUrl}" style="display:inline-block;padding:12px 20px;background:#5e5ce6;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold;">
      Aceitar convite
    </a>
  </p>
  <p style="font-size: 13px; color: #666;">Se o botão não funcionar, copie e cole este link no navegador:<br>{$safeUrl}</p>
  <p style="font-size: 12px; color: #999;">Este convite expira em 7 dias.</p>
</body>
</html>
HTML;

        $text = "{$inviterName} convidou você para o planejamento \"{$planningName}\".\n\nAceite em: {$inviteUrl}\n\nExpira em 7 dias.";

        return MailService::send($email, $subject, $html, $text);
    }
}
