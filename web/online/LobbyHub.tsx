import React, { useEffect, useRef, useState } from "react";
import { api, Lobby, Snapshot } from "./api";
import { CountryFlag } from "./countries";

export function LobbyHub({
  userId,
  inMatch,
  showPlayers,
  onMatch,
}: {
  userId: number;
  inMatch: boolean;
  showPlayers: boolean;
  onMatch: (s: Snapshot) => void;
}) {
  const [lobby, setLobby] = useState<Lobby>();
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [connectionError, setConnectionError] = useState(false);
  const enter = useRef(onMatch);
  enter.current = onMatch;
  useEffect(() => {
    let stopped = false,
      timer = 0,
      polling = false;
    const controller = new AbortController();
    async function poll() {
      if (stopped || polling) return;
      polling = true;
      try {
        const next = await api<Lobby>(
          "lobby",
          { available: !inMatch },
          controller.signal,
        );
        if (!stopped) {
          setConnectionError(false);
          setLobby(next);
          if (!inMatch && next.current?.status === "active")
            enter.current(next.current);
        }
      } catch {
        if (!stopped) setConnectionError(true);
      }
      polling = false;
      if (!stopped)
        timer = window.setTimeout(
          poll,
          document.visibilityState === "hidden" ? 30000 : 5000,
        );
    }
    const refresh = () => {
      clearTimeout(timer);
      void poll();
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
      controller.abort();
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [userId, inMatch]);
  async function act(route: string, body: unknown) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      enter.current(await api<Snapshot>(route, body));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const offer =
    !lobby?.current &&
    lobby?.offers.find(
      (o) => !dismissed.includes(o.id) && o.expiresAt > lobby.serverNow,
    );
  if (inMatch) return null;
  return (
    <section
      className="club-page lobby-hub"
      aria-label="Giocatori online e sfide"
    >
      {connectionError && showPlayers && (
        <p role="status">La sala non risponde. Riprovo il collegamento…</p>
      )}
      {offer && (
        <aside className="challenge-prompt" aria-label="Sfida in arrivo">
          <span className="eyebrow">
            {offer.targeted ? "TI HANNO SFIDATO" : "SFIDA APERTA"}
          </span>
          <h2>
            <CountryFlag code={offer.from.country} /> {offer.from.nickname} ·{" "}
            {offer.from.elo} ELO
          </h2>
          <p>
            {offer.targeted
              ? "Vuole giocare con te."
              : "Il primo che accetta entra al tavolo."}{" "}
            Invito valido un minuto.
          </p>
          <button
            className="primary"
            disabled={busy}
            onClick={() => void act("join", { code: offer.code })}
          >
            Accetta sfida
          </button>
          <button
            className="text-button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                if (offer.targeted)
                  await api("decline-challenge", { id: offer.id });
                setDismissed((ids) => [...ids, offer.id]);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {offer.targeted ? "Rifiuta" : "Non ora"}
          </button>
        </aside>
      )}
      {showPlayers && (
        <>
          <div className="lobby-heading">
            <div>
              <span className="eyebrow">IL CLUB È APERTO</span>
              <h2>Giocatori online</h2>
            </div>
            <button
              className="secondary"
              disabled={busy || !!lobby?.current || !lobby}
              onClick={() => void act("challenge", {})}
            >
              Lancia una sfida aperta
            </button>
          </div>
          <p className="privacy-note">
            Sfide aperte a tutti gli ELO per questa fase di test. La lista si
            aggiorna ogni 5 secondi; chi è in partita non è disponibile.
          </p>
          {!lobby ? (
            <p role="status">Collegamento alla sala…</p>
          ) : lobby.players.length === 0 ? (
            <p>
              Nessun altro giocatore online. Puoi lasciare una sfida aperta per
              un minuto o invitare qualcuno con un codice.
            </p>
          ) : (
            <ul className="online-players">
              {lobby.players.map((p) => (
                <li key={p.id}>
                  <span>
                    <CountryFlag code={p.country} /> <b>{p.nickname}</b>
                    <small>
                      {p.elo} ELO · {p.available ? "Disponibile" : "Al tavolo"}
                    </small>
                  </span>
                  <button
                    className="secondary"
                    disabled={busy || !p.available || !!lobby.current}
                    onClick={() => void act("challenge", { target: p.id })}
                  >
                    Sfida {p.nickname}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}
