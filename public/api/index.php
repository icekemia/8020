<?php
declare(strict_types=1);
if (is_file(dirname(__DIR__) . '/.duel-maintenance')) {
    http_response_code(503);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, private');
    header('Retry-After: 15');
    echo json_encode(['error' => 'Aggiornamento in corso. Riprova tra pochi secondi.']);
    exit;
}
require dirname(__DIR__, 2) . '/server/bootstrap.php';

use Duel\{Accounts, HttpError, Matches, Store};
use function Duel\ensure;

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, private');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');
ini_set('display_errors', '0');

function identify(?int $uid, ?string $stamp = null): string {
    session_start(); session_regenerate_id(true);
    $_SESSION = ['uid' => $uid, 'auth_stamp' => $stamp, 'csrf' => bin2hex(random_bytes(32)), 'created' => time()];
    $csrf = $_SESSION['csrf']; session_write_close(); return $csrf;
}
try {
    $config = duelConfig();
    session_name('duel_session');
    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    session_set_cookie_params(['httponly' => true, 'secure' => (bool) $config['secure_cookies'], 'samesite' => 'Lax', 'path' => '/']);
    session_start();
    if (isset($_SESSION['created']) && time() - $_SESSION['created'] > 604800) $_SESSION = [];
    $_SESSION['csrf'] ??= bin2hex(random_bytes(32)); $_SESSION['created'] ??= time();
    $csrf = $_SESSION['csrf']; $uid = isset($_SESSION['uid']) ? (int) $_SESSION['uid'] : null; $stamp = $_SESSION['auth_stamp'] ?? '';
    session_write_close(); // Polls from the same browser must not queue behind a session lock.
    $method = $_SERVER['REQUEST_METHOD']; $route = $_GET['route'] ?? 'session';
    ensure(is_string($route), 'Richiesta non valida.', 400);
    ensure(in_array($method, ['GET', 'POST'], true), 'Metodo non consentito.', 405);
    $body = [];
    if ($method === 'POST') {
        ensure(hash_equals($csrf, $_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''), 'Sessione scaduta. Ricarica la pagina.', 403);
        ensure(str_starts_with($_SERVER['CONTENT_TYPE'] ?? '', 'application/json'), 'Invia JSON.', 415);
        $raw = file_get_contents('php://input', false, null, 0, 16385);
        ensure(strlen($raw) <= 16384, 'Richiesta troppo grande.', 413);
        try { $body = json_decode($raw, true, 32, JSON_THROW_ON_ERROR); } catch (\JsonException) { throw new HttpError(400, 'JSON non valido.'); }
        ensure(is_array($body), 'Richiesta non valida.', 400);
    }
    $store = new Store($config); $accounts = new Accounts($store); $matches = new Matches($store);
    if ($uid !== null) {
        $expectedStamp = hash('sha256', $store->user($uid)['password_hash']);
        if (!hash_equals($expectedStamp, $stamp)) { identify(null); throw new HttpError(401, 'Password modificata. Accedi di nuovo.'); }
    }
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    $result = null;
    if ($method === 'GET') {
        $result = match ($route) {
            'session' => ['user' => $uid ? $store->privateUser($uid) : null, 'csrf' => $csrf, 'countryLookup' => !empty($config['geoip_enabled']), 'registrationCodeRequired' => ($config['registration_code'] ?? '') !== ''],
            'country' => (function () use ($store, $accounts, $ip) { $store->rate('country', $ip, 30, 3600); return $accounts->suggestedCountry($ip); })(),
            'ranking' => $accounts->ranking((string) ($_GET['type'] ?? 'xp'), (int) ($_GET['page'] ?? 0)),
            'profile' => $accounts->profile((int) ($_GET['id'] ?? 0)),
            'match', 'current' => (function () use ($uid, $route, $matches) { ensure($uid !== null, 'Accedi per giocare online.', 401); return $route === 'current' ? $matches->current($uid) : $matches->get((string) ($_GET['id'] ?? ''), $uid); })(),
            default => throw new HttpError(404, 'Endpoint non trovato.')
        };
    } elseif (in_array($route, ['login', 'register'], true)) {
        $store->rate($route, $ip, $route === 'login' ? 20 : 5, $route === 'login' ? 900 : 3600);
        $uid = $route === 'login' ? $accounts->login($body) : $accounts->register($body);
        $result = ['user' => $store->privateUser($uid), 'csrf' => identify($uid, hash('sha256', $store->user($uid)['password_hash']))];
    } elseif ($route === 'logout') {
        if ($uid) $store->query('DELETE FROM presence WHERE user_id=?', [$uid]);
        $result = ['user' => null, 'csrf' => identify(null)];
    } else {
        ensure($uid !== null, 'Accedi per continuare.', 401);
        $store->user($uid);
        $store->rate('writes', (string) $uid, 120, 60);
        if ($route === 'challenge') $store->rate('challenges', (string) $uid, 6, 60);
        $result = match ($route) {
            'lobby' => $matches->lobby($uid, ($body['available'] ?? false) === true),
            'challenge' => $matches->challenge($uid, isset($body['target']) && is_int($body['target']) ? $body['target'] : (isset($body['target']) ? throw new HttpError(422,'Giocatore non valido.') : null)),
            'decline-challenge' => $matches->declineChallenge($uid, (string)($body['id'] ?? '')),
            'rematch' => $matches->rematch($uid,(string)($body['id'] ?? ''),(string)($body['action'] ?? 'request')),
            'profile' => $accounts->update($uid, $body),
            'password' => (function () use ($accounts, $store, $uid, $body) { $accounts->changePassword($uid, $body); return ['csrf' => identify($uid, hash('sha256', $store->user($uid)['password_hash']))]; })(),
            'create' => $matches->create($uid, (string) ($body['mode'] ?? ''), (string) ($body['difficulty'] ?? 'hard')),
            'join' => $matches->join($uid, strtoupper(trim((string) ($body['code'] ?? '')))),
            'commit' => $matches->commit((string) ($body['id'] ?? ''), $uid, (string) ($body['phase'] ?? ''), $body['action'] ?? null),
            'leave' => $matches->leave((string) ($body['id'] ?? ''), $uid),
            default => throw new HttpError(404, 'Endpoint non trovato.')
        };
    }
    echo json_encode(['data' => $result], JSON_THROW_ON_ERROR);
} catch (HttpError $e) {
    http_response_code($e->status); echo json_encode(['error' => $e->getMessage()]);
} catch (\Throwable $e) {
    error_log('Duel API: ' . $e->getMessage());
    http_response_code(503); echo json_encode(['error' => 'Servizio temporaneamente non disponibile. Riprova.']);
}
