import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { LocalMatch } from "../app/controller";
import { chooseBotAction, Difficulty, fillPayoff } from "./levels";
import { Policy } from "./difficult";
import { enumerateFillActions, Fill, Game } from "../game/core";
const policy = JSON.parse(
  fs.readFileSync("public/policies/80_20_difficult.policy.json", "utf8"),
) as Policy;
function random(seed: number) {
  return {
    next: () =>
      (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32,
  };
}
describe("difficulty levels", () => {
  for (const level of ["easy", "medium", "hard"] as Difficulty[]) {
    it(`${level} completes legal matches in either seat`, () => {
      for (const seat of ["A", "B"] as const)
        for (let seed = 1; seed <= 40; seed++) {
          const match = new LocalMatch(policy, seat, random(seed), level);
          expect(match.hasPrivateBotCommit).toBe(true);
          match.commitHuman(1 + (seed % 78));
          match.commitHuman(1);
          match.commitHuman([seed % 21, 20 - (seed % 21), 0]);
          expect(match.game.phase).toBe("FINISHED");
        }
    });
  }
  it("easy protects a contestable manche instead of wasting fill on decided manches", () => {
    const game: Game = {
      phase: "FILL_COMMIT",
      split: { A: [60, 10, 10], B: [10, 60, 10] },
      pending: {},
      fill: {},
    };
    for (let seed = 1; seed <= 30; seed++) {
      const action = chooseBotAction(
        policy,
        game,
        "B",
        random(seed),
        "easy",
      ) as Fill;
      expect(action[2]).toBeGreaterThanOrEqual(9);
    }
  });
  it("hard varies equivalent fills without changing any matchup payoff", () => {
    const game: Game = {
      phase: "FILL_COMMIT",
      split: { A: [60, 10, 10], B: [10, 60, 10] },
      pending: {},
      fill: {},
    };
    const fixture: Policy = {
      split1: { A: [], B: [] },
      split2: {},
      fill: { "D=50,-50,0|P=B": [[[0, 0, 20], 1]] },
    };
    // In this state only committing all 20 to the third manche is equivalent.
    const actions = new Set<string>();
    const decided: Game = { ...game, split: { A: [55, 24, 1], B: [1, 1, 78] } };
    fixture.fill["D=54,23,-77|P=B"] = [[[20, 0, 0], 1]];
    const rng = random(42);
    for (let i = 0; i < 30; i++) {
      const action = chooseBotAction(
        fixture,
        decided,
        "B",
        rng,
        "hard",
      ) as Fill;
      actions.add(action.join(","));
      for (const opponent of enumerateFillActions())
        expect(fillPayoff([-54, -23, 77], action, opponent)).toBe(
          fillPayoff([-54, -23, 77], [20, 0, 0], opponent),
        );
    }
    expect(actions.size).toBeGreaterThan(10);
    expect(chooseBotAction(fixture, game, "B", rng, "hard")).toEqual([
      0, 0, 20,
    ]);
  });
});

it("medium and hard put no Fill on cards locked by a gap over 20", () => {
  const game: Game = {
    phase: "FILL_COMMIT",
    split: { A: [60, 10, 10], B: [10, 60, 10] },
    pending: {},
    fill: {},
  };
  for (const difficulty of ["medium", "hard"] as const)
    for (let seed = 1; seed <= 25; seed++) {
      expect(
        chooseBotAction(policy, game, "B", random(seed), difficulty),
      ).toEqual([0, 0, 20]);
    }
});
it("replaces wasted policy allocations without worsening any opponent response", () => {
  const game: Game = {
    phase: "FILL_COMMIT",
    split: { A: [60, 10, 10], B: [10, 60, 10] },
    pending: {},
    fill: {},
  };
  const fixture: Policy = {
    split1: { A: [], B: [] },
    split2: {},
    fill: { "D=50,-50,0|P=B": [[[7, 7, 6], 1]] },
  };
  const action = chooseBotAction(fixture, game, "B", random(1), "hard") as Fill;
  expect(action).toEqual([0, 0, 20]);
  for (const opponent of enumerateFillActions())
    expect(fillPayoff([-50, 50, 0], action, opponent)).toBeGreaterThanOrEqual(
      fillPayoff([-50, 50, 0], [7, 7, 6], opponent),
    );
});
it("hard still varies its Fill in a contested position", () => {
  const game: Game = {
    phase: "FILL_COMMIT",
    split: { A: [27, 27, 26], B: [27, 27, 26] },
    pending: {},
    fill: {},
  };
  const rng = random(42),
    actions = new Set<string>();
  for (let i = 0; i < 30; i++)
    actions.add(
      (chooseBotAction(policy, game, "B", rng, "hard") as Fill).join(","),
    );
  expect(actions.size).toBeGreaterThan(1);
});
