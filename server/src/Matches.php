<?php
declare(strict_types=1);
namespace Duel;

final class Matches {
    private const PRESENCE_WINDOW = 120000;
    public function __construct(private Store $s) {}
    private function load(string $id): array {
        ensure((bool) preg_match('/^[a-f0-9]{32}$/D', $id), 'Partita non trovata.', 404);
        $m = $this->s->query('SELECT * FROM matches WHERE id=? FOR UPDATE', [$id])->fetch();
        ensure((bool) $m, 'Partita non trovata.', 404);
        $m['game'] = json_decode($m['game'], true, 512, JSON_THROW_ON_ERROR); return $m;
    }
    private function seat(array $m, int $uid): string {
        ensure($uid === (int) $m['player_a'] || $uid === (int) $m['player_b'], 'Questa partita è privata.', 403);
        return $uid === (int) $m['player_a'] ? 'A' : 'B';
    }
    private function save(array &$m): void {
        $m['version']++;
        $this->s->query('UPDATE matches SET player_b=?,status=?,game=?,phase_at=?,opens_at=?,deadline_at=?,outcome=?,reason=?,xp_award=?,delta_a=?,delta_b=?,settled=?,version=? WHERE id=?', [$m['player_b'], $m['status'], json_encode($m['game'], JSON_THROW_ON_ERROR), $m['phase_at'], $m['opens_at'], $m['deadline_at'], $m['outcome'], $m['reason'], $m['xp_award'], $m['delta_a'], $m['delta_b'], $m['settled'], $m['version'], $m['id']]);
    }
    private function settle(array &$m): void {
        if ($m['settled']) return;
        $m['settled'] = 1;
        if ($m['status'] === 'cancelled') return;
        if ($m['mode'] === 'bot') {
            if ($m['reason'] === 'abandon' || $m['reason'] === 'expired') return;
            $m['xp_award'] = $m['outcome'] === 'A_WIN' ? ['easy' => 30, 'medium' => 60, 'hard' => 100][$m['difficulty']] : ($m['outcome'] === 'DRAW' ? 20 : 10);
            $this->s->query('UPDATE users SET xp=xp+? WHERE id=?', [$m['xp_award'], $m['player_a']]);
            return;
        }
        $ids = [(int) $m['player_a'], (int) $m['player_b']]; sort($ids);
        $users = [];
        foreach ($ids as $id) $users[$id] = $this->s->query('SELECT * FROM users WHERE id=? FOR UPDATE', [$id])->fetch();
        $a = $users[$m['player_a']]; $b = $users[$m['player_b']];
        $actual = $m['outcome'] === 'A_WIN' ? 1 : ($m['outcome'] === 'DRAW' ? .5 : 0);
        $expected = 1 / (1 + 10 ** (((int) $b['elo'] - (int) $a['elo']) / 400));
        $m['delta_a'] = (int) round(32 * ($actual - $expected));
        $m['delta_b'] = -$m['delta_a'];
        foreach (['A' => $a, 'B' => $b] as $seat => $u) {
            $win = $m['outcome'] === $seat . '_WIN'; $draw = $m['outcome'] === 'DRAW';
            $rating = (int) $u['elo'] + $m['delta_' . strtolower($seat)];
            $streak = $win ? (int) $u['streak'] + 1 : 0;
            $this->s->query('UPDATE users SET elo=?,peak_elo=GREATEST(peak_elo,?),wins=wins+?,draws=draws+?,losses=losses+?,streak=?,best_streak=GREATEST(best_streak,?) WHERE id=?', [$rating, $rating, (int) $win, (int) $draw, (int) (!$win && !$draw), $streak, $streak, $u['id']]);
        }
    }
    private function end(array &$m, ?string $outcome, string $reason): void {
        $m['status'] = $outcome ? 'finished' : 'cancelled'; $m['outcome'] = $outcome; $m['reason'] = $reason;
        $m['game']['phase'] = 'FINISHED'; $m['game']['pending'] = [];
        if ($outcome) $m['game']['result'] = ['outcome' => $outcome];
        $m['phase_at'] = nowMs(); $m['opens_at'] = $m['phase_at']; $m['deadline_at'] = null;
        $this->settle($m);
    }
    private function expire(array &$m): void {
        $now = nowMs();
        if ($m['status'] === 'waiting') {
            $expires = $this->s->query('SELECT expires_at FROM match_offers WHERE match_id=?', [$m['id']])->fetchColumn();
            if ($expires !== false && $now >= (int) $expires) { $this->end($m, null, 'expired'); $this->save($m); return; }
        }
        if ($m['status'] === 'active' && $m['deadline_at'] !== null && $now >= (int) $m['deadline_at']) {
            $pending = array_keys($m['game']['pending']);
            $this->end($m, count($pending) === 1 ? $pending[0] . '_WIN' : null, 'timeout'); $this->save($m);
        } elseif (($m['status'] === 'waiting' && $now - (int) $m['phase_at'] > 86400000) || ($m['status'] === 'active' && $m['mode'] === 'bot' && $now - (int) $m['phase_at'] > 172800000)) {
            $this->end($m, null, 'expired'); $this->save($m);
        }
    }
    private function schedule(array &$m, int $delay): void {
        $m['phase_at'] = nowMs(); $m['opens_at'] = $m['phase_at'] + $delay;
        $m['deadline_at'] = $m['mode'] === 'multi' ? $m['opens_at'] + 60000 : null;
    }
    private function active(int $uid): ?string {
        $id = $this->s->query("SELECT id FROM matches WHERE (player_a=? OR player_b=?) AND status IN ('active','waiting') ORDER BY created_at DESC LIMIT 1", [$uid, $uid])->fetchColumn();
        return $id ?: null;
    }
    private function view(array $m, int $uid): array {
        $seat = $this->seat($m, $uid); $other = $seat === 'A' ? 'B' : 'A'; $g = $m['game'];
        $public = ['phase' => $g['phase'], 'split' => ['A' => $g['split'][$seat], 'B' => $g['split'][$other]], 'fill' => (object) [], 'pending' => (object) []];
        if (array_key_exists($seat, $g['pending'])) $public['pending'] = ['A' => $g['pending'][$seat]];
        if ($m['status'] === 'finished' && !empty($g['fill'])) $public['fill'] = ['A' => $g['fill'][$seat], 'B' => $g['fill'][$other]];
        if (isset($g['result'])) {
            $public['result'] = $g['result'];
            if ($seat === 'B') {
                if (isset($g['result']['scores'])) $public['result']['scores'] = array_reverse($g['result']['scores']);
                if ($g['result']['outcome'] !== 'DRAW') $public['result']['outcome'] = $g['result']['outcome'] === 'A_WIN' ? 'B_WIN' : 'A_WIN';
            }
        }
        $opponentId = $seat === 'A' ? $m['player_b'] : $m['player_a'];
        $rematch = $this->s->query('SELECT * FROM rematches WHERE match_id=?', [$m['id']])->fetch();
        $offer = $this->s->query('SELECT target_id,expires_at FROM match_offers WHERE match_id=?', [$m['id']])->fetch();
        $renewal = $rematch ? ['mine' => (int) $rematch['requested_by'] === $uid, 'expiresAt' => (int) $rematch['expires_at'], 'state' => $rematch['state'] === 'pending' && (int) $rematch['expires_at'] <= nowMs() ? 'expired' : $rematch['state'], 'nextId' => $rematch['next_id']] : null;
        return ['rematch' => $renewal, 'offer' => $offer ? ['targeted' => $offer['target_id'] !== null, 'expiresAt' => (int) $offer['expires_at']] : null, 'id' => $m['id'], 'code' => $m['status'] === 'waiting' ? $m['invite_code'] : null, 'mode' => $m['mode'], 'difficulty' => $m['difficulty'], 'status' => $m['status'], 'game' => $public, 'ownCommitted' => array_key_exists($seat, $g['pending']), 'opponentCommitted' => array_key_exists($other, $g['pending']), 'opponent' => $opponentId ? $this->s->publicUser($this->s->user((int) $opponentId)) : null, 'me' => $this->s->privateUser($uid), 'phaseAt' => (int) $m['phase_at'], 'opensAt' => (int) $m['opens_at'], 'deadlineAt' => $m['deadline_at'] === null ? null : (int) $m['deadline_at'], 'serverNow' => nowMs(), 'version' => (int) $m['version'], 'reason' => $m['reason'], 'reward' => ['xp' => (int) $m['xp_award'], 'elo' => (int) $m['delta_' . strtolower($seat)]]];
    }
    public function get(string $id, int $uid): array {
        return $this->s->transaction(function () use ($id, $uid) { $m = $this->load($id); $this->seat($m, $uid); $this->expire($m); return $this->view($m, $uid); });
    }
    public function current(int $uid): ?array { $id = $this->active($uid); return $id ? $this->get($id, $uid) : null; }
    public function create(int $uid, string $mode, string $difficulty): array {
        ensure(in_array($mode, ['bot', 'multi'], true) && in_array($difficulty, ['easy', 'medium', 'hard'], true), 'Modalità non valida.');
        // Expire old rooms before entering the user lock.
        $this->current($uid);
        return $this->s->transaction(function () use ($uid, $mode, $difficulty) {
            $this->s->query('SELECT id FROM users WHERE id=? FOR UPDATE', [$uid]);
            if ($id = $this->active($uid)) return $this->view($this->load($id), $uid);
            return $this->view($this->newMatch($uid, $mode, $difficulty), $uid);
        });
    }
    public function join(int $uid, string $code): array {
        ensure((bool) preg_match('/^[A-F0-9]{10}$/D', $code), 'Codice invito non valido.');
        $this->current($uid);
        return $this->s->transaction(function () use ($uid, $code) {
            $this->s->query('SELECT id FROM users WHERE id=? FOR UPDATE', [$uid]);
            $id = $this->s->query('SELECT id FROM matches WHERE invite_code=?', [$code])->fetchColumn();
            ensure((bool) $id, 'Invito non trovato.', 404);
            $m = $this->load($id); $this->expire($m);
            if ($uid === (int) $m['player_b'] || $uid === (int) $m['player_a']) return $this->view($m, $uid);
            ensure($m['status'] === 'waiting' && !$m['player_b'], 'Questo invito non è più disponibile.', 409);
            $offer = $this->s->query('SELECT * FROM match_offers WHERE match_id=?', [$id])->fetch();
            if ($offer) {
                ensure($offer['target_id'] === null || (int) $offer['target_id'] === $uid, 'Questa sfida è destinata a un altro giocatore.', 403);
                ensure((int) $offer['expires_at'] > nowMs(), 'Sfida scaduta.', 409);
                ensure((bool) $this->s->query('SELECT user_id FROM presence WHERE user_id=? AND seen_at>?', [$m['player_a'], nowMs()-self::PRESENCE_WINDOW])->fetchColumn(), 'Il giocatore non è più online.', 409);
            }
            ensure(!$this->active($uid), 'Hai già una partita aperta. Riprendila o abbandonala.', 409);
            $m['player_b'] = $uid; $m['status'] = 'active'; $this->schedule($m, 3000); $this->save($m);
            return $this->view($m, $uid);
        });
    }
    public function commit(string $id, int $uid, string $phase, mixed $action): array {
        return $this->s->transaction(function () use ($id, $uid, $phase, $action) {
            $m = $this->load($id); $seat = $this->seat($m, $uid); $this->expire($m);
            $previous = $this->s->query('SELECT action FROM moves WHERE match_id=? AND user_id=? AND phase=?', [$id, $uid, $phase])->fetchColumn();
            if ($previous !== false) {
                ensure($previous === json_encode($action), 'Questa scelta è già bloccata.', 409);
                return $this->view($m, $uid);
            }
            // A late request receives the authoritative timeout result instead of rolling it back.
            if (in_array($m['status'], ['finished', 'cancelled'], true)) return $this->view($m, $uid);
            ensure($m['status'] === 'active' && $m['game']['phase'] === $phase, 'La fase è cambiata. Aggiorna la partita.', 409);
            ensure(nowMs() >= (int) $m['opens_at'], 'Attendi l’apertura della fase.', 409);
            $m['game'] = Game::commit($m['game'], $seat, $action);
            $this->s->query('INSERT INTO moves (match_id,user_id,phase,action) VALUES (?,?,?,?)', [$id, $uid, $phase, json_encode($action)]);
            if ($m['game']['phase'] === 'FINISHED') {
                $m['status'] = 'finished'; $m['outcome'] = $m['game']['result']['outcome'];
                $m['reason'] = isset($m['game']['result']['scores']) ? 'completed' : 'decided';
                $m['phase_at'] = nowMs(); $m['opens_at'] = $m['phase_at']; $m['deadline_at'] = null; $this->settle($m);
            } elseif ($m['game']['phase'] !== $phase) {
                $this->schedule($m, $m['game']['phase'] === 'SPLIT_2_COMMIT' ? 1800 : 7000);
                if ($m['mode'] === 'bot') $m['game'] = Game::commit($m['game'], 'B', Bot::choose($m['game'], $m['difficulty'], $this->s->config['policy_path']));
            }
            $this->save($m); return $this->view($m, $uid);
        });
    }
    public function leave(string $id, int $uid): array {
        return $this->s->transaction(function () use ($id, $uid) {
            $m = $this->load($id); $seat = $this->seat($m, $uid); $this->expire($m);
            if (in_array($m['status'], ['active', 'waiting'], true)) {
                $outcome = $m['status'] === 'active' && $m['mode'] === 'multi' ? ($seat === 'A' ? 'B_WIN' : 'A_WIN') : null;
                $this->end($m, $outcome, 'abandon'); $this->save($m);
            }
            return $this->view($m, $uid);
        });
    }
    private function newMatch(int $uid, string $mode, string $difficulty = 'hard', ?int $opponent = null): array {
        $g = Game::create();
        if ($mode === 'bot') $g = Game::commit($g, 'B', Bot::choose($g, $difficulty, $this->s->config['policy_path']));
        $id = bin2hex(random_bytes(16)); $now = nowMs();
        $code = $mode === 'multi' ? strtoupper(bin2hex(random_bytes(5))) : null;
        $this->s->query('INSERT INTO matches (id,invite_code,mode,difficulty,player_a,player_b,status,game,phase_at,opens_at,deadline_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)', [$id,$code,$mode,$mode === 'bot' ? $difficulty : null,$uid,$opponent,$mode === 'bot' || $opponent ? 'active' : 'waiting',json_encode($g),$now,$now+3000,$opponent ? $now+63000 : null]);
        return $this->load($id);
    }
    public function rematch(int $uid, string $id, string $action): array {
        ensure(in_array($action, ['request','accept','decline','cancel'], true), 'Richiesta non valida.');
        return $this->s->transaction(function() use ($uid,$id,$action) {
            $m=$this->load($id); $this->seat($m,$uid);
            ensure($m['mode']==='multi' && $m['player_b'] && in_array($m['status'],['finished','cancelled'],true), 'La partita deve essere conclusa.',409);
            $r=$this->s->query('SELECT * FROM rematches WHERE match_id=? FOR UPDATE',[$id])->fetch();
            if ($r && $r['next_id']) return $this->view($m,$uid);
            $pending=$r && $r['state']==='pending' && (int)$r['expires_at']>nowMs();
            if ($action==='decline' || $action==='cancel') {
                ensure($pending, 'La richiesta non è più disponibile.',409);
                ensure(($action==='cancel') === ((int)$r['requested_by']===$uid), 'Azione non consentita.',403);
                $this->s->query('UPDATE rematches SET state=? WHERE match_id=?',[$action==='cancel' ? 'cancelled' : 'declined',$id]);
            } else {
                $ids=[(int)$m['player_a'],(int)$m['player_b']];sort($ids);
                foreach($ids as $player) $this->s->query('SELECT id FROM users WHERE id=? FOR UPDATE',[$player]);
                foreach($ids as $player) ensure(!$this->active($player), 'Un giocatore ha già un altro tavolo aperto.',409);
                if ($action==='accept') {
                    ensure($pending, 'La richiesta è scaduta.',409);
                    ensure((int)$r['requested_by']!==$uid, 'Attendi il consenso dell’avversario.',403);
                    $next=$this->newMatch((int)$m['player_a'],'multi','hard',(int)$m['player_b']);
                    $this->s->query("UPDATE rematches SET state='accepted',next_id=? WHERE match_id=?",[$next['id'],$id]);
                } elseif (!$pending) {
                    $this->s->query("INSERT INTO rematches (match_id,requested_by,expires_at,state) VALUES (?,?,?,'pending') ON DUPLICATE KEY UPDATE requested_by=VALUES(requested_by),expires_at=VALUES(expires_at),state='pending'",[$id,$uid,nowMs()+60000]);
                }
            }
            $this->save($m);return $this->view($m,$uid);
        });
    }
    public function challenge(int $uid, ?int $target): array {
        ensure($target===null || $target>0 && $target!==$uid, 'Scegli un altro giocatore.');
        $this->current($uid);
        return $this->s->transaction(function() use ($uid,$target) {
            $ids=$target ? [$uid,$target] : [$uid];sort($ids);
            foreach($ids as $player) $this->s->query('SELECT id FROM users WHERE id=? FOR UPDATE',[$player]);
            ensure(!$this->active($uid), 'Hai già un tavolo aperto.',409);
            if ($target) {
                ensure((bool)$this->s->query('SELECT user_id FROM presence WHERE user_id=? AND seen_at>? AND available=1',[$target,nowMs()-self::PRESENCE_WINDOW])->fetchColumn() && !$this->active($target), 'Il giocatore non è disponibile.',409);
                ensure(!$this->s->query("SELECT o.match_id FROM match_offers o JOIN matches m ON m.id=o.match_id WHERE o.target_id=? AND o.expires_at>? AND m.status='waiting'",[$target,nowMs()])->fetchColumn(), 'Il giocatore ha già una sfida in arrivo.',409);
            }
            $m=$this->newMatch($uid,'multi');
            $this->s->query('INSERT INTO match_offers (match_id,target_id,expires_at) VALUES (?,?,?)',[$m['id'],$target,nowMs()+60000]);
            return $this->view($m,$uid);
        });
    }
    public function declineChallenge(int $uid, string $id): bool {
        return $this->s->transaction(function() use ($uid,$id) {
            $m=$this->load($id);
            $target=$this->s->query('SELECT target_id FROM match_offers WHERE match_id=?',[$id])->fetchColumn();
            ensure($target!==false && (int)$target===$uid,'Sfida privata non trovata.',403);
            if ($m['status']==='waiting') {$this->end($m,null,'declined');$this->save($m);}
            return true;
        });
    }
    public function lobby(int $uid, bool $available): array {
        $current=$this->current($uid);
        $this->s->query('INSERT INTO presence (user_id,seen_at,available) VALUES (?,?,?) ON DUPLICATE KEY UPDATE seen_at=VALUES(seen_at),available=VALUES(available)',[$uid,nowMs(),(int)$available]);
        $players=$this->s->query("SELECT u.*,p.available,EXISTS(SELECT 1 FROM matches m WHERE (m.player_a=u.id OR m.player_b=u.id) AND m.status IN ('active','waiting')) AS busy FROM presence p JOIN users u ON u.id=p.user_id WHERE p.seen_at>? AND u.id<>? ORDER BY p.available DESC,u.nickname LIMIT 50",[nowMs()-self::PRESENCE_WINDOW,$uid])->fetchAll();
        $offers=$this->s->query("SELECT m.id,m.invite_code,m.player_a,o.target_id,o.expires_at FROM match_offers o JOIN matches m ON m.id=o.match_id JOIN presence p ON p.user_id=m.player_a WHERE m.status='waiting' AND o.expires_at>? AND p.seen_at>? AND m.player_a<>? AND (o.target_id IS NULL OR o.target_id=?) ORDER BY o.expires_at LIMIT 10",[nowMs(),nowMs()-self::PRESENCE_WINDOW,$uid,$uid])->fetchAll();
        return ['players'=>array_map(fn($p)=>$this->s->publicUser($p)+['available'=>(bool)$p['available'] && !$p['busy']],$players), 'offers'=>array_map(fn($o)=>['id'=>$o['id'],'code'=>$o['invite_code'],'targeted'=>$o['target_id']!==null,'expiresAt'=>(int)$o['expires_at'],'from'=>$this->s->publicUser($this->s->user((int)$o['player_a']))],$offers), 'current'=>$current, 'serverNow'=>nowMs()];
    }
    public function sweep(): int {
        $expiredOffers=$this->s->query("SELECT m.id FROM matches m JOIN match_offers o ON o.match_id=m.id WHERE m.status='waiting' AND o.expires_at<=? LIMIT 200",[nowMs()])->fetchAll();
        foreach($expiredOffers as $r) $this->s->transaction(function() use ($r) {$m=$this->load($r['id']);$this->expire($m);});
        $this->s->query('DELETE FROM presence WHERE seen_at<?',[nowMs()-86400000]);
        $rows = $this->s->query("SELECT id FROM matches WHERE (status='active' AND deadline_at<=?) OR (status='waiting' AND phase_at<?) OR (status='active' AND mode='bot' AND phase_at<?) LIMIT 200", [nowMs(), nowMs() - 86400000, nowMs() - 172800000])->fetchAll();
        foreach ($rows as $r) $this->s->transaction(function () use ($r) { $m = $this->load($r['id']); $this->expire($m); });
        $this->s->query('DELETE FROM rate_limits WHERE expires_at<?', [time()]); return count($rows);
    }
}
