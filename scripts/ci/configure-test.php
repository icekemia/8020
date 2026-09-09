<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli' || getenv('CI') !== 'true') exit("CI only.\n");
$root = dirname(__DIR__, 2);
$path = $root . '/server/config.test.php';
if (file_exists($path)) throw new RuntimeException('Refusing to overwrite an existing test configuration.');
$config = [
    'dsn' => 'mysql:host=127.0.0.1;port=3306;dbname=duel_v1_test;charset=utf8mb4',
    'db_user' => 'root', 'db_password' => 'ci-only-password',
    'app_secret' => bin2hex(random_bytes(32)), 'secure_cookies' => false,
    'registration_code' => '', 'geoip_enabled' => false,
    'policy_path' => $root . '/public/policies/80_20_difficult.policy.json'
];
file_put_contents($path, "<?php\nreturn " . var_export($config, true) . ";\n");
chmod($path, 0600);
