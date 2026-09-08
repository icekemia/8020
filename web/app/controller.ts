import {Game, Player, Fill, commitAction, createGame} from '../game/core';
import {Policy, RandomSource} from '../bot/difficult';
import {chooseBotAction, Difficulty} from '../bot/levels';
export class LocalMatch {
  private state: Game = createGame();
  private botPending: number | Fill | undefined;
  constructor(private readonly policy: Policy, private readonly bot: Player, private readonly rng: RandomSource, readonly difficulty: Difficulty = 'hard') { this.chooseBot(); }
  get game() { return this.state; }
  get hasPrivateBotCommit() { return this.botPending !== undefined; }
  private chooseBot() { this.botPending = chooseBotAction(this.policy, this.state, this.bot, this.rng, this.difficulty); }
  commitHuman(action: number | Fill) {
    const human = this.bot === 'A' ? 'B' : 'A';
    let next = commitAction(this.state, human, action);
    if (next.pending[human] !== undefined && this.botPending !== undefined) next = commitAction(next, this.bot, this.botPending);
    this.state = next;
    this.botPending = undefined;
    if (this.state.phase !== 'FINISHED') this.chooseBot();
    return this.state;
  }
}
