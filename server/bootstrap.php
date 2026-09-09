<?php
declare(strict_types=1);
require_once __DIR__ . '/src/Game.php';
require_once __DIR__ . '/src/Store.php';
require_once __DIR__ . '/src/Matches.php';
require_once __DIR__ . '/src/Accounts.php';

function duelConfig(): array {
    $path = __DIR__ . '/config.php';
    if (!is_file($path)) throw new \Duel\HttpError(503, 'Il servizio account non è ancora configurato. Puoi giocare come ospite.');
    $config = require $path;
    \Duel\ensure(strlen($config['app_secret'] ?? '') >= 32 && !str_contains($config['app_secret'], 'REPLACE'), 'Configurazione incompleta.', 503);
    return $config;
}
