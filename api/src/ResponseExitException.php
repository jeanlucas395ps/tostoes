<?php

declare(strict_types=1);

namespace Gastos\Api;

/** Lançada nos testes no lugar de exit() em Response::json / error. */
final class ResponseExitException extends \RuntimeException
{
    public function __construct(
        public readonly mixed $payload,
        public readonly int $status
    ) {
        $msg = is_array($payload) && isset($payload['error'])
            ? (string) $payload['error']
            : 'response exit';
        parent::__construct($msg, $status);
    }
}
