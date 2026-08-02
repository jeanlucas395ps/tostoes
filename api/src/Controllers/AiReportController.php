<?php

declare(strict_types=1);

namespace Gastos\Api\Controllers;

use DateTimeImmutable;
use DateTimeZone;
use Gastos\Api\Auth;
use Gastos\Api\Config;
use Gastos\Api\Database;
use Gastos\Api\RateLimiter;
use Gastos\Api\Response;
use Gastos\Api\Services\AiReportDataCollector;
use Gastos\Api\Services\OpenAiService;
use PDO;
use RuntimeException;
use Throwable;

final class AiReportController
{
    private const MONTH_LABELS = [
        1 => 'Janeiro', 2 => 'Fevereiro', 3 => 'Março', 4 => 'Abril',
        5 => 'Maio', 6 => 'Junho', 7 => 'Julho', 8 => 'Agosto',
        9 => 'Setembro', 10 => 'Outubro', 11 => 'Novembro', 12 => 'Dezembro',
    ];

    /** Tempo máximo para geração (PHP + curl OpenAI). */
    private const GENERATION_TIMEOUT_SECONDS = 180;

    public static function index(): void
    {
        $userId = Auth::requireUser();
        $planningId = Auth::requirePlanningId();
        $pdo = Database::connection();

        $stmt = $pdo->prepare(
            'SELECT id, period_start, period_end, months_count, title, content_json, status, error_message, created_at
             FROM ai_reports
             WHERE planning_id = ? AND user_id = ? AND status = "completed"
             ORDER BY created_at DESC, id DESC
             LIMIT 100'
        );
        $stmt->execute([$planningId, $userId]);
        $items = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $items[] = self::mapListItem($row);
        }

        Response::json([
            'items' => $items,
            'dailyLimit' => self::dailyLimit(),
            'remainingToday' => self::remainingToday($pdo, $userId),
        ]);
    }

    public static function show(int $id): void
    {
        $userId = Auth::requireUser();
        $planningId = Auth::requirePlanningId();
        $pdo = Database::connection();

        $stmt = $pdo->prepare(
            'SELECT id, period_start, period_end, months_count, title, content_json, status, error_message, created_at
             FROM ai_reports
             WHERE id = ? AND planning_id = ? AND user_id = ? AND status = "completed"
             LIMIT 1'
        );
        $stmt->execute([$id, $planningId, $userId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            Response::error('Relatório não encontrado.', 404);
        }

        Response::json(['item' => self::mapDetail($row)]);
    }

    public static function store(): void
    {
        self::extendExecutionTime();

        $userId = Auth::requireUser();
        $planningId = Auth::requirePlanningId();

        // Limites agressivos por usuário e por IP (custo OpenAI).
        RateLimiter::enforce('ai_reports_user', 'user:' . $userId);
        RateLimiter::enforce('ai_reports_ip');

        $body = json_decode(file_get_contents('php://input') ?: '{}', true) ?? [];
        if (!is_array($body)) {
            Response::error('JSON inválido.', 422);
        }

        $periodStart = trim((string) ($body['periodStart'] ?? ''));
        $periodEnd = trim((string) ($body['periodEnd'] ?? $periodStart));

        try {
            $period = AiReportDataCollector::parsePeriod($periodStart, $periodEnd);
        } catch (\InvalidArgumentException $e) {
            Response::error($e->getMessage(), 422);
        }

        $pdo = Database::connection();
        $months = $period['months'];
        $monthsCount = count($months);
        $titleFallback = self::defaultTitle($months);

        // Reserva atômica: evita rajada paralela burlar o limite diário.
        $reportId = self::reserveSlot(
            $pdo,
            $planningId,
            $userId,
            $period['periodStart'],
            $period['periodEnd'],
            $monthsCount,
            $titleFallback
        );

        try {
            $payload = AiReportDataCollector::collect($pdo, $planningId, $months);
            $report = OpenAiService::generateFinancialReport(
                $payload,
                self::GENERATION_TIMEOUT_SECONDS
            );
            $title = trim((string) ($report['title'] ?? '')) ?: $titleFallback;
            $contentJson = json_encode($report, JSON_UNESCAPED_UNICODE);

            $upd = $pdo->prepare(
                'UPDATE ai_reports
                 SET title = ?, content_json = ?, status = "completed", error_message = NULL
                 WHERE id = ? AND user_id = ?'
            );
            $upd->execute([$title, $contentJson, $reportId, $userId]);
        } catch (Throwable $e) {
            $del = $pdo->prepare('DELETE FROM ai_reports WHERE id = ? AND user_id = ? AND status = "pending"');
            $del->execute([$reportId, $userId]);

            $msg = $e instanceof RuntimeException
                ? $e->getMessage()
                : 'Falha ao gerar relatório com IA.';
            Response::error($msg, 502);
        }

        $stmt = $pdo->prepare(
            'SELECT id, period_start, period_end, months_count, title, content_json, status, error_message, created_at
             FROM ai_reports WHERE id = ? LIMIT 1'
        );
        $stmt->execute([$reportId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        Response::json([
            'item' => self::mapDetail($row),
            'remainingToday' => self::remainingToday($pdo, $userId),
        ], 201);
    }

    public static function destroy(int $id): void
    {
        $userId = Auth::requireUser();
        $planningId = Auth::requirePlanningId();
        $pdo = Database::connection();

        $stmt = $pdo->prepare(
            'DELETE FROM ai_reports WHERE id = ? AND planning_id = ? AND user_id = ?'
        );
        $stmt->execute([$id, $planningId, $userId]);
        if ($stmt->rowCount() === 0) {
            Response::error('Relatório não encontrado.', 404);
        }

        Response::json(['ok' => true]);
    }

    private static function extendExecutionTime(): void
    {
        $seconds = self::GENERATION_TIMEOUT_SECONDS + 30;
        if (function_exists('set_time_limit')) {
            @set_time_limit($seconds);
        }
        @ini_set('max_execution_time', (string) $seconds);
        @ini_set('default_socket_timeout', (string) $seconds);
        // Evita buffering intermediário que pode fechar a conexão cedo em alguns hosts.
        if (function_exists('ignore_user_abort')) {
            ignore_user_abort(true);
        }
    }

    /**
     * Reserva um slot do limite diário (pending) com lock por usuário.
     */
    private static function reserveSlot(
        PDO $pdo,
        int $planningId,
        int $userId,
        string $periodStart,
        string $periodEnd,
        int $monthsCount,
        string $title
    ): int {
        $lockName = 'ai_report_u_' . $userId;
        $gotLock = false;
        try {
            $lockStmt = $pdo->prepare('SELECT GET_LOCK(?, 15)');
            $lockStmt->execute([$lockName]);
            $gotLock = (int) $lockStmt->fetchColumn() === 1;
            if (!$gotLock) {
                Response::error('Já existe uma geração em andamento. Aguarde e tente de novo.', 429);
            }

            $remaining = self::remainingToday($pdo, $userId);
            if ($remaining <= 0) {
                Response::error(
                    'Você atingiu o limite de ' . self::dailyLimit() . ' relatórios por dia. Tente novamente amanhã.',
                    429
                );
            }

            // Limpa pendentes órfãos (>10 min) para não travar o limite.
            $cleanup = $pdo->prepare(
                'DELETE FROM ai_reports
                 WHERE user_id = ? AND status = "pending"
                   AND created_at < DATE_SUB(NOW(), INTERVAL 3 MINUTE)'
            );
            $cleanup->execute([$userId]);

            $ins = $pdo->prepare(
                'INSERT INTO ai_reports
                 (planning_id, user_id, period_start, period_end, months_count, title, content_json, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, "pending")'
            );
            $ins->execute([
                $planningId,
                $userId,
                $periodStart,
                $periodEnd,
                $monthsCount,
                $title,
                '{}',
            ]);

            return (int) $pdo->lastInsertId();
        } finally {
            if ($gotLock) {
                $rel = $pdo->prepare('SELECT RELEASE_LOCK(?)');
                $rel->execute([$lockName]);
            }
        }
    }

    private static function dailyLimit(): int
    {
        $limit = (int) Config::get('AI_REPORTS_DAILY_LIMIT', '2');

        return max(1, $limit);
    }

    private static function remainingToday(PDO $pdo, int $userId): int
    {
        $tzName = (string) Config::get('APP_TIMEZONE', 'America/Sao_Paulo');
        try {
            $tz = new DateTimeZone($tzName);
        } catch (Throwable) {
            $tz = new DateTimeZone('America/Sao_Paulo');
        }
        $start = (new DateTimeImmutable('now', $tz))->setTime(0, 0, 0);
        $end = $start->modify('+1 day');

        // completed + pending (em andamento) consomem a cota do dia.
        $stmt = $pdo->prepare(
            'SELECT COUNT(*) FROM ai_reports
             WHERE user_id = ? AND status IN ("completed", "pending")
               AND created_at >= ? AND created_at < ?'
        );
        $stmt->execute([
            $userId,
            $start->format('Y-m-d H:i:s'),
            $end->format('Y-m-d H:i:s'),
        ]);
        $used = (int) $stmt->fetchColumn();

        return max(0, self::dailyLimit() - $used);
    }

    /** @param list<array{year: int, month: int}> $months */
    private static function defaultTitle(array $months): string
    {
        $labels = array_map(
            static fn (array $m): string => self::MONTH_LABELS[$m['month']] . '/' . $m['year'],
            $months
        );
        if (count($labels) === 1) {
            return 'Relatório — ' . $labels[0];
        }

        return 'Relatório — ' . $labels[0] . ' a ' . $labels[count($labels) - 1];
    }

    /** @param array<string, mixed> $row */
    private static function mapListItem(array $row): array
    {
        $content = self::decodeContent($row['content_json'] ?? null);
        $health = is_array($content['financialHealth'] ?? null) ? $content['financialHealth'] : null;

        return [
            'id' => (int) $row['id'],
            'periodStart' => $row['period_start'],
            'periodEnd' => $row['period_end'],
            'monthsCount' => (int) $row['months_count'],
            'title' => $row['title'],
            'status' => $row['status'],
            'summary' => is_string($content['summary'] ?? null)
                ? self::excerpt((string) $content['summary'], 180)
                : null,
            'financialHealth' => $health ? [
                'score' => (int) ($health['score'] ?? 0),
                'label' => (string) ($health['label'] ?? ''),
            ] : null,
            'createdAt' => $row['created_at'],
        ];
    }

    /** @param array<string, mixed> $row */
    private static function mapDetail(array $row): array
    {
        $base = self::mapListItem($row);
        $content = self::decodeContent($row['content_json'] ?? null);
        $base['summary'] = is_string($content['summary'] ?? null) ? $content['summary'] : '';
        $base['content'] = $content;
        $base['errorMessage'] = $row['error_message'] ?? null;

        return $base;
    }

    /** @return array<string, mixed> */
    private static function decodeContent(mixed $raw): array
    {
        if (!is_string($raw) || $raw === '') {
            return [];
        }
        $decoded = json_decode($raw, true);

        return is_array($decoded) ? $decoded : [];
    }

    private static function excerpt(string $text, int $max): string
    {
        $text = trim(preg_replace('/\s+/', ' ', $text) ?? $text);
        if (mb_strlen($text) <= $max) {
            return $text;
        }

        return rtrim(mb_substr($text, 0, $max - 1)) . '…';
    }
}
