<?php

declare(strict_types=1);

$root = dirname(__DIR__);

spl_autoload_register(function (string $class) use ($root): void {
    $prefix = 'Gastos\\Api\\';
    if (!str_starts_with($class, $prefix)) {
        return;
    }
    $relative = str_replace('\\', '/', substr($class, strlen($prefix)));
    $file = $root . '/src/' . $relative . '.php';
    if (is_file($file)) {
        require $file;
    }
});

use Gastos\Api\Config;
use Gastos\Api\Cors;
use Gastos\Api\RateLimiter;
use Gastos\Api\RequestPath;
use Gastos\Api\Response;
use Gastos\Api\Router;
use Gastos\Api\SecurityHeaders;

Config::load($root);
Cors::apply();
SecurityHeaders::apply();

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$uri = $_SERVER['REQUEST_URI'] ?? '/';
$path = RequestPath::fromUri($uri);
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

$authPaths = [
    '/auth/login',
    '/auth/register',
    '/auth/forgot-password',
    '/auth/reset-password',
];
$bucket = in_array($path, $authPaths, true) ? 'auth' : 'api';
RateLimiter::enforce($bucket);

try {
    Router::dispatch($method, $path);
} catch (Throwable $e) {
    // Não vazar mensagens internas (SQL, paths, stack) para o cliente.
    $extra = [];
    if (Config::get('APP_DEBUG', 'false') === 'true') {
        $extra['detail'] = $e->getMessage();
    }
    Response::error('Erro interno.', 500, $extra);
}
