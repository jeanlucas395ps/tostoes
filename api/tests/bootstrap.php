<?php

declare(strict_types=1);

require dirname(__DIR__) . '/vendor/autoload.php';

// Carrega .env da API para testes de integração (MySQL local).
\Gastos\Api\Config::load(dirname(__DIR__));

// Permite cobrir caminhos que chamam Response::error / json sem exit.
\Gastos\Api\Response::$throwInsteadOfExit = true;
