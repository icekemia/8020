import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LobbyHub } from "./LobbyHub";
import { api } from "./api";
vi.mock("./api", () => ({ api: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const player = {
  id: 2,
  nickname: "Bob",
  elo: 1200,
  country: null,
  available: true,
};
const offer = {
  id: "a".repeat(32),
  code: "A123456789",
  targeted: true,
  expiresAt: 61000,
  from: player,
};
it("shows only available players as challengeable and sends a direct invite", async () => {
  vi.mocked(api).mockImplementation(async (route) =>
    route === "lobby"
      ? {
          players: [
            player,
            { ...player, id: 3, nickname: "Carol", available: false },
          ],
          offers: [],
          current: null,
          serverNow: 1000,
        }
      : { id: "new" },
  );
  const enter = vi.fn();
  render(<LobbyHub userId={1} inMatch={false} showPlayers onMatch={enter} />);
  expect(
    ((await screen.findByText("Sfida Carol")) as HTMLButtonElement).disabled,
  ).toBe(true);
  fireEvent.click(screen.getByText("Sfida Bob"));
  expect(api).toHaveBeenCalledWith("challenge", { target: 2 });
});
it("offers a prompt for incoming challenges and lets the target decline", async () => {
  vi.mocked(api).mockImplementation(async (route) =>
    route === "lobby"
      ? { players: [], offers: [offer], current: null, serverNow: 1000 }
      : true,
  );
  render(
    <LobbyHub
      userId={1}
      inMatch={false}
      showPlayers={false}
      onMatch={() => {}}
    />,
  );
  fireEvent.click(await screen.findByText("Rifiuta"));
  expect(api).toHaveBeenCalledWith("decline-challenge", { id: offer.id });
});
it("shows a lost acceptance race as an error and does not enter another table", async () => {
  vi.mocked(api).mockImplementation(async (route) => {
    if (route === "lobby")
      return {
        players: [],
        offers: [{ ...offer, targeted: false }],
        current: null,
        serverNow: 1000,
      };
    throw new Error("Sfida già accettata");
  });
  const enter = vi.fn();
  render(
    <LobbyHub userId={1} inMatch={false} showPlayers={false} onMatch={enter} />,
  );
  fireEvent.click(await screen.findByText("Accetta sfida"));
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(enter).not.toHaveBeenCalled();
});
