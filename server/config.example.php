<?php
declare(strict_types=1);
return [
    'dsn' => 'mysql:host=localhost;dbname=duel_v1;charset=utf8mb4',
    'db_user' => 'duel_v1',
    'db_password' => 'REPLACE_ME',
    'app_secret' => 'REPLACE_WITH_64_RANDOM_HEX_CHARACTERS',
    'secure_cookies' => true,
    'registration_code' => '', // Optional shared invitation code for the test circle.
    'geoip_enabled' => false, // Enable country.is lookup after publishing the privacy notice.
    'policy_path' => __DIR__ . '/data/80_20_difficult.policy.json',
];
