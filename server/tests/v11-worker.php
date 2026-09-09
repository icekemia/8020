<?php
declare(strict_types=1);
require dirname(__DIR__) . '/bootstrap.php';
$config=require dirname(__DIR__) . '/config.test.php';
\Duel\ensure((bool)preg_match('/dbname=duel_v1_test(?:;|$)/',$config['dsn']),'Isolated database required.');
$args=json_decode(base64_decode($argv[1]),true,512,JSON_THROW_ON_ERROR);
try {
    $m=new \Duel\Matches(new \Duel\Store($config));
    $result=$args[0]==='join' ? $m->join($args[1],$args[2]) : $m->rematch($args[1],$args[2],$args[3]);
    echo json_encode(['status'=>200,'data'=>$result]);
} catch (\Duel\HttpError $e) { echo json_encode(['status'=>$e->status]); }
