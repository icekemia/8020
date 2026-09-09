<?php
declare(strict_types=1);
require dirname(__DIR__) . '/bootstrap.php';
use Duel\{Accounts, Bot, Game, HttpError, Matches, Store};

$path = dirname(__DIR__) . '/config.test.php';
if (!is_file($path)) {fwrite(STDERR, "Create server/config.test.php with a separate database named duel_v1_test. See documentation/TESTING.md.\n"); exit(1);}
$config = require $path;
if (!preg_match('/dbname=duel_v1_test(?:;|$)/', $config['dsn'])) throw new RuntimeException('Refusing to use anything except duel_v1_test.');
$s = new Store($config); $s->db->exec(file_get_contents(dirname(__DIR__) . '/schema.sql'));
foreach (glob(dirname(__DIR__) . '/migrations/*.sql') as $migration) $s->db->exec(file_get_contents($migration));
foreach (['rematches','match_offers','presence','moves','matches','users','rate_limits'] as $table) $s->query("DELETE FROM $table");
$passed = 0;
function check(bool $ok, string $label): void {global $passed; if (!$ok) throw new RuntimeException('FAILED: ' . $label); $passed++;}
function rejects(callable $fn, int $status, string $label): void {try {$fn();} catch (HttpError $e) {check($e->status === $status, $label);return;} throw new RuntimeException('Not rejected: ' . $label);}
$a = new Accounts($s); $m = new Matches($s);
$uidA = $a->register(['email'=>'alice@example.test','nickname'=>'Alice','password'=>'test-password-8020','country'=>'IT','countryPublic'=>true]);
$uidB = $a->register(['email'=>'bob@example.test','nickname'=>'Bob','password'=>'test-password-8020','country'=>'DE','countryPublic'=>false]);
$uidC = $a->register(['email'=>'carol@example.test','nickname'=>'Carol','password'=>'test-password-8020']);
check($a->login(['email'=>'ALICE@example.test','password'=>'test-password-8020']) === $uidA, 'Login and normalized email');
rejects(fn()=>$a->login(['email'=>'alice@example.test','password'=>'wrong']),401,'Wrong password');
rejects(fn()=>$a->register(['email'=>'alice@example.test','nickname'=>'Duplicate','password'=>'test-password-8020']),409,'Unique email');
rejects(fn()=>$a->update($uidA,['country'=>'ZZ']),422,'ISO country validation');
check($a->profile($uidB)['country']===null,'Country privacy');
check(!isset($a->profile($uidA)['email']) && !isset($a->profile($uidA)['password_hash']),'Profile hides private data');
$room=$m->create($uidA,'multi','hard');
check($room['status']==='waiting' && strlen($room['code'])===10,'Private room creation');
check($m->create($uidA,'multi','hard')['id']===$room['id'],'Idempotent room creation');
$joined=$m->join($uidB,$room['code']);$id=$room['id'];
check($joined['deadlineAt']-$joined['opensAt']===60000,'Exactly one minute after intro');
rejects(fn()=>$m->get($id,$uidC),403,'Unauthorized spectator blocked');
rejects(fn()=>$m->join($uidC,$room['code']),409,'Third player cannot enter');
rejects(fn()=>$m->commit($id,$uidA,'SPLIT_1_COMMIT',27),409,'Cannot skip intro');
function openNow(Store $s,string $id):void {$s->query('UPDATE matches SET opens_at=?,deadline_at=? WHERE id=?',[\Duel\nowMs()-1,\Duel\nowMs()+60000,$id]);}
openNow($s,$id);
rejects(fn()=>$m->commit($id,$uidA,'SPLIT_1_COMMIT',79),422,'Invalid first split');
rejects(fn()=>$m->commit($id,$uidA,'SPLIT_1_COMMIT',27.0),422,'Float rejected');
$first=$m->commit($id,$uidA,'SPLIT_1_COMMIT',27);
$other=$m->get($id,$uidB);
check($first['ownCommitted'] && $other['opponentCommitted'] && !array_key_exists('B',(array)$other['game']['pending']),'Hidden commitment');
check($other['game']['split']['B']===[],'No early reveal');
check($m->get($id,$uidA)['deadlineAt']===$first['deadlineAt'],'Reconnect keeps deadline');
rejects(fn()=>$m->commit($id,$uidA,'SPLIT_1_COMMIT',28),409,'Cannot change committed move');
$second=$m->commit($id,$uidB,'SPLIT_1_COMMIT',27);
check($second['game']['phase']==='SPLIT_2_COMMIT','Double confirmation advances phase');
check($m->commit($id,$uidA,'SPLIT_1_COMMIT',27)['game']['phase']==='SPLIT_2_COMMIT','Lost response retry does not play next phase');
openNow($s,$id);
function parallelMoves(array $jobs):void {
    $running=[];
    foreach($jobs as $job) {
        $proc=proc_open([PHP_BINARY,__DIR__.'/worker.php',base64_encode(json_encode($job))],[0=>['pipe','r'],1=>['pipe','w'],2=>['pipe','w']],$pipes,null,null,['bypass_shell'=>true]);
        if(!is_resource($proc))throw new RuntimeException('Could not launch concurrent test worker.');
        fclose($pipes[0]);$running[]=[$proc,$pipes];
    }
    foreach($running as [$proc,$pipes]) {
        $out=stream_get_contents($pipes[1]);$err=stream_get_contents($pipes[2]);fclose($pipes[1]);fclose($pipes[2]);$code=proc_close($proc);
        check($code===0 && (bool) json_decode($out,true),'Concurrent commit: '.$err);
    }
}
parallelMoves([[$id,$uidA,'SPLIT_2_COMMIT',27],[$id,$uidB,'SPLIT_2_COMMIT',27]]);
$fill=$m->get($id,$uidA);
check($fill['game']['split']['A']===[27,27,26] && $fill['game']['phase']==='FILL_COMMIT','Concurrent split / automatic third card');
check($fill['opensAt']-$fill['phaseAt']===7000,'Third-card and Fill intro have time before clock');
openNow($s,$id);
rejects(fn()=>$m->commit($id,$uidA,'FILL_COMMIT',[20,1,0]),422,'Fill sum validation');
rejects(fn()=>$m->commit($id,$uidA,'FILL_COMMIT',[-1,1,20]),422,'Negative Fill validation');
$m->commit($id,$uidA,'FILL_COMMIT',[0,10,10]);
check(!array_key_exists('B',(array)$m->get($id,$uidB)['game']['fill']),'Hidden Fill');
parallelMoves([[$id,$uidB,'FILL_COMMIT',[20,0,0]],[$id,$uidB,'FILL_COMMIT',[20,0,0]]]);
$result=$m->get($id,$uidA);
check($result['game']['result']['outcome']==='A_WIN' && $result['reward']['elo']===16,'Winner and Elo calculation');
check($m->get($id,$uidB)['game']['result']['outcome']==='B_WIN','Seat normalization');
check((int)$s->user($uidA)['wins']===1 && (int)$s->user($uidB)['losses']===1,'Exactly-once settlement under concurrency');
check((int)$s->user($uidA)['elo']+(int)$s->user($uidB)['elo']===2400,'Zero-sum Elo');
check($a->profile($uidA)['recent'][0]['outcome']==='W','Public recent history');
check(count($a->ranking('elo',0)['rows'])===2,'Unplayed accounts excluded from Elo ranking');

// A single confirmation times out as a forfeit; an empty phase is cancelled.
$room=$m->create($uidA,'multi','hard');$m->join($uidB,$room['code']);$id=$room['id'];openNow($s,$id);
$m->commit($id,$uidB,'SPLIT_1_COMMIT',1);
$s->query('UPDATE matches SET deadline_at=? WHERE id=?',[\Duel\nowMs()-1,$id]);
$timed=$m->commit($id,$uidA,'SPLIT_1_COMMIT',1);
check($timed['reason']==='timeout' && $timed['game']['result']['outcome']==='B_WIN','Late action gets persisted timeout');
check((int)$s->user($uidB)['wins']===1,'Timeout credited once');
$room=$m->create($uidA,'multi','hard');$m->join($uidB,$room['code']);$id=$room['id'];
$before=(int)$s->user($uidA)['elo'];$s->query('UPDATE matches SET deadline_at=? WHERE id=?',[\Duel\nowMs()-1,$id]);
$m->sweep();check($m->get($id,$uidA)['status']==='cancelled' && (int)$s->user($uidA)['elo']===$before,'Both timeout: cron cancels without Elo');
$room=$m->create($uidA,'multi','hard');$m->join($uidB,$room['code']);$id=$room['id'];
openNow($s,$id);$m->commit($id,$uidA,'SPLIT_1_COMMIT',1);$m->commit($id,$uidB,'SPLIT_1_COMMIT',40);
openNow($s,$id);$m->commit($id,$uidA,'SPLIT_2_COMMIT',1);$early=$m->commit($id,$uidB,'SPLIT_2_COMMIT',39);
check($early['status']==='finished' && $early['reason']==='decided' && !isset($early['game']['result']['scores']),'Irrelevant Fill skipped without invented scores');
check(Game::decided(['split'=>['A'=>[31,30,19],'B'=>[11,10,59]]])===null,'Exactly 20 remains contestable');

foreach(['easy','medium','hard'] as $difficulty) {
    $bot=$m->create($uidC,'bot',$difficulty);$id=$bot['id'];
    check($bot['deadlineAt']===null && $bot['opponentCommitted'],'Bot ready before human; no timer');
    $before=(int)$s->user($uidC)['xp'];
    foreach([27,27,[7,7,6]] as $action) {
        if($bot['status']==='finished')break;
        openNow($s,$id);$s->query('UPDATE matches SET deadline_at=NULL WHERE id=?',[$id]);
        $bot=$m->commit($id,$uidC,$bot['game']['phase'],$action);
    }
    check($bot['status']==='finished' && (int)$s->user($uidC)['xp']===$before+$bot['reward']['xp'],'Server-authoritative bot XP '.$difficulty);
    $m->get($id,$uidC);check((int)$s->user($uidC)['xp']===$before+$bot['reward']['xp'],'No XP on repeated fetch');
}
$before=(int)$s->user($uidC)['xp'];$bot=$m->create($uidC,'bot','easy');$m->leave($bot['id'],$uidC);
check((int)$s->user($uidC)['xp']===$before,'No XP for abandoned bot match');
$s->rate('test','example',1,60);rejects(fn()=>$s->rate('test','example',1,60),429,'Rate limiting');
require __DIR__ . '/v11.php';

echo "PASS: $passed backend checks, including concurrent PHP processes on MySQL. Peak memory: ".round(memory_get_peak_usage(true)/1048576)." MB.\n";
