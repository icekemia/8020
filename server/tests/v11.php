<?php
// Included by run.php, with the same isolated database and assertion helpers.
function raceV11(array $jobs): array {
    $running=[];$results=[];
    foreach($jobs as $job) {
        $proc=proc_open([PHP_BINARY,__DIR__.'/v11-worker.php',base64_encode(json_encode($job))],[0=>['pipe','r'],1=>['pipe','w'],2=>['pipe','w']],$pipes,null,null,['bypass_shell'=>true]);
        if(!is_resource($proc))throw new RuntimeException('Cannot start worker.');
        fclose($pipes[0]);$running[]=[$proc,$pipes];
    }
    foreach($running as [$proc,$pipes]) {
        $out=stream_get_contents($pipes[1]);$err=stream_get_contents($pipes[2]);fclose($pipes[1]);fclose($pipes[2]);
        check(proc_close($proc)===0,'Concurrent V1.1 worker completed: '.$err);
        $results[]=json_decode($out,true,512,JSON_THROW_ON_ERROR);
    }
    return $results;
}
$id=$early['id']; $oldGame=$m->get($id,$uidA)['game'];
rejects(fn()=>$m->rematch($uidC,$id,'request'),403,'Only participants can request rematch');
$before=$s->user($uidA)['elo'];
$r=$m->rematch($uidA,$id,'request');
check($r['rematch']['mine'] && $r['rematch']['state']==='pending','Rematch request visible');
check(!$m->get($id,$uidB)['rematch']['mine'],'Opponent receives request');
rejects(fn()=>$m->rematch($uidA,$id,'accept'),403,'Requester cannot self-accept');
$m->rematch($uidB,$id,'decline');
check($m->get($id,$uidA)['rematch']['state']==='declined','Decline visible to requester');
$m->rematch($uidA,$id,'request');
$s->query('UPDATE rematches SET expires_at=? WHERE match_id=?',[\Duel\nowMs()-1,$id]);
rejects(fn()=>$m->rematch($uidB,$id,'accept'),409,'Expired rematch cannot start');
$m->rematch($uidA,$id,'request');
$race=raceV11([['rematch',$uidB,$id,'accept'],['rematch',$uidB,$id,'accept']]);
check($race[0]['status']===200 && $race[1]['status']===200 && $race[0]['data']['rematch']['nextId']===$race[1]['data']['rematch']['nextId'],'Concurrent repeated accept creates one round');
$next=$race[0]['data']['rematch']['nextId'];
check($next!==$id && $m->current($uidA)['id']===$next && $m->current($uidB)['id']===$next,'Both players resume the same new round');
check($s->user($uidA)['elo']===$before && json_encode($m->get($id,$uidA)['game'])===json_encode($oldGame),'Old result preserved, no duplicate ELO');
rejects(fn()=>$m->rematch($uidA,$next,'request'),409,'No rematch before round ends');
$m->leave($next,$uidA);
$busy=$m->create($uidB,'multi','hard');
rejects(fn()=>$m->rematch($uidA,$next,'request'),409,'Rematch cannot steal a player from another table');$m->leave($busy['id'],$uidB);

$m->lobby($uidA,true);$m->lobby($uidB,true);$lobby=$m->lobby($uidC,true);
check(count($lobby['players'])===2 && !isset($lobby['players'][0]['email']),'Presence exposes only public player data');
$room=$m->challenge($uidA,$uidB);
check(count($m->lobby($uidB,true)['offers'])===1 && count($m->lobby($uidC,true)['offers'])===0,'Targeted challenge visible only to target');
rejects(fn()=>$m->join($uidC,$room['code']),403,'Leaked private challenge code cannot be used by third party');
rejects(fn()=>$m->declineChallenge($uidC,$room['id']),403,'Only target can decline');
$m->declineChallenge($uidB,$room['id']);check($m->get($room['id'],$uidA)['reason']==='declined','Target can decline challenge');
$room=$m->challenge($uidA,null);
$race=raceV11([['join',$uidB,$room['code']],['join',$uidC,$room['code']]]);
$codes=array_column($race,'status');sort($codes);check($codes===[200,409],'First accept wins open challenge race');
$m->leave($room['id'],$uidA);
$room=$m->challenge($uidA,null);
$s->query('UPDATE match_offers SET expires_at=? WHERE match_id=?',[\Duel\nowMs()-1,$room['id']]);
$m->sweep();check($m->get($room['id'],$uidA)['status']==='cancelled','Cron expires open offers after one minute');
$s->query('UPDATE presence SET seen_at=? WHERE user_id=?',[\Duel\nowMs()-30000,$uidB]);
check(count($m->lobby($uidC,true)['players'])===1,'Stale presence disappears');
rejects(fn()=>$m->challenge($uidA,$uidB),409,'Cannot challenge an offline player');
$m->lobby($uidB,true);$room=$m->create($uidB,'bot','easy');
rejects(fn()=>$m->challenge($uidA,$uidB),409,'Cannot challenge a busy player');$m->leave($room['id'],$uidB);
// A live request may be retried, but one user cannot reserve multiple tables.
$room=$m->challenge($uidA,null);rejects(fn()=>$m->challenge($uidA,null),409,'One outgoing challenge per player');$m->leave($room['id'],$uidA);

$botGame=['phase'=>'FILL_COMMIT','split'=>['A'=>[60,10,10],'B'=>[10,60,10]],'pending'=>[],'fill'=>[]];
foreach(['medium','hard'] as $difficulty) for($i=0;$i<8;$i++) {
    $action=\Duel\Bot::choose($botGame,$difficulty,$config['policy_path']);
    check($action===[0,0,20],'No units wasted on locked cards: '.$difficulty);
}
check(count(\Duel\Bot::usefulFills([20,-20,0]))>1,'A gap exactly 20 remains contestable');
