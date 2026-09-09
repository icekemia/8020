<?php
declare(strict_types=1);
require __DIR__ . '/deploy-remote.php';

$suite = sys_get_temp_dir() . '/duel-deploy-test-' . bin2hex(random_bytes(6));
mkdir($suite, 0700, true);
$commit = str_repeat('a',40); $passed=0;
function verify(bool $ok, string $label): void {global $passed; if(!$ok)throw new RuntimeException($label); $passed++;}
function fixture(string $name): array {
    global $suite,$commit;
    $root=$suite.'/'.$name;mkdir($root.'/public_html/api',0700,true);mkdir($root.'/server',0700,true);
    file_put_contents($root.'/.duel-deploy-enabled','DUEL8020');
    file_put_contents($root.'/server/config.php','PRIVATE CONFIG MUST SURVIVE');
    file_put_contents($root.'/server/bootstrap.php','old backend');
    file_put_contents($root.'/public_html/index.html','old frontend');
    file_put_contents($root.'/public_html/api/index.php','old .duel-maintenance API');
    return [$root, ['BUILD.json'=>json_encode(['commit'=>$commit]),'public_html/index.html'=>'new frontend','public_html/api/index.php'=>'new .duel-maintenance API','public_html/assets/new.js'=>'new asset','server/bootstrap.php'=>'new backend','server/data/80_20_difficult.policy.json'=>'{}']];
}
function archive(string $root,array $files):string {
    $path=$root.'/artifact.zip';$z=new ZipArchive();$z->open($path,ZipArchive::CREATE);
    foreach($files as $name=>$bytes)$z->addFromString($name,$bytes);$z->close();return $path;
}
function execute(string $root,array $files,callable $active,callable $health):void {
    global $commit;deployRelease($root,archive($root,$files),$commit.'-1-1',$commit,'https://example.test',$active,$health);
}
[$root,$files]=fixture('success');
execute($root,$files,fn()=>null,fn()=>null);
verify(file_get_contents($root.'/public_html/index.html')==='new frontend','Frontend published');
verify(file_get_contents($root.'/server/config.php')==='PRIVATE CONFIG MUST SURVIVE','Private config preserved');
verify(!file_exists($root.'/public_html/.duel-maintenance'),'Maintenance cleared');
verify(is_file($root.'/.deploy/current.json'),'Deployment receipt recorded');

[$root,$files]=fixture('health-failure');
try{execute($root,$files,fn()=>null,fn()=>throw new RuntimeException('failed health'));throw new LogicException('Expected failure');}
catch(RuntimeException $e){verify($e->getMessage()==='failed health','Health failure reported');}
verify(file_get_contents($root.'/public_html/index.html')==='old frontend','Frontend rolled back');
verify(file_get_contents($root.'/server/bootstrap.php')==='old backend','Backend rolled back');
verify(!is_file($root.'/public_html/assets/new.js'),'New release files removed on rollback');
verify(!is_file($root.'/public_html/.duel-maintenance'),'Maintenance cleared after successful rollback');
verify(file_get_contents($root.'/server/config.php')==='PRIVATE CONFIG MUST SURVIVE','Rollback preserves config');

[$root,$files]=fixture('active-game');
try{execute($root,$files,fn()=>throw new RuntimeException('active game'),fn()=>null);throw new LogicException('Expected failure');}
catch(RuntimeException $e){verify($e->getMessage()==='active game','Active game blocks deployment');}
verify(file_get_contents($root.'/server/bootstrap.php')==='old backend'&&!is_file($root.'/public_html/.duel-maintenance'),'No changes when players are active');

foreach(['traversal'=>'../escape.php','secret'=>'server/config.php','flag'=>'public_html/.duel-maintenance'] as $case=>$badPath){
    [$root,$files]=fixture($case);$files[$badPath]='bad';
    $failed=false;try{execute($root,$files,fn()=>null,fn()=>null);}catch(RuntimeException){$failed=true;}
    verify($failed && file_get_contents($root.'/server/config.php')==='PRIVATE CONFIG MUST SURVIVE','Unsafe artifact rejected: '.$case);
}
[$root,$files]=fixture('wrong-commit');$files['BUILD.json']=json_encode(['commit'=>str_repeat('b',40)]);
$failed=false;try{execute($root,$files,fn()=>null,fn()=>null);}catch(RuntimeException){$failed=true;}
verify($failed,'Artifact commit mismatch rejected');
[$root,$files]=fixture('no-marker');unlink($root.'/.duel-deploy-enabled');
$failed=false;try{execute($root,$files,fn()=>null,fn()=>null);}catch(RuntimeException){$failed=true;}
verify($failed,'Unmarked domain rejected');
echo "PASS: $passed deployment checks. Temporary fixtures: $suite\n";
