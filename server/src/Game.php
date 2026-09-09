<?php
declare(strict_types=1);
namespace Duel;

final class HttpError extends \RuntimeException {
    public function __construct(public int $status, string $message) { parent::__construct($message); }
}
function ensure(bool $condition, string $message, int $status = 422): void {
    if (!$condition) throw new HttpError($status, $message);
}
function nowMs(): int { return (int) floor(microtime(true) * 1000); }

final class Game {
    public static function create(): array {
        return ['phase' => 'SPLIT_1_COMMIT', 'split' => ['A' => [], 'B' => []], 'fill' => [], 'pending' => []];
    }
    public static function fills(): array {
        static $actions = null;
        if ($actions === null) {
            $actions = [];
            for ($x = 0; $x <= 20; $x++) for ($y = 0; $y <= 20 - $x; $y++) $actions[] = [$x, $y, 20 - $x - $y];
        }
        return $actions;
    }
    public static function validate(array $g, string $seat, mixed $action): void {
        if ($g['phase'] === 'FILL_COMMIT') {
            ensure(is_array($action) && array_is_list($action) && count($action) === 3, 'Distribuisci il Fill su tre carte.');
            foreach ($action as $n) ensure(is_int($n) && $n >= 0 && $n <= 20, 'Il Fill accetta interi da 0 a 20.');
            ensure(array_sum($action) === 20, 'Il totale del Fill deve essere 20.');
            return;
        }
        ensure(in_array($g['phase'], ['SPLIT_1_COMMIT', 'SPLIT_2_COMMIT'], true), 'Fase conclusa.', 409);
        $max = $g['phase'] === 'SPLIT_1_COMMIT' ? 78 : 79 - $g['split'][$seat][0];
        ensure(is_int($action) && $action >= 1 && $action <= $max, "Scegli un intero da 1 a $max.");
    }
    public static function outcome(array $margins, array $a, array $b): int {
        $score = 0;
        for ($i = 0; $i < 3; $i++) $score += ($margins[$i] + $a[$i] - $b[$i]) <=> 0;
        return $score <=> 0;
    }
    public static function name(int $n): string { return $n > 0 ? 'A_WIN' : ($n < 0 ? 'B_WIN' : 'DRAW'); }
    public static function decided(array $g): ?string {
        $margins = array_map(fn($a, $b) => $a - $b, $g['split']['A'], $g['split']['B']);
        if (count($margins) !== 3) return null;
        $fills = self::fills();
        $first = self::outcome($margins, $fills[0], $fills[0]);
        foreach ($fills as $a) foreach ($fills as $b) if (self::outcome($margins, $a, $b) !== $first) return null;
        return self::name($first);
    }
    public static function commit(array $g, string $seat, mixed $action): array {
        self::validate($g, $seat, $action);
        ensure(!array_key_exists($seat, $g['pending']), 'Scelta già confermata.', 409);
        $g['pending'][$seat] = $action;
        if (count($g['pending']) < 2) return $g;
        if ($g['phase'] === 'FILL_COMMIT') {
            $g['fill'] = $g['pending'];
            $winsA = $winsB = 0;
            for ($i = 0; $i < 3; $i++) {
                $delta = $g['split']['A'][$i] + $g['fill']['A'][$i] - $g['split']['B'][$i] - $g['fill']['B'][$i];
                if ($delta > 0) $winsA++;
                if ($delta < 0) $winsB++;
            }
            $ties = 3 - $winsA - $winsB;
            $g['result'] = ['scores' => [$winsA + $ties / 2, $winsB + $ties / 2], 'outcome' => self::name($winsA <=> $winsB)];
            $g['phase'] = 'FINISHED';
        } else {
            foreach (['A', 'B'] as $p) $g['split'][$p][] = $g['pending'][$p];
            if ($g['phase'] === 'SPLIT_1_COMMIT') $g['phase'] = 'SPLIT_2_COMMIT';
            else {
                foreach (['A', 'B'] as $p) $g['split'][$p][] = 80 - array_sum($g['split'][$p]);
                $g['phase'] = 'FILL_COMMIT';
                if ($fixed = self::decided($g)) { $g['phase'] = 'FINISHED'; $g['result'] = ['outcome' => $fixed]; }
            }
        }
        $g['pending'] = [];
        return $g;
    }
}

final class Bot {
    public static function usefulFills(array $margins): array {
        $useful = array_values(array_filter(Game::fills(), function($a) use ($margins) {
            foreach ($a as $i => $n) if ($n > (abs($margins[$i]) > 20 ? 0 : min(20, 21 - $margins[$i]))) return false;
            return true;
        }));
        return $useful ?: Game::fills();
    }
    private static function random(): float { return random_int(0, 4294967295) / 4294967296; }
    public static function sample(array $distribution): mixed {
        ensure(count($distribution) > 0, 'Strategia bot non disponibile.', 503);
        $total = array_sum(array_column($distribution, 1));
        ensure(abs($total - 1) < 0.000001, 'Strategia bot non valida.', 503);
        $x = self::random();
        foreach ($distribution as [$action, $p]) { $x -= $p; if ($p > 0 && $x < 0) return $action; }
        return $distribution[array_key_last($distribution)][0];
    }
    public static function choose(array $game, string $difficulty, string $path): mixed {
        $expert = $difficulty === 'hard' || ($difficulty === 'medium' && self::random() < 0.65);
        $phase = $game['phase'];
        $margins = array_map(fn($a, $b) => $a - $b, $game['split']['A'], $game['split']['B']);
        if ($expert) {
            static $policies = [];
            if (!isset($policies[$path])) {
                ensure(is_file($path), 'Strategia bot non installata.', 503);
                $policies[$path] = json_decode(file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
            }
            $policy = $policies[$path];
            $distribution = match ($phase) {
                'SPLIT_1_COMMIT' => $policy['split1']['B'] ?? [],
                'SPLIT_2_COMMIT' => $policy['split2']['A1=' . $game['split']['A'][0] . '|B1=' . $game['split']['B'][0] . '|P=B'] ?? [],
                default => $policy['fill']['D=' . implode(',', $margins) . '|P=B'] ?? []
            };
            $selected = self::sample($distribution);
            if ($phase !== 'FILL_COMMIT') return $selected;
            $own = array_map(fn($x) => -$x, $margins);
            $fills = Game::fills();
            $outcomes = array_map(fn($b) => Game::outcome($own, $selected, $b), $fills);
            $equivalent = [];
            $useful = self::usefulFills($own);
            foreach ($useful as $a) {
                foreach ($fills as $i => $b) if (Game::outcome($own, $a, $b) !== $outcomes[$i]) continue 2;
                $equivalent[] = $a;
            }
            if (!$equivalent) foreach ($useful as $a) {
                foreach ($fills as $i => $b) if (Game::outcome($own, $a, $b) < $outcomes[$i]) continue 2;
                $equivalent[] = $a;
            }
            return $equivalent[random_int(0, count($equivalent) - 1)];
        }
        if ($phase === 'SPLIT_1_COMMIT') return random_int(15, 39);
        if ($phase === 'SPLIT_2_COMMIT') {
            $remaining = 80 - $game['split']['B'][0];
            return random_int(max(1, (int) floor($remaining * .3)), min($remaining - 1, (int) ceil($remaining * .7)));
        }
        $own = array_map(fn($x) => -$x, $margins);
        $opponents = array_values(array_filter(Game::fills(), fn($a) => min($a) >= 4 && max($a) <= 9));
        $scores = [];
        foreach (self::usefulFills($own) as $a) $scores[] = [$a, array_sum(array_map(fn($b) => Game::outcome($own, $a, $b), $opponents)) / count($opponents)];
        $best = max(array_column($scores, 1));
        $good = array_values(array_filter($scores, fn($x) => $x[1] >= $best - .25));
        return $good[random_int(0, count($good) - 1)][0];
    }
}
