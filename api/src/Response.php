<?php

declare(strict_types=1);

namespace Gastos\Api;

final class Response
{
    /**
     * Em testes unitários, true faz json/error lançarem ResponseExitException
     * em vez de exit (permite cobrir Auth::require* e validações).
     */
    public static bool $throwInsteadOfExit = false;

    public static function json(mixed $data, int $status = 200): never
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($data, JSON_UNESCAPED_UNICODE);
        if (self::$throwInsteadOfExit) {
            throw new ResponseExitException($data, $status);
        }
        exit;
    }

    public static function error(string $message, int $status = 400, array $extra = []): never
    {
        self::json(array_merge(['error' => $message], $extra), $status);
    }
}
