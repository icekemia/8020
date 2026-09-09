import {enumerateFillActions, Fill, Game, Player, RULES} from '../game/core';
import {Policy, RandomSource, difficultFill, difficultSplit1, difficultSplit2, sample} from './difficult';
export type Difficulty = 'easy' | 'medium' | 'hard';
const fills = enumerateFillActions();
const pick = <T,>(items: readonly T[], rng: RandomSource): T => sample(items.map(item => [item, 1 / items.length]), rng);
export function fillPayoff(margins: readonly number[], own: Fill, opponent: Fill): number {
  return Math.sign(margins.reduce((score, margin, i) => score + Math.sign(margin + own[i] - opponent[i]), 0));
}
function beginnerFill(margins: number[], rng: RandomSource): Fill {
  // Beginners anticipate a balanced opponent, without solving minimax.
  const opponents = fills.filter(f => f.every(x => x >= 4 && x <= 9));
  const scored = fills.map(action => ({action, score: opponents.reduce((s, opponent) => s + fillPayoff(margins, action, opponent), 0) / opponents.length}));
  const best = Math.max(...scored.map(x => x.score));
  return pick(scored.filter(x => x.score >= best - 0.25).map(x => x.action), rng);
}
function variedHardFill(policy: Policy, margins: number[], seat: Player, rng: RandomSource): Fill {
  const selected = difficultFill(policy, margins, seat, rng);
  const ownMargins = margins.map(x => seat === 'A' ? x : -x);
  const outcomes = fills.map(opponent => fillPayoff(ownMargins, selected, opponent));
  // Identical payoffs against every legal reply preserve the mixed strategy guarantee.
  return pick(fills.filter(action => fills.every((opponent, i) => fillPayoff(ownMargins, action, opponent) === outcomes[i])), rng);
}
export function chooseBotAction(policy: Policy, game: Game, seat: Player, rng: RandomSource, difficulty: Difficulty): number | Fill {
  const expert = difficulty === 'hard' || (difficulty === 'medium' && rng.next() < 0.65);
  if (game.phase === 'SPLIT_1_COMMIT') {
    if (expert) return difficultSplit1(policy, seat, rng);
    return pick(Array.from({length: 25}, (_, i) => i + 15), rng);
  }
  if (game.phase === 'SPLIT_2_COMMIT') {
    if (expert) return difficultSplit2(policy, game.split.A[0], game.split.B[0], seat, rng);
    const remaining = RULES.split - game.split[seat][0];
    const low = Math.max(1, Math.floor(remaining * 0.3));
    const high = Math.min(remaining - 1, Math.ceil(remaining * 0.7));
    return pick(Array.from({length: high - low + 1}, (_, i) => low + i), rng);
  }
  if (game.phase === 'FILL_COMMIT') {
    const margins = game.split.A.map((x, i) => x - game.split.B[i]);
    if (expert) return variedHardFill(policy, margins, seat, rng);
    return beginnerFill(margins.map(x => seat === 'A' ? x : -x), rng);
  }
  throw new Error('Cannot choose an action for a finished game');
}
