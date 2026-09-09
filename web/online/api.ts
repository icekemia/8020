import type { Game } from "../game/core";
import type { Difficulty } from "../bot/levels";
export type Player = {
  id: number;
  nickname: string;
  country: string | null;
  xp: number;
  elo: number;
  peak_elo: number;
  wins: number;
  draws: number;
  losses: number;
  best_streak: number;
  provisional: boolean;
};
export type Account = Player & {
  email: string;
  selectedCountry: string | null;
  countryPublic: boolean;
};
export type Session = {
  user: Account | null;
  csrf: string;
  countryLookup?: boolean;
  registrationCodeRequired?: boolean;
};
export type Snapshot = {
  id: string;
  code: string | null;
  mode: "bot" | "multi";
  difficulty: Difficulty | null;
  status: "waiting" | "active" | "finished" | "cancelled";
  game: Game;
  ownCommitted: boolean;
  opponentCommitted: boolean;
  opponent: Player | null;
  me: Account;
  phaseAt: number;
  opensAt: number;
  deadlineAt: number | null;
  serverNow: number;
  version: number;
  reason: string | null;
  reward: { xp: number; elo: number };
  rematch?: { mine: boolean; state: 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired'; expiresAt: number; nextId: string | null } | null;
  offer?: { targeted: boolean; expiresAt: number } | null;
};
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
let csrf = "";
export async function api<T>(
  route: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timeout = window.setTimeout(abort, 12000);
  try {
    const response = await fetch(`/api/index.php?route=${route}`, {
      method: body === undefined ? "GET" : "POST",
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
      headers:
        body === undefined
          ? {}
          : { "Content-Type": "application/json", "X-CSRF-Token": csrf },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = await response.json();
    if (!response.ok || !("data" in payload))
      throw new ApiError(
        payload.error ?? "Servizio account non disponibile.",
        response.status || 503,
      );
    if (payload.data?.csrf) csrf = payload.data.csrf;
    return payload.data as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(
      "Connessione interrotta. La partita resta sul server: riprova.",
      0,
    );
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

export type Lobby = {
  players: (Player & { available: boolean })[];
  offers: { id: string; code: string; targeted: boolean; expiresAt: number; from: Player }[];
  current: Snapshot | null;
  serverNow: number;
};
