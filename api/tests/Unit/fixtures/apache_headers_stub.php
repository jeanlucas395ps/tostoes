<?php

declare(strict_types=1);

/**
 * Stub de apache_request_headers para cobrir Auth::requestHeaders em CLI.
 * Controle via $GLOBALS['apache_request_headers'].
 */
if (!function_exists('apache_request_headers')) {
    function apache_request_headers(): array
    {
        /** @var array<string, string> */
        return $GLOBALS['apache_request_headers'] ?? [];
    }
}
