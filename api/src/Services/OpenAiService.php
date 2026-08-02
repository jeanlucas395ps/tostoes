<?php

declare(strict_types=1);

namespace Gastos\Api\Services;

use Gastos\Api\Config;
use RuntimeException;

final class OpenAiService
{
    /**
     * @param array<string, mixed> $payload Dados financeiros do período
     * @return array<string, mixed> Relatório estruturado
     */
    public static function generateFinancialReport(array $payload, int $timeoutSeconds = 180): array
    {
        $apiKey = trim((string) Config::get('OPENAI_API_KEY', ''));
        $endpoint = trim((string) Config::get(
            'OPENAI_API_URL',
            'https://api.openai.com/v1/chat/completions'
        ));
        $model = trim((string) Config::get('OPENAI_MODEL', 'gpt-4o-mini'));
        $timeoutSeconds = max(60, min(300, $timeoutSeconds));

        if ($apiKey === '') {
            throw new RuntimeException('OPENAI_API_KEY não configurada.');
        }
        if ($endpoint === '') {
            throw new RuntimeException('OPENAI_API_URL não configurada.');
        }

        $promptPath = dirname(__DIR__) . '/Prompts/ai_report_prompt.php';
        if (!is_file($promptPath)) {
            throw new RuntimeException('Arquivo de prompt não encontrado.');
        }
        /** @var string $systemPrompt */
        $systemPrompt = require $promptPath;

        $mode = (string) ($payload['analysisMode'] ?? 'historical');
        $modeHint = match ($mode) {
            'forecast' => 'MODO: PREVISÃO (período futuro). Priorize orientação prática para o usuário alcançar boa saúde financeira.',
            'mixed' => 'MODO: MISTO (passado + futuro). Analise o histórico e oriente o planejamento dos meses futuros.',
            default => 'MODO: HISTÓRICO (período passado/atual). Analise o que aconteceu e sugira melhorias.',
        };

        $userContent = $modeHint . "\n\nDados financeiros do período (JSON):\n"
            . json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

        $body = [
            'model' => $model,
            'temperature' => 0.4,
            'response_format' => ['type' => 'json_object'],
            'messages' => [
                ['role' => 'system', 'content' => $systemPrompt],
                ['role' => 'user', 'content' => $userContent],
            ],
        ];

        $ch = curl_init($endpoint);
        if ($ch === false) {
            throw new RuntimeException('Falha ao iniciar requisição ao ChatGPT.');
        }

        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'Authorization: Bearer ' . $apiKey,
            ],
            CURLOPT_POSTFIELDS => json_encode($body, JSON_UNESCAPED_UNICODE),
            CURLOPT_CONNECTTIMEOUT => 20,
            CURLOPT_TIMEOUT => $timeoutSeconds,
        ]);

        $raw = curl_exec($ch);
        $errno = curl_errno($ch);
        $error = curl_error($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($errno !== 0 || $raw === false) {
            throw new RuntimeException('Erro de rede ao chamar ChatGPT: ' . $error);
        }

        $decoded = json_decode($raw, true);
        if (!is_array($decoded)) {
            throw new RuntimeException('Resposta inválida do ChatGPT.');
        }

        if ($status < 200 || $status >= 300) {
            $msg = $decoded['error']['message'] ?? ('HTTP ' . $status);
            throw new RuntimeException('ChatGPT: ' . $msg);
        }

        $content = $decoded['choices'][0]['message']['content'] ?? null;
        if (!is_string($content) || trim($content) === '') {
            throw new RuntimeException('ChatGPT não retornou conteúdo.');
        }

        $report = json_decode($content, true);
        if (!is_array($report)) {
            throw new RuntimeException('JSON do relatório inválido.');
        }

        return self::normalizeReport($report);
    }

    /**
     * @param array<string, mixed> $report
     * @return array<string, mixed>
     */
    private static function normalizeReport(array $report): array
    {
        $health = is_array($report['financialHealth'] ?? null) ? $report['financialHealth'] : [];
        $score = (int) ($health['score'] ?? 5);
        $score = max(1, min(10, $score));

        $sections = [];
        foreach (($report['detailedSections'] ?? []) as $section) {
            if (!is_array($section)) {
                continue;
            }
            $title = trim((string) ($section['title'] ?? ''));
            $content = trim((string) ($section['content'] ?? ''));
            if ($title === '' && $content === '') {
                continue;
            }
            $sections[] = [
                'title' => $title !== '' ? $title : 'Detalhes',
                'content' => $content,
            ];
        }

        return [
            'title' => trim((string) ($report['title'] ?? 'Relatório financeiro')) ?: 'Relatório financeiro',
            'summary' => trim((string) ($report['summary'] ?? '')),
            'financialHealth' => [
                'score' => $score,
                'label' => trim((string) ($health['label'] ?? 'Análise')) ?: 'Análise',
                'analysis' => trim((string) ($health['analysis'] ?? '')),
            ],
            'highlights' => self::stringList($report['highlights'] ?? []),
            'concerns' => self::stringList($report['concerns'] ?? []),
            'suggestions' => self::stringList($report['suggestions'] ?? []),
            'detailedSections' => $sections,
        ];
    }

    /**
     * @param mixed $value
     * @return list<string>
     */
    private static function stringList(mixed $value): array
    {
        if (!is_array($value)) {
            return [];
        }
        $out = [];
        foreach ($value as $item) {
            $text = trim((string) $item);
            if ($text !== '') {
                $out[] = $text;
            }
        }

        return $out;
    }
}
