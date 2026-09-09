<?php
declare(strict_types=1);
namespace Duel;

final class Accounts {
    public const COUNTRIES = 'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW';
    public function __construct(private Store $s) {}
    public static function country(mixed $value): ?string {
        if ($value === null || $value === '') return null;
        ensure(is_string($value) && in_array($value, explode(' ', self::COUNTRIES), true), 'Nazione non valida.'); return $value;
    }
    private static function password(mixed $value): string {
        ensure(is_string($value) && strlen($value) >= 10 && strlen($value) <= 72, 'La password deve avere da 10 a 72 byte.'); return $value;
    }
    public function register(array $body): int {
        $email = strtolower(trim((string) ($body['email'] ?? ''))); $nickname = trim((string) ($body['nickname'] ?? ''));
        ensure(strlen($email) <= 190 && (bool) filter_var($email, FILTER_VALIDATE_EMAIL), 'Email non valida.');
        ensure((bool) preg_match('/^[A-Za-z0-9_]{3,20}$/D', $nickname), 'Nickname: 3–20 lettere, numeri o underscore.');
        $password = self::password($body['password'] ?? null); $country = self::country($body['country'] ?? null);
        $code = $this->s->config['registration_code'] ?? '';
        ensure($code === '' || hash_equals($code, (string) ($body['invite'] ?? '')), 'Codice di accesso ai test non valido.', 403);
        try {
            $this->s->query('INSERT INTO users (email,nickname,password_hash,country,country_public) VALUES (?,?,?,?,?)', [$email, $nickname, password_hash($password, PASSWORD_DEFAULT), $country, !empty($body['countryPublic']) ? 1 : 0]);
        } catch (\PDOException $e) {
            if (($e->errorInfo[1] ?? 0) === 1062) throw new HttpError(409, 'Email o nickname già utilizzati.'); throw $e;
        }
        return (int) $this->s->db->lastInsertId();
    }
    public function login(array $body): int {
        $email = strtolower(trim((string) ($body['email'] ?? ''))); $password = (string) ($body['password'] ?? '');
        ensure(strlen($email) <= 190 && strlen($password) <= 72, 'Credenziali non valide.', 401);
        $u = $this->s->query('SELECT * FROM users WHERE email=?', [$email])->fetch();
        $hash = $u ? $u['password_hash'] : '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.';
        ensure(password_verify($password, $hash) && (bool) $u, 'Email o password non corrette.', 401);
        if (password_needs_rehash($u['password_hash'], PASSWORD_DEFAULT)) $this->s->query('UPDATE users SET password_hash=? WHERE id=?', [password_hash($password, PASSWORD_DEFAULT), $u['id']]);
        return (int) $u['id'];
    }
    public function update(int $uid, array $body): array {
        $country = self::country($body['country'] ?? null);
        $this->s->query('UPDATE users SET country=?,country_public=? WHERE id=?', [$country, !empty($body['countryPublic']) ? 1 : 0, $uid]);
        return $this->s->privateUser($uid);
    }
    public function changePassword(int $uid, array $body): void {
        $u = $this->s->user($uid);
        ensure(password_verify((string) ($body['currentPassword'] ?? ''), $u['password_hash']), 'Password attuale non corretta.', 403);
        $password = self::password($body['newPassword'] ?? null);
        $this->s->query('UPDATE users SET password_hash=? WHERE id=?', [password_hash($password, PASSWORD_DEFAULT), $uid]);
    }
    public function profile(int $uid): array {
        $row = $this->s->query('SELECT * FROM users WHERE id=?', [$uid])->fetch();
        ensure((bool) $row, 'Giocatore non trovato.', 404);
        $u = $this->s->publicUser($row);
        $rows = $this->s->query("SELECT m.outcome,m.player_a,m.delta_a,m.delta_b,m.reason,m.updated_at,u.id AS opponent_id,u.nickname AS opponent FROM matches m JOIN users u ON u.id=IF(m.player_a=?,m.player_b,m.player_a) WHERE (m.player_a=? OR m.player_b=?) AND m.mode='multi' AND m.status='finished' ORDER BY m.updated_at DESC,m.id DESC LIMIT 10", [$uid, $uid, $uid])->fetchAll();
        $u['recent'] = array_map(fn($r) => ['outcome' => $r['outcome'] === 'DRAW' ? 'D' : ($r['outcome'] === ((int) $r['player_a'] === $uid ? 'A_WIN' : 'B_WIN') ? 'W' : 'L'), 'delta' => (int) ((int) $r['player_a'] === $uid ? $r['delta_a'] : $r['delta_b']), 'opponent' => $r['opponent'], 'opponentId' => (int) $r['opponent_id'], 'reason' => $r['reason'], 'at' => $r['updated_at']], $rows);
        return $u;
    }
    public function ranking(string $type, int $page): array {
        ensure(in_array($type, ['xp', 'elo'], true), 'Classifica non valida.');
        $page = max(0, min(1000, $page)); $offset = $page * 25;
        $where = $type === 'elo' ? 'WHERE wins+draws+losses>0' : 'WHERE xp>0';
        $rows = $this->s->query("SELECT * FROM users $where ORDER BY $type DESC,id ASC LIMIT 26 OFFSET $offset")->fetchAll();
        return ['rows' => array_map(fn($u) => $this->s->publicUser($u), array_slice($rows, 0, 25)), 'hasMore' => count($rows) > 25, 'page' => $page];
    }
    public function suggestedCountry(string $ip): array {
        if (function_exists('geoip_country_code_by_name') && filter_var($ip, FILTER_VALIDATE_IP)) {
            $country = @geoip_country_code_by_name($ip);
            if ($country && in_array($country, explode(' ', self::COUNTRIES), true)) return ['country' => $country, 'source' => 'server'];
        }
        if (!empty($this->s->config['geoip_enabled']) && function_exists('curl_init') && filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
            $ch = curl_init('https://api.country.is/' . rawurlencode($ip));
            curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_CONNECTTIMEOUT_MS => 800, CURLOPT_TIMEOUT_MS => 1500, CURLOPT_FOLLOWLOCATION => false, CURLOPT_USERAGENT => 'DuelClub-V1']);
            $data = json_decode((string) curl_exec($ch), true); curl_close($ch);
            $country = $data['country'] ?? null;
            if (in_array($country, explode(' ', self::COUNTRIES), true)) return ['country' => $country, 'source' => 'country.is'];
        }
        return ['country' => null, 'source' => null];
    }
}
