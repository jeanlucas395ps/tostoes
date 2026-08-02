<?php

declare(strict_types=1);

namespace Gastos\Api\Services;

/**
 * Stubs de curl no namespace do FxRateService (testes em processo separado).
 * Controle via $GLOBALS['fx_curl_*'].
 */
function curl_init(mixed $url = null): mixed
{
    if (($GLOBALS['fx_curl_init'] ?? true) === false) {
        return false;
    }

    return $GLOBALS['fx_curl_handle'] ?? 'fx-curl';
}

function curl_setopt_array(mixed $ch, array $options): bool
{
    return true;
}

function curl_exec(mixed $ch): string|bool
{
    return $GLOBALS['fx_curl_body'] ?? false;
}

function curl_getinfo(mixed $ch, int $option = 0): mixed
{
    return $GLOBALS['fx_curl_code'] ?? 200;
}

function curl_close(mixed $ch): void
{
}
