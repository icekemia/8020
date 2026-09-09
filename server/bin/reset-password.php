<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require dirname(__DIR__) . '/bootstrap.php';
if (!isset($argv[1])) exit("Usage: php reset-password.php email < password-file\n");
$password = rtrim(stream_get_contents(STDIN), "\r\n");
\Duel\ensure(strlen($password) >= 10 && strlen($password) <= 72, 'Password must be 10–72 bytes.');
$store = new \Duel\Store(duelConfig());
$s = $store->query('UPDATE users SET password_hash=? WHERE email=?', [password_hash($password, PASSWORD_DEFAULT), strtolower($argv[1])]);
echo 'Accounts updated: ' . $s->rowCount() . "\n";
