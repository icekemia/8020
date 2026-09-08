<?php
declare(strict_types=1);
namespace Duel;

final class Matches {
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
        return ['id' => $m['id'], 'code' => $m['status'] === 'waiting' ? $m['invite_code'] : null, 'mode' => $m['mode'], 'difficulty' => $m['difficulty'], 'status' => $m['status'], 'game' => $public, 'ownCommitted' => array_key_exists($seat, $g['pending']), 'opponentCommitted' => array_key_exists($other, $g['pending']), 'opponent' => $opponentId ? $this->s->publicUser($this->s->user((int) $opponentId)) : null, 'me' => $this->s->privateUser($uid), 'phaseAt' => (int) $m['phase_at'], 'opensAt' => (int) $m['opens_at'], 'deadlineAt' => $m['deadline_at'] === null ? null : (int) $m['deadline_at'], 'serverNow' => nowMs(), 'version' => (int) $m['version'], 'reason' => $m['reason'], 'reward' => ['xp' => (int) $m['xp_award'], 'elo' => (int) $m['delta_' . strtolower($seat)]]];
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
            $g = Game::create();
            if ($mode === 'bot') $g = Game::commit($g, 'B', Bot::choose($g, $difficulty, $this->s->config['policy_path']));
            $id = bin2hex(random_bytes(16)); $now = nowMs(); $code = $mode === 'multi' ? strtoupper(bin2hex(random_bytes(5))) : null;
            $this->s->query('INSERT INTO matches (id,invite_code,mode,difficulty,player_a,status,game,phase_at,opens_at) VALUES (?,?,?,?,?,?,?,?,?)', [$id, $code, $mode, $mode === 'bot' ? $difficulty : null, $uid, $mode === 'bot' ? 'active' : 'waiting', json_encode($g), $now, $now + 2600]);
            return $this->view($this->load($id), $uid);
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
    public function sweep(): int {
        $rows = $this->s->query("SELECT id FROM matches WHERE (status='active' AND deadline_at<=?) OR (status='waiting' AND phase_at<?) OR (status='active' AND mode='bot' AND phase_at<?) LIMIT 200", [nowMs(), nowMs() - 86400000, nowMs() - 172800000])->fetchAll();
        foreach ($rows as $r) $this->s->transaction(function () use ($r) { $m = $this->load($r['id']); $this->expire($m); });
        $this->s->query('DELETE FROM rate_limits WHERE expires_at<?', [time()]); return count($rows);
    }
}
