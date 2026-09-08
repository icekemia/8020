import { afterEach, it, expect, vi } from "vitest";
import {
  act,
  cleanup,
  render,
  screen,
  fireEvent,
} from "@testing-library/react";
import { GuestGame as App } from "./GuestGame";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("changes the portrait with the difficulty slider and carries the selection into the match", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({ split1: {}, split2: {}, fill: {} }),
      }),
  );
  render(<App />);
  expect(
    screen.getByRole("img", { name: "Ritratto di The Oracle" }),
  ).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Difficoltà bot"), {
    target: { value: "0" },
  });
  expect(
    screen.getByRole("img", { name: "Ritratto di The Rookie" }),
  ).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "easy" }).getAttribute("aria-pressed"),
  ).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "medium" }));
  expect(
    screen.getByRole("img", { name: "Ritratto di The Tactician" }),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "easy" }));
  await act(async () => {
    fireEvent.click(screen.getByText("Entra al tavolo"));
  });
  fireEvent.click(screen.getByText(/Ci sono, giochiamo/));
  expect(screen.getByText("EASY")).toBeTruthy();
  expect(screen.queryByLabelText("Difficoltà bot")).toBeNull();
});
