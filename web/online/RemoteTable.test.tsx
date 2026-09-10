import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { RemoteTable, remoteStage } from "./RemoteTable";
import { api, type Snapshot, type Account } from "./api";
vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api")>()),
  api: vi.fn(),
}));
const user: Account = {
  id: 1,
  nickname: "Alice",
  country: null,
  xp: 0,
  elo: 1200,
  peak_elo: 1200,
  wins: 0,
  draws: 0,
  losses: 0,
  best_streak: 0,
  provisional: true,
  email: "alice@example.test",
  selectedCountry: null,
  countryPublic: false,
};
const fixture = (patch: Partial<Snapshot> = {}): Snapshot => ({
  id: "a".repeat(32),
  code: null,
  mode: "multi",
  difficulty: null,
  status: "active",
  game: {
    phase: "SPLIT_1_COMMIT",
    split: { A: [], B: [] },
    fill: {},
    pending: {},
  },
  ownCommitted: false,
  opponentCommitted: false,
  opponent: { ...user, id: 2, nickname: "Bob" },
  me: user,
  phaseAt: 1000,
  opensAt: 4000,
  deadlineAt: 64000,
  serverNow: 4000,
  version: 1,
  reason: null,
  reward: { xp: 0, elo: 0 },
  ...patch,
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
});
it.each(["expired", "declined", "abandon"] as const)(
  "does not offer review for an unaccepted invite ended by %s",
  (reason) => {
    const s = fixture({
      status: "cancelled",
      opponent: null,
      reason,
      serverNow: 6000,
    });
    vi.mocked(api).mockResolvedValue(s);
    render(
      <RemoteTable initial={s} onExit={() => {}} onAccount={() => {}} />,
    );
    expect(screen.queryByText("Rivedi il tavolo")).toBeNull();
    expect(screen.getByText("INVITO CONCLUSO")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Torna al club/ })).toBeTruthy();
  },
);
it.each(["easy", "medium", "hard"] as const)(
  "restarts the same %s bot from the result or review",
  async (difficulty) => {
    const s = fixture({
      mode: "bot",
      difficulty,
      status: "finished",
      reason: "completed",
      serverNow: 6000,
    });
    const next = fixture({ id: "b".repeat(32), mode: "bot", difficulty });
    vi.mocked(api).mockImplementation(async (route) =>
      route === "create" ? next : s,
    );
    const onNext = vi.fn();
    render(
      <RemoteTable
        initial={s}
        onExit={() => {}}
        onAccount={() => {}}
        onNext={onNext}
      />,
    );
    if (difficulty === "medium")
      fireEvent.click(screen.getByText("Rivedi il tavolo"));
    fireEvent.click(screen.getByText("Rigioca con lo stesso bot"));
    expect(api).toHaveBeenCalledWith("create", { mode: "bot", difficulty });
    await waitFor(() => expect(onNext).toHaveBeenCalledWith(next));
  },
);
it("keeps the completed bot game available after a failed restart", async () => {
  const s = fixture({
    mode: "bot",
    difficulty: "easy",
    status: "finished",
    reason: "completed",
    serverNow: 6000,
  });
  vi.mocked(api).mockImplementation(async (route) => {
    if (route === "create") throw new Error("Connessione interrotta");
    return s;
  });
  const onNext = vi.fn();
  render(
    <RemoteTable
      initial={s}
      onExit={() => {}}
      onAccount={() => {}}
      onNext={onNext}
    />,
  );
  fireEvent.click(screen.getByText("Rigioca con lo stesso bot"));
  await screen.findAllByText("Connessione interrotta");
  expect(onNext).not.toHaveBeenCalled();
  expect(
    (screen.getByText("Rigioca con lo stesso bot") as HTMLButtonElement)
      .disabled,
  ).toBe(false);
  expect(screen.getByText("Rivedi il tavolo")).toBeTruthy();
});
describe("server-driven presentation", () => {
  it("opens the first input only after the shared intro deadline", () => {
    expect(remoteStage(fixture(), 3999)).toBe("split-intro");
    expect(remoteStage(fixture(), 4000)).toBe("split1");
  });
  it("gives the automatic third card a phase before Fill opens", () => {
    const s = fixture({
      game: {
        phase: "FILL_COMMIT",
        split: { A: [27, 27, 26], B: [27, 27, 26] },
        fill: {},
        pending: {},
      },
      phaseAt: 1000,
      opensAt: 8000,
      deadlineAt: 68000,
    });
    expect(remoteStage(s, 2000)).toBe("reveal2");
    expect(remoteStage(s, 2500)).toBe("third");
    expect(remoteStage(s, 4000)).toBe("reveal3");
    expect(remoteStage(s, 6000)).toBe("fill-intro");
    expect(remoteStage(s, 8000)).toBe("fill");
  });
  it("shows final counts and winners before the result overlay", () => {
    const s = fixture({ status: "finished", reason: "completed" });
    expect(remoteStage(s, 1000)).toBe("counting");
    expect(remoteStage(s, 2800)).toBe("highlight");
    expect(remoteStage(s, 4200)).toBe("result");
  });
  it("skips Fill for early endings but still reveals the third card", () => {
    const s = fixture({ status: "finished", reason: "decided" });
    expect(remoteStage(s, 2500)).toBe("third");
    expect(remoteStage(s, 4000)).toBe("reveal3");
    expect(remoteStage(s, 5200)).toBe("result");
  });
  it("restores a submitted choice as locked after reconnecting", async () => {
    const s = fixture({
      ownCommitted: true,
      game: {
        phase: "SPLIT_1_COMMIT",
        split: { A: [], B: [] },
        fill: {},
        pending: { A: 27 },
      },
    });
    vi.mocked(api).mockResolvedValue(s);
    render(<RemoteTable initial={s} onExit={() => {}} onAccount={() => {}} />);
    expect(
      (screen.getByLabelText("Split carta 1") as HTMLInputElement).value,
    ).toBe("27");
    expect(
      (screen.getByLabelText("Split carta 1") as HTMLInputElement).disabled,
    ).toBe(true);
    expect(screen.getByText(/Scelta confermata. Aspettiamo/)).toBeTruthy();
    expect(screen.getByLabelText("Avversario carta 1: coperta")).toBeTruthy();
  });
  it("locks an unsubmitted choice as soon as server time expires", () => {
    const s = fixture({ deadlineAt: 4000, serverNow: 4001 });
    vi.mocked(api).mockResolvedValue(s);
    render(<RemoteTable initial={s} onExit={() => {}} onAccount={() => {}} />);
    expect(
      (screen.getByLabelText("Split carta 1") as HTMLInputElement).disabled,
    ).toBe(true);
    expect(screen.getByRole("timer").textContent).toBe("0s");
  });
  it("submits the expected phase and waits for the other player", async () => {
    const s = fixture();
    vi.mocked(api).mockImplementation(async (route) =>
      route === "commit"
        ? {
            ...s,
            version: 2,
            ownCommitted: true,
            game: { ...s.game, pending: { A: 27 } },
          }
        : s,
    );
    render(<RemoteTable initial={s} onExit={() => {}} onAccount={() => {}} />);
    fireEvent.focus(screen.getByLabelText("Split carta 1"));
    fireEvent.change(screen.getByLabelText("Split carta 1"), {
      target: { value: "27" },
    });
    fireEvent.click(screen.getByText("Conferma giocata"));
    expect(
      await screen.findByText(/Scelta confermata. Aspettiamo/),
    ).toBeTruthy();
    expect(api).toHaveBeenCalledWith("commit", {
      id: s.id,
      phase: "SPLIT_1_COMMIT",
      action: 27,
    });
  });
});

it("Easy helpers preview own totals and remain optional", async () => {
  const s = fixture({
    mode: "bot",
    difficulty: "easy",
    deadlineAt: null,
    game: {
      phase: "FILL_COMMIT",
      split: { A: [26, 27, 27], B: [27, 26, 27] },
      pending: {},
      fill: {},
    },
  });
  vi.mocked(api).mockResolvedValue(s);
  render(<RemoteTable initial={s} onExit={() => {}} onAccount={() => {}} />);
  expect(screen.queryByLabelText(/totale provvisorio/)).toBeNull();
  fireEvent.click(screen.getByRole("switch"));
  expect(
    screen.getByLabelText("Tua carta 1: 26, totale provvisorio 33"),
  ).toBeTruthy();
  expect(screen.getByLabelText("Differenza carta 1: 6")).toBeTruthy();
  fireEvent.click(screen.getByLabelText("Aumenta Fill carta 1"));
  expect(
    screen.getByLabelText("Tua carta 1: 26, totale provvisorio 34"),
  ).toBeTruthy();
  expect(screen.getByLabelText("Avversario carta 1: 27")).toBeTruthy();
  expect(localStorage.getItem("duel8020.mathHelp")).toBe("true");
  fireEvent.click(screen.getByRole("switch"));
  expect(screen.queryByLabelText(/totale provvisorio/)).toBeNull();
});
it("review uncovers the finished table and lets the opponent accept a rematch", async () => {
  const s = fixture({
    status: "finished",
    reason: "completed",
    serverNow: 6000,
    rematch: { mine: false, state: "pending", expiresAt: 60000, nextId: null },
    game: {
      phase: "FINISHED",
      split: { A: [26, 27, 27], B: [27, 26, 27] },
      fill: { A: [20, 0, 0], B: [0, 20, 0] },
      pending: {},
      result: { outcome: "DRAW", scores: [1.5, 1.5] },
    },
  });
  vi.mocked(api).mockResolvedValue(s);
  render(<RemoteTable initial={s} onExit={() => {}} onAccount={() => {}} />);
  fireEvent.click(screen.getByText("Rivedi il tavolo"));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getAllByText("26 + 20 = 46")).toHaveLength(2);
  fireEvent.click(screen.getByText("Accetta rivincita"));
  expect(api).toHaveBeenCalledWith("rematch", { id: s.id, action: "accept" });
});
