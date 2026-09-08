<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require dirname(__DIR__) . '/bootstrap.php';
$matches = new \Duel\Matches(new \Duel\Store(duelConfig()));
echo 'Expired matches checked: ' . $matches->sweep() . "\n";
