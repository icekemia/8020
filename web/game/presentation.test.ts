import { describe, expect, it } from "vitest";
import { Game, enumerateFillActions } from "./core";
import {
  decidedOutcome,
  estimateAdvantage,
  redistributeFill,
} from "./presentation";
const position = (a: number[], b: number[]): Game => ({
  phase: "FILL_COMMIT",
  split: { A: a, B: b },
  pending: {},
  fill: {},
});
describe("table rules", () => {
  it("skips Fill only when no legal pair can change the outcome", () => {
    expect(decidedOutcome(position([1, 1, 78], [40, 39, 1]))).toBe("B_WIN");
    expect(decidedOutcome(position([40, 39, 1], [1, 1, 78]))).toBe("A_WIN");
    expect(
      decidedOutcome(position([27, 27, 26], [27, 27, 26])),
    ).toBeUndefined();
    // Exactly 20 ahead is still contestable: the opponent can force a tie.
    expect(
      decidedOutcome(position([31, 30, 19], [11, 10, 59])),
    ).toBeUndefined();
  });
  it("preserves the Fill budget through every legal edit", () => {
    for (const fill of enumerateFillActions())
      for (let i = 0; i < 3; i++)
        for (let value = 0; value <= 20; value++) {
          const next = redistributeFill(fill, i, value);
          expect(next[i]).toBe(value);
          expect(next.reduce((a, b) => a + b)).toBe(20);
          expect(
            next.every((x) => Number.isInteger(x) && x >= 0 && x <= 20),
          ).toBe(true);
        }
  });
  it("rejects invalid Fill edits without changing the allocation", () => {
    for (const value of [-1, 21, 1.5, NaN])
      expect(redistributeFill([7, 7, 6], 0, value)).toEqual([7, 7, 6]);
  });
  it("estimates only public completions and handles decided positions", () => {
    expect(estimateAdvantage([], [])).toBe(50);
    expect(estimateAdvantage([40, 39, 1], [1, 1, 78])).toBe(100);
    expect(estimateAdvantage([1, 1, 78], [40, 39, 1])).toBe(0);
    expect(estimateAdvantage([27], [27])).toBe(50);
    expect(estimateAdvantage([40, 39], [1, 1])).toBe(100);
  });
});
