<?php

declare(strict_types=1);

/**
 * Front controller — Alpha Media / cPanel (document root = public_html).
 */

$root = __DIR__;

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
use Gastos\Api\RequestPath;
use Gastos\Api\Response;
use Gastos\Api\Router;

Config::load($root);
Cors::apply();

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$uri = $_SERVER['REQUEST_URI'] ?? '/';
$path = RequestPath::fromUri($uri);
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

try {
    Router::dispatch($method, $path);
} catch (Throwable $e) {
    Response::error('Erro interno.', 500, ['detail' => $e->getMessage()]);
}
