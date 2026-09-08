import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
  act,
  cleanup,
  render,
  screen,
  fireEvent,
} from "@testing-library/react";
import { GuestGame as App } from "./GuestGame";
const policy = {
  split1: { A: [[27, 1]], B: [[27, 1]] },
  split2: { "A1=27|B1=27|P=B": [[27, 1]] },
  fill: { "D=0,0,0|P=B": [[[20, 0, 0], 1]] },
};
beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => policy }),
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const advance = async (time: number) => {
  await act(async () => {
    vi.advanceTimersByTime(time);
  });
};
async function start() {
  render(<App />);
  await act(async () => {
    fireEvent.click(screen.getByText("Entra al tavolo"));
  });
  fireEvent.click(screen.getByText(/Ci sono, giochiamo/));
}
function split(index: number, value: string) {
  const input = screen.getByLabelText(`Split carta ${index}`);
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value } });
  fireEvent.click(screen.getByText("Conferma giocata"));
}
async function reachFill() {
  await start();
  split(1, "27");
  await advance(1300);
  split(2, "27");
  await advance(1400);
  await advance(1100);
  await advance(1700);
  fireEvent.click(screen.getByText(/Ci sono, giochiamo/));
}
describe("casino UI", () => {
  it("reveals cards in order, validates split and delays the automatic third card", async () => {
    await start();
    const first = screen.getByLabelText("Split carta 1") as HTMLInputElement;
    expect(
      (screen.getByLabelText("Split carta 2") as HTMLInputElement).disabled,
    ).toBe(true);
    expect(screen.queryByText("Conferma giocata")).toBeNull();
    fireEvent.focus(first);
    fireEvent.change(first, { target: { value: "79" } });
    expect(
      (
        screen
          .getByText("Conferma giocata")
          .closest("button") as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    split(1, "27");
    expect(screen.getByLabelText("Tua carta 1: 27")).toBeTruthy();
    expect(
      (screen.getByLabelText("Split carta 2") as HTMLInputElement).disabled,
    ).toBe(true);
    await advance(1300);
    expect(
      (screen.getByLabelText("Split carta 2") as HTMLInputElement).disabled,
    ).toBe(false);
    expect(screen.getByText(/Scegli da 1 a 52/)).toBeTruthy();
    split(2, "27");
    expect(screen.getByLabelText("Tua carta 3: coperta")).toBeTruthy();
    await advance(1400);
    expect(screen.getByLabelText("Tua carta 3: coperta")).toBeTruthy();
    await advance(1100);
    expect(screen.getByLabelText("Tua carta 3: 26")).toBeTruthy();
    expect(
      (screen.getByLabelText("Split carta 3") as HTMLInputElement).value,
    ).toBe("26");
  });
  it("balances Fill, animates results, awards XP once and resets on replay", async () => {
    await reachFill();
    fireEvent.change(screen.getByLabelText("Fill carta 1"), {
      target: { value: "20" },
    });
    expect(
      (screen.getByLabelText("Fill carta 2") as HTMLInputElement).value,
    ).toBe("0");
    expect(
      (screen.getByLabelText("Fill carta 3") as HTMLInputElement).value,
    ).toBe("0");
    fireEvent.click(screen.getByLabelText("Aumenta Fill carta 2"));
    const values = [1, 2, 3].map((i) =>
      Number(
        (screen.getByLabelText(`Fill carta ${i}`) as HTMLInputElement).value,
      ),
    );
    expect(values.reduce((a, b) => a + b)).toBe(20);
    fireEvent.click(screen.getByText("Conferma Fill"));
    expect(screen.queryByRole("dialog")).toBeNull();
    await advance(1700);
    expect(document.querySelector(".winning")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    await advance(1400);
    expect(screen.getByRole("dialog")).toBeTruthy();
    const xp = localStorage.getItem("duel8020.xp");
    expect(Number(xp)).toBeGreaterThan(0);
    await advance(5000);
    expect(localStorage.getItem("duel8020.xp")).toBe(xp);
    await act(async () => {
      fireEvent.click(screen.getByText("Rivincita"));
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByText(/Ci sono, giochiamo/));
    expect(
      (screen.getByLabelText("Split carta 1") as HTMLInputElement).value,
    ).toBe("");
    expect(screen.getByLabelText("Tua carta 1: coperta")).toBeTruthy();
  });
  it("finishes a decided position without presenting Fill", async () => {
    const decided = {
      split1: { B: [[40, 1]] },
      split2: { "A1=1|B1=40|P=B": [[39, 1]] },
      fill: { "D=-39,-38,77|P=B": [[[20, 0, 0], 1]] },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => decided }),
    );
    await start();
    split(1, "1");
    await advance(1300);
    split(2, "1");
    await advance(1400);
    await advance(1100);
    await advance(1700);
    expect(screen.getByText("YOU LOSE")).toBeTruthy();
    expect(screen.queryByLabelText("Fill carta 1")).toBeNull();
    expect(screen.getByText(/nessun Fill può cambiarlo/)).toBeTruthy();
    expect(localStorage.getItem("duel8020.xp")).toBe("10");
  });
  it("shows a retryable loading error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    render(<App />);
    await act(async () => {
      fireEvent.click(screen.getByText("Entra al tavolo"));
    });
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(
      (
        screen
          .getByText("Entra al tavolo")
          .closest("button") as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });
});
