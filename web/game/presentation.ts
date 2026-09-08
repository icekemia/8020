import { enumerateFillActions, Fill, Game } from "./core";
import { fillPayoff } from "../bot/levels";
export type Outcome = "A_WIN" | "B_WIN" | "DRAW";
const fills = enumerateFillActions();
const outcome = (n: number): Outcome =>
  n > 0 ? "A_WIN" : n < 0 ? "B_WIN" : "DRAW";

// Exact enumeration: skipping Fill is allowed only if ALL pairs give the same outcome.
export function decidedOutcome(game: Game): Outcome | undefined {
  if (game.split.A.length !== 3 || game.split.B.length !== 3) return undefined;
  const margins = game.split.A.map((x, i) => x - game.split.B[i]);
  const first = fillPayoff(margins, fills[0], fills[0]);
  for (const a of fills)
    for (const b of fills)
      if (fillPayoff(margins, a, b) !== first) return undefined;
  return outcome(first);
}

// An illustrative public-state estimate, NOT calibrated odds against this bot.
// Uniform legal completions, with draws contributing half a point.
export function estimateAdvantage(
  a: readonly number[],
  b: readonly number[],
): number {
  if (!a.length || (a.length === b.length && a.every((x, i) => x === b[i])))
    return 50;
  let seed = 8020;
  const random = (max: number) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return Math.floor((seed / 2 ** 32) * max);
  };
  const complete = (known: readonly number[]) => {
    if (known.length === 3) return known;
    const second = known[1] ?? 1 + random(79 - known[0]);
    return [known[0], second, 80 - known[0] - second];
  };
  let points = 0;
  for (let i = 0; i < 1600; i++) {
    const aa = complete(a),
      bb = complete(b);
    points +=
      (fillPayoff(
        aa.map((x, j) => x - bb[j]),
        fills[random(fills.length)],
        fills[random(fills.length)],
      ) +
        1) /
      2;
  }
  return Math.round(points / 16);
}

// Redistribute the delta across the other cards, always preserving exactly 20.
export function redistributeFill(
  current: Fill,
  index: number,
  value: number,
): Fill {
  if (
    !Number.isInteger(value) ||
    value < 0 ||
    value > 20 ||
    index < 0 ||
    index > 2
  )
    return current;
  const next = [...current] as [number, number, number];
  let delta = value - next[index];
  next[index] = value;
  for (let step = 1; step <= 2; step++) {
    const j = (index + step) % 3;
    const transfer =
      delta > 0 ? Math.min(delta, next[j]) : Math.max(delta, next[j] - 20);
    next[j] -= transfer;
    delta -= transfer;
  }
  return next;
}
