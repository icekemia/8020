import React from "react";
import { afterEach, it, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Club } from "./Club";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  history.replaceState({}, "", location.pathname);
  localStorage.clear();
});
it("keeps the guest game available if PHP is not configured", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({ error: "Backend not configured" }),
      }),
  );
  render(<Club />);
  expect(await screen.findByText(/Account offline/)).toBeTruthy();
  expect(
    (screen.getByText("Entra al tavolo").closest("button") as HTMLButtonElement)
      .disabled,
  ).toBe(false);
});
it("uses database XP after login without importing the guest balance", async () => {
  localStorage.setItem("duel8020.xp", "999999");
  const user = {
    id: 1,
    nickname: "Alice",
    xp: 30,
    elo: 1200,
    provisional: true,
    country: null,
  };
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockImplementation(async (url: string) => ({
        ok: true,
        json: async () => ({
          data: url.includes("route=session") ? { user, csrf: "test" } : null,
        }),
      })),
  );
  render(<Club />);
  expect(await screen.findByText("Sfida il bot")).toBeTruthy();
  expect(screen.queryByText("999.999")).toBeNull();
  expect(localStorage.getItem("duel8020.xp")).toBe("999999");
});
