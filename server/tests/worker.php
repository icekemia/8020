<?php
declare(strict_types=1);
require dirname(__DIR__) . '/bootstrap.php';
$config = require dirname(__DIR__) . '/config.test.php';
\Duel\ensure((bool) preg_match('/dbname=duel_v1_test(?:;|$)/', $config['dsn']), 'Use the isolated test database.');
$args = json_decode(base64_decode($argv[1]), true, 512, JSON_THROW_ON_ERROR);
try {
    $matches = new \Duel\Matches(new \Duel\Store($config));
    $s = $matches->commit($args[0], $args[1], $args[2], $args[3]);
    echo json_encode(['version' => $s['version'], 'status' => $s['status']]);
} catch (\Throwable $e) {fwrite(STDERR, $e->getMessage()); exit(1);}
