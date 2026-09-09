<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require dirname(__DIR__) . '/bootstrap.php';
$store = new \Duel\Store(duelConfig());
$store->db->exec(file_get_contents(dirname(__DIR__) . '/schema.sql'));
foreach (glob(dirname(__DIR__) . '/migrations/*.sql') as $migration) $store->db->exec(file_get_contents($migration));
echo "V1 schema ready. No existing tables or data removed.\n";
