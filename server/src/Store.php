<?php
declare(strict_types=1);
namespace Duel;

final class Store {
    public \PDO $db;
    public function __construct(public array $config) {
        $this->db = new \PDO($config['dsn'], $config['db_user'], $config['db_password'], [\PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION, \PDO::ATTR_DEFAULT_FETCH_MODE => \PDO::FETCH_ASSOC, \PDO::ATTR_EMULATE_PREPARES => false]);
        $this->db->exec('SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED');
        $this->db->exec("SET time_zone = '+00:00'");
    }
    public function query(string $sql, array $params = []): \PDOStatement {
        $s = $this->db->prepare($sql); $s->execute($params); return $s;
    }
    public function transaction(callable $fn): mixed {
        for ($try = 0; ; $try++) {
            $this->db->beginTransaction();
            try { $result = $fn(); $this->db->commit(); return $result; }
            catch (\Throwable $e) {
                if ($this->db->inTransaction()) $this->db->rollBack();
                if ($e instanceof \PDOException && in_array($e->errorInfo[1] ?? 0, [1205, 1213], true) && $try < 2) continue;
                throw $e;
            }
        }
    }
    public function user(int $id): array {
        $user = $this->query('SELECT * FROM users WHERE id=?', [$id])->fetch();
        ensure((bool) $user, 'Accedi per continuare.', 401); return $user;
    }
    public function publicUser(array $u): array {
        $stats = [];
        foreach (['id', 'xp', 'elo', 'peak_elo', 'wins', 'draws', 'losses', 'best_streak'] as $key) $stats[$key] = (int) $u[$key];
        return $stats + ['nickname' => $u['nickname'], 'country' => $u['country_public'] ? $u['country'] : null, 'provisional' => $u['wins'] + $u['draws'] + $u['losses'] < 10];
    }
    public function privateUser(int $id): array {
        $u = $this->user($id);
        return $this->publicUser($u) + ['email' => $u['email'], 'selectedCountry' => $u['country'], 'countryPublic' => (bool) $u['country_public']];
    }
    public function rate(string $scope, string $identity, int $limit, int $seconds): void {
        $key = hash_hmac('sha256', $scope . ':' . $identity, $this->config['app_secret']);
        $now = time();
        $allowed = $this->transaction(function () use ($key, $now, $limit, $seconds) {
            $this->query('INSERT IGNORE INTO rate_limits (bucket,hits,expires_at) VALUES (?,0,?)', [$key, $now + $seconds]);
            $row = $this->query('SELECT * FROM rate_limits WHERE bucket=? FOR UPDATE', [$key])->fetch();
            if ((int) $row['expires_at'] <= $now) $row = ['hits' => 0, 'expires_at' => $now + $seconds];
            $hits = (int) $row['hits'] + 1;
            $this->query('UPDATE rate_limits SET hits=?, expires_at=? WHERE bucket=?', [$hits, $row['expires_at'], $key]);
            return $hits <= $limit;
        });
        ensure($allowed, 'Troppe richieste. Riprova fra qualche minuto.', 429);
    }
}
