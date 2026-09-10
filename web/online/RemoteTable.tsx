import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "../GuestGame";
import { BotPortrait, BOT_PROFILES } from "../portraits";
import { estimateAdvantage, redistributeFill } from "../game/presentation";
import type { Fill } from "../game/core";
import { api, ApiError, Snapshot, Account } from "./api";
import { CountryFlag } from "./countries";
import {
  useMathHelp,
  MathHelpToggle,
  CardDifferences,
  ReviewSummary,
  trapDialog,
} from "../GameAids";

export function remoteStage(s: Snapshot, now: number): string {
  if (s.status === "waiting") return "waiting";
  if (s.status === "cancelled") return "result";
  const elapsed = now - s.phaseAt;
  if (s.status === "finished") {
    if (s.reason === "decided")
      return elapsed < 1400
        ? "reveal2"
        : elapsed < 2500
          ? "third"
          : elapsed < 4200
            ? "reveal3"
            : "result";
    if (s.reason === "completed")
      return elapsed < 1700
        ? "counting"
        : elapsed < 3100
          ? "highlight"
          : "result";
    return "result";
  }
  if (s.game.phase === "SPLIT_1_COMMIT")
    return now < s.opensAt ? "split-intro" : "split1";
  if (s.game.phase === "SPLIT_2_COMMIT")
    return now < s.opensAt ? "reveal1" : "split2";
  if (now >= s.opensAt) return "fill";
  return elapsed < 1400
    ? "reveal2"
    : elapsed < 2500
      ? "third"
      : elapsed < 4200
        ? "reveal3"
        : "fill-intro";
}

export function RemoteTable({
  initial,
  onExit,
  onAccount,
  onNext,
}: {
  initial: Snapshot;
  onNext?: (s: Snapshot) => void;
  onExit: () => void;
  onAccount: (account: Account) => void;
}) {
  const [mathHelp, setMathHelp] = useMathHelp();
  const [review, setReview] = useState(false);
  const [snapshot, setSnapshot] = useState(initial);
  const [clock, setClock] = useState(Date.now());
  const offset = useRef(initial.serverNow - Date.now());
  const [split, setSplit] = useState("");
  const [fill, setFill] = useState<Fill>([7, 7, 6]);
  const [blank, setBlank] = useState<number>();
  const [focused, setFocused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [needsLogin, setNeedsLogin] = useState(false);
  const [forfeit, setForfeit] = useState(false);
  const [copied, setCopied] = useState(false);
  const latest = useRef(initial);
  const button = useRef<HTMLButtonElement>(null);
  const accept = (s: Snapshot) => {
    if (
      s.id !== latest.current.id ||
      s.version < latest.current.version ||
      (s.version === latest.current.version &&
        s.serverNow < latest.current.serverNow)
    )
      return;
    if (s.game.phase !== latest.current.game.phase) {
      setSplit("");
      setFocused(false);
    }
    latest.current = s;
    offset.current = s.serverNow - Date.now();
    setSnapshot(s);
  };
  useEffect(() => {
    let stopped = false,
      timer = 0;
    const controller = new AbortController();
    async function poll() {
      try {
        const s = await api<Snapshot>(
          `match&id=${initial.id}`,
          undefined,
          controller.signal,
        );
        if (!stopped) {
          accept(s);
          if (s.rematch?.nextId && onNext) {
            const next = await api<Snapshot>(
              `match&id=${s.rematch.nextId}`,
              undefined,
              controller.signal,
            );
            if (!stopped) onNext(next);
          }
          setError("");
          setNeedsLogin(false);
        }
      } catch (e) {
        if (!stopped) {
          setError((e as Error).message);
          if (e instanceof ApiError && e.status === 401) setNeedsLogin(true);
        }
      }
      if (
        !stopped &&
        (["active", "waiting"].includes(latest.current.status) ||
          latest.current.mode === "multi")
      )
        timer = window.setTimeout(
          poll,
          latest.current.status === "active" ? 1000 : 2000,
        );
    }
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [initial.id]);
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 100);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    onAccount(snapshot.me);
  }, [snapshot.me, onAccount]);
  const now = clock + offset.current;
  const stage = remoteStage(snapshot, now);
  useEffect(() => {
    if (stage === "result" && !review) button.current?.focus();
  }, [stage, review]);
  const g = snapshot.game;
  const active = stage === "split1" ? 0 : stage === "split2" ? 1 : -1;
  const intro = stage === "split-intro" || stage === "fill-intro";
  const filling = stage === "fill";
  const final =
    ["counting", "highlight", "result"].includes(stage) &&
    snapshot.reason === "completed";
  const requestedReveal = ["split-intro", "split1"].includes(stage)
    ? 0
    : ["reveal1", "split2"].includes(stage)
      ? 1
      : ["reveal2", "third"].includes(stage)
        ? 2
        : 3;
  const revealed = Math.min(
    requestedReveal,
    g.split.A.length,
    g.split.B.length,
  );
  const max = active === 1 ? 79 - g.split.A[0] : 78;
  const valid =
    /^\d+$/.test(split) && Number(split) >= 1 && Number(split) <= max;
  const seconds =
    snapshot.deadlineAt === null
      ? null
      : Math.max(0, Math.ceil((snapshot.deadlineAt - now) / 1000));
  const locked =
    busy ||
    snapshot.ownCommitted ||
    snapshot.status !== "active" ||
    now < snapshot.opensAt ||
    (seconds !== null && seconds <= 0);
  const result = g.result?.outcome;
  const profile = BOT_PROFILES[snapshot.difficulty ?? "hard"];
  const opponent = snapshot.opponent?.nickname ?? profile.name;
  const estimated = useMemo(
    () =>
      estimateAdvantage(
        g.split.A.slice(0, revealed),
        g.split.B.slice(0, revealed),
      ),
    [g.split.A, g.split.B, revealed],
  );
  const advantage =
    stage === "result" && result
      ? result === "A_WIN"
        ? 100
        : result === "B_WIN"
          ? 0
          : 50
      : estimated;
  async function commit(event: React.FormEvent) {
    event.preventDefault();
    if (locked || (!filling && !valid) || (filling && blank !== undefined))
      return;
    setBusy(true);
    setError("");
    try {
      accept(
        await api<Snapshot>("commit", {
          id: snapshot.id,
          phase: g.phase,
          action: filling ? fill : Number(split),
        }),
      );
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof ApiError && e.status === 409) {
        try {
          accept(await api<Snapshot>(`match&id=${snapshot.id}`));
        } catch {
          /* Poll retries. */
        }
      }
    } finally {
      setBusy(false);
    }
  }
  async function rematch(action: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      accept(await api<Snapshot>("rematch", { id: snapshot.id, action }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const renewal = snapshot.rematch;
  const pendingRematch =
    renewal?.state === "pending" && renewal.expiresAt > now;
  const rematchControls = snapshot.mode === "multi" && snapshot.opponent && (
    <div className="rematch-controls">
      {pendingRematch ? (
        <>
          <p role="status">
            {renewal.mine
              ? "Rivincita richiesta. Attendo il consenso…"
              : `${opponent} chiede una rivincita.`}{" "}
            · {Math.max(0, Math.ceil((renewal.expiresAt - now) / 1000))}s
          </p>
          {renewal.mine ? (
            <button
              className="secondary"
              disabled={busy}
              onClick={() => void rematch("cancel")}
            >
              Annulla richiesta
            </button>
          ) : (
            <>
              <button
                className="primary"
                disabled={busy}
                onClick={() => void rematch("accept")}
              >
                Accetta rivincita
              </button>
              <button
                className="text-button"
                disabled={busy}
                onClick={() => void rematch("decline")}
              >
                Rifiuta rivincita
              </button>
            </>
          )}
        </>
      ) : renewal?.nextId ? (
        <p role="status">Nuova partita in apertura…</p>
      ) : (
        <>
          {renewal && (
            <p role="status">
              {renewal.state === "declined"
                ? "Rivincita rifiutata."
                : "La richiesta non è più attiva."}
            </p>
          )}
          <button
            className="primary"
            disabled={busy}
            onClick={() => void rematch("request")}
          >
            Chiedi rivincita
          </button>
        </>
      )}
    </div>
  );
  async function exitTable() {
    if (busy) return;
    if (pendingRematch) {
      setBusy(true);
      try {
        const next = await api<Snapshot>("rematch", {
          id: snapshot.id,
          action: renewal!.mine ? "cancel" : "decline",
        });
        if (next.rematch?.nextId && onNext) {
          onNext(await api<Snapshot>(`match&id=${next.rematch.nextId}`));
          return;
        }
      } catch (e) {
        if (!(e instanceof ApiError && e.status === 409)) {
          setError((e as Error).message);
          return;
        }
      } finally {
        setBusy(false);
      }
    }
    onExit();
  }
  async function leave() {
    setBusy(true);
    setError("");
    try {
      accept(await api<Snapshot>("leave", { id: snapshot.id }));
      setForfeit(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function editFill(i: number, n: number) {
    if (!Number.isInteger(n) || n < 0 || n > 20) {
      setError("Inserisci un intero da 0 a 20.");
      return;
    }
    setFill((f) => redistributeFill(f, i, n));
    setBlank(undefined);
    setError("");
  }
  function winner(own: boolean, i: number) {
    if (!["highlight", "result"].includes(stage) || i >= revealed || !result)
      return "";
    if (!["completed", "decided"].includes(snapshot.reason ?? "")) return "";
    const delta =
      g.split.A[i] +
      (final ? (g.fill.A?.[i] ?? 0) : 0) -
      g.split.B[i] -
      (final ? (g.fill.B?.[i] ?? 0) : 0);
    if (!final && Math.abs(delta) <= 20) return "";
    return delta === 0
      ? "tied"
      : (own ? delta > 0 : delta < 0)
        ? "winning"
        : "losing";
  }
  if (stage === "waiting")
    return (
      <main className="club-page waiting-room">
        <span className="eyebrow">
          {snapshot.offer
            ? snapshot.offer.targeted
              ? "SFIDA DIRETTA"
              : "SFIDA APERTA"
            : "TAVOLO PRIVATO"}
        </span>
        <h1>
          {snapshot.offer
            ? "Aspettiamo un avversario."
            : "Invita il tuo avversario."}
        </h1>
        <p>
          {snapshot.offer
            ? "La richiesta compare ai giocatori disponibili. Alla conferma il duello comincia per entrambi."
            : "Condividi questo codice. Quando entra, il duello comincia per entrambi."}
        </p>
        {snapshot.offer && (
          <p role="status">
            {snapshot.offer.targeted
              ? "Sfida inviata al giocatore scelto."
              : "Sfida aperta inviata ai giocatori online."}{" "}
            Scade tra{" "}
            {Math.max(0, Math.ceil((snapshot.offer.expiresAt - now) / 1000))}s.
          </p>
        )}
        {!snapshot.offer && (
          <>
            <strong className="invite-code">{snapshot.code}</strong>
            <button
              className="primary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(snapshot.code!);
                  setCopied(true);
                } catch {
                  setError("Copia manualmente il codice mostrato.");
                }
              }}
            >
              {copied ? "Codice copiato ✓" : "Copia codice"}
            </button>
          </>
        )}
        <p className="waiting">
          <span className="pulse-dot" />
          In attesa del secondo giocatore…
        </p>
        <p>
          60 secondi per scelta · ELO in gioco ·{" "}
          {snapshot.offer ? "sfida valida 1 minuto" : "invito valido 24 ore"}
        </p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {needsLogin && (
          <button className="secondary" onClick={() => location.reload()}>
            Accedi di nuovo
          </button>
        )}
        <button className="text-button" disabled={busy} onClick={leave}>
          Annulla invito
        </button>
      </main>
    );
  return (
    <>
      <main className="game-main">
        <div className="match-heading">
          <div>
            <span className="eyebrow">
              {filling || final || stage === "fill-intro"
                ? "02 / FILL"
                : "01 / SPLIT"}{" "}
              · {snapshot.mode === "multi" ? "MULTIPLAYER" : "BOT"}
            </span>
            <h1>
              {review
                ? "Le scelte, a carte scoperte."
                : snapshot.ownCommitted
                  ? "La tua scelta è sigillata."
                  : filling
                    ? "Venti unità. Fai la differenza."
                    : stage === "third"
                      ? "Il resto entra in gioco…"
                      : active >= 0
                        ? "La prossima mossa è tua."
                        : "Scopriamo le carte…"}
            </h1>
          </div>
          {seconds !== null && (
            <div
              className={`turn-clock ${seconds <= 15 ? "urgent" : ""} ${seconds <= 5 ? "critical" : ""}`}
              role="timer"
              aria-label="Secondi rimanenti"
            >
              {now < snapshot.opensAt ? "PREPARATI" : `${seconds}s`}
            </div>
          )}
        </div>
        <section
          className={`casino-table ${review ? "review-mode" : ""}`}
          aria-label="Tavolo online"
          inert={intro || (stage === "result" && !review)}
        >
          <div className="table-trim" />
          <aside className={`advantage ${revealed ? "visible" : ""}`}>
            <span className="bar-label">AVV.</span>
            <div
              className="advantage-track"
              role="meter"
              aria-label="Vantaggio stimato"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={advantage}
            >
              <div style={{ height: `${advantage}%` }} />
            </div>
            <b>{advantage}%</b>
            <span className="bar-label">TU</span>
            <details className="odds-help">
              <summary aria-label="Informazioni sulla stima">i</summary>
              <p>
                Stima su mosse legali casuali, solo dalle carte rivelate. Non è
                una probabilità calibrata.
              </p>
            </details>
          </aside>
          <div className="table-content">
            <div className="player-info opponent-info">
              <span className="avatar bot-avatar">
                {snapshot.mode === "bot" ? (
                  <BotPortrait compact difficulty={snapshot.difficulty!} />
                ) : (
                  <span className="human-symbol">♠</span>
                )}
              </span>
              <div>
                <strong>
                  <CountryFlag code={snapshot.opponent?.country ?? null} />{" "}
                  {opponent}
                </strong>
                <small>
                  {snapshot.mode === "bot"
                    ? snapshot.difficulty?.toUpperCase()
                    : `${snapshot.opponent?.elo} ELO`}
                </small>
              </div>
              <span className="player-status">
                <i />
                {snapshot.opponentCommitted ? "Scelta sigillata" : "Al tavolo"}
              </span>
            </div>
            <div className="card-row opponent-cards">
              {[0, 1, 2].map((i) => (
                <Card
                  key={i}
                  index={i}
                  own={false}
                  open={i < revealed}
                  value={
                    i < revealed
                      ? g.split.B[i] + (final ? (g.fill.B?.[i] ?? 0) : 0)
                      : 0
                  }
                  animate={final}
                  state={winner(false, i)}
                />
              ))}
            </div>
            {snapshot.mode === "bot" &&
              snapshot.difficulty === "easy" &&
              mathHelp && (
                <CardDifferences
                  revealed={revealed}
                  preview={filling}
                  own={g.split.A.map(
                    (v, i) =>
                      v +
                      (filling
                        ? snapshot.ownCommitted
                          ? ((g.pending.A as Fill)?.[i] ?? fill[i])
                          : fill[i]
                        : final
                          ? (g.fill.A?.[i] ?? 0)
                          : 0),
                  )}
                  opponent={g.split.B.map(
                    (v, i) => v + (final ? (g.fill.B?.[i] ?? 0) : 0),
                  )}
                />
              )}
            <div className="table-divider">
              <span />
              <b>{filling || final ? "FILL" : "SPLIT"}</b>
              <span />
            </div>
            <div className="card-row own-cards">
              {[0, 1, 2].map((i) => (
                <Card
                  key={i}
                  index={i}
                  own
                  open={i < revealed}
                  value={
                    i < revealed
                      ? g.split.A[i] + (final ? (g.fill.A?.[i] ?? 0) : 0)
                      : 0
                  }
                  animate={final}
                  preview={
                    snapshot.mode === "bot" &&
                    snapshot.difficulty === "easy" &&
                    mathHelp &&
                    filling
                      ? g.split.A[i] +
                        (snapshot.ownCommitted
                          ? ((g.pending.A as Fill)?.[i] ?? fill[i])
                          : fill[i])
                      : undefined
                  }
                  state={winner(true, i)}
                />
              ))}
            </div>
            <form className="move-form" onSubmit={commit} noValidate>
              <div className="input-row">
                {[0, 1, 2].map((i) => (
                  <div
                    className={`input-cell ${(active === i || filling) && !locked ? "active-input" : ""}`}
                    key={i}
                  >
                    {final ? (
                      <>
                        <label>FILL AGGIUNTO</label>
                        <div className="final-addition">+{g.fill.A?.[i]}</div>
                      </>
                    ) : filling ? (
                      <>
                        <label htmlFor={`online-fill-${i}`}>AGGIUNGI</label>
                        <div className="stepper">
                          <button
                            type="button"
                            disabled={locked || fill[i] === 0}
                            aria-label={`Diminuisci Fill carta ${i + 1}`}
                            onClick={() => editFill(i, fill[i] - 1)}
                          >
                            −
                          </button>
                          <input
                            id={`online-fill-${i}`}
                            aria-label={`Fill carta ${i + 1}`}
                            type="number"
                            min={0}
                            max={20}
                            step={1}
                            inputMode="numeric"
                            disabled={locked}
                            value={
                              snapshot.ownCommitted
                                ? ((g.pending.A as Fill)?.[i] ?? fill[i])
                                : blank === i
                                  ? ""
                                  : fill[i]
                            }
                            onChange={(e) => {
                              if (e.target.value === "") {
                                setBlank(i);
                                return;
                              }
                              editFill(i, Number(e.target.value));
                            }}
                            onBlur={() => setBlank(undefined)}
                          />
                          <button
                            type="button"
                            disabled={locked || fill[i] === 20}
                            aria-label={`Aumenta Fill carta ${i + 1}`}
                            onClick={() => editFill(i, fill[i] + 1)}
                          >
                            +
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <label htmlFor={`online-split-${i}`}>
                          {i === 2 ? "AUTOMATICA" : `CARTA 0${i + 1}`}
                        </label>
                        <input
                          id={`online-split-${i}`}
                          aria-label={`Split carta ${i + 1}`}
                          type="text"
                          inputMode="numeric"
                          maxLength={2}
                          placeholder={i === 2 ? "auto" : "—"}
                          disabled={locked || active !== i}
                          value={
                            i < revealed
                              ? g.split.A[i]
                              : active === i
                                ? snapshot.ownCommitted
                                  ? String(g.pending.A ?? split)
                                  : split
                                : ""
                          }
                          onFocus={() => setFocused(true)}
                          onChange={(e) => {
                            if (/^\d{0,2}$/.test(e.target.value))
                              setSplit(e.target.value);
                          }}
                        />
                      </>
                    )}
                  </div>
                ))}
              </div>
              <div className="move-controls" aria-live="polite">
                {snapshot.ownCommitted ? (
                  <p className="waiting">
                    <span className="pulse-dot" />
                    Scelta confermata. Aspettiamo l’avversario.
                  </p>
                ) : filling ? (
                  <>
                    <div className="fill-budget">
                      <span>
                        <b>20</b> / 20 distribuite
                      </span>
                      <span>✓</span>
                    </div>
                    <p>Modifica una carta: le altre si bilanciano.</p>
                    {snapshot.mode === "bot" && snapshot.difficulty === "easy" && <MathHelpToggle enabled={mathHelp} onChange={setMathHelp} />}
                    <button
                      className="primary confirm"
                      disabled={locked || blank !== undefined}
                    >
                      Conferma Fill <span>↗</span>
                    </button>
                  </>
                ) : active >= 0 ? (
                  <>
                    <p>
                      Scegli da 1 a {max}.{" "}
                      {active === 1
                        ? "Il resto va alla terza carta."
                        : "Hai 80 unità da dividere."}
                    </p>
                    {snapshot.mode === "bot" && snapshot.difficulty === "easy" && <MathHelpToggle enabled={mathHelp} onChange={setMathHelp} />}
                    {focused && (
                      <button
                        className="primary confirm"
                        disabled={locked || !valid}
                      >
                        Conferma giocata <span>↗</span>
                      </button>
                    )}
                  </>
                ) : (
                  <p className="waiting">
                    {stage === "third"
                      ? "Prepariamo la terza carta…"
                      : "Le scelte sono confermate"}
                  </p>
                )}
              </div>
            </form>
            {snapshot.mode === "bot" && snapshot.difficulty === "easy" && (snapshot.ownCommitted || (!filling && active < 0)) && <MathHelpToggle enabled={mathHelp} onChange={setMathHelp} />}
            <div className="player-info own-info">
              <span className="avatar human-avatar">TU</span>
              <div>
                <strong>
                  <CountryFlag code={snapshot.me.country} />{" "}
                  {snapshot.me.nickname}
                </strong>
                <small>
                  {snapshot.mode === "multi"
                    ? `${snapshot.me.elo} ELO`
                    : `${snapshot.me.xp} XP`}
                </small>
              </div>
            </div>
          </div>
        </section>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {needsLogin && (
          <button className="secondary" onClick={() => location.reload()}>
            Accedi di nuovo
          </button>
        )}
        <footer className="game-footer">
          <span>Le mosse sono segrete fino alla doppia conferma.</span>
          {snapshot.status === "active" && (
            <button className="text-button" onClick={() => setForfeit(true)}>
              Abbandona
            </button>
          )}
        </footer>
        {forfeit && (
          <section className="forfeit-confirm" role="alert">
            <p>
              {snapshot.mode === "multi"
                ? "Abbandonando perdi la partita e il relativo ELO."
                : "Abbandonando non ricevi XP."}
            </p>
            <button disabled={busy} onClick={leave}>
              Conferma abbandono
            </button>
            <button onClick={() => setForfeit(false)}>Resta al tavolo</button>
          </section>
        )}
      </main>
      {intro && (
        <div className="interlude" role="status">
          <div className="interlude-orbit">
            <span>♠</span>
            <i />
            <i />
          </div>
          <span className="eyebrow">
            {snapshot.mode === "multi"
              ? "DUE GIOCATORI. UN DUELLO."
              : "IL TUO PROSSIMO DUELLO"}
          </span>
          <h2>
            {stage === "split-intro" ? "SPLIT" : "FILL"}
            <span>.</span>
          </h2>
          <p>
            {stage === "split-intro" ? (
              <>
                Dividi 80 unità tra tre carte.
                <br />
                Prima carta: scegli da <b>1 a 78</b>.
              </>
            ) : (
              <>
                Aggiungi da <b>0 a 20</b> unità per carta.
                <br />
                Il totale delle aggiunte deve essere <b>20</b>.
              </>
            )}
          </p>
          <div className="interlude-progress" />
          <p>
            {snapshot.mode === "multi"
              ? "Avrete 60 secondi per scegliere."
              : "Nessun limite di tempo contro il bot."}
          </p>
        </div>
      )}
      {stage === "result" && review && (
        <ReviewSummary game={g} onClose={() => setReview(false)}>
          {rematchControls}
          <button
            className="text-button"
            disabled={busy}
            onClick={() => void exitTable()}
          >
            Torna al club
          </button>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
        </ReviewSummary>
      )}
      {stage === "result" && !review && (
        <div
          className={`result-overlay ${result === "A_WIN" ? "victory" : ""}`}
        >
          <section
            className="result-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="online-result"
            onKeyDown={trapDialog}
          >
            <div className="result-spark">{result === "A_WIN" ? "♛" : "♠"}</div>
            <span className="eyebrow">DUELLO COMPLETATO</span>
            <h2 id="online-result">
              {snapshot.status === "cancelled"
                ? "ANNULLATA"
                : result === "A_WIN"
                  ? "YOU WIN"
                  : result === "B_WIN"
                    ? "YOU LOSE"
                    : "DRAW"}
              <span>.</span>
            </h2>
            <p>
              {snapshot.reason === "timeout"
                ? snapshot.status === "cancelled"
                  ? "Nessuno ha confermato entro il tempo limite. Nessuna variazione ELO."
                  : "Tempo scaduto per chi non ha confermato."
                : snapshot.reason === "decided"
                  ? "Il risultato era già deciso: nessun Fill poteva cambiarlo."
                  : snapshot.reason === "abandon"
                    ? "La partita è stata abbandonata."
                    : snapshot.reason === "declined"
                      ? "La sfida è stata rifiutata."
                      : snapshot.reason === "expired"
                        ? "Questa stanza è scaduta."
                        : "Il tavolo ha parlato."}
            </p>
            {g.result?.scores && (
              <div className="final-score">
                <span>
                  TU <b>{g.result.scores[0]}</b>
                </span>
                <i>:</i>
                <span>
                  <b>{g.result.scores[1]}</b> AVV.
                </span>
              </div>
            )}
            <div className="xp-reward">
              {snapshot.mode === "multi"
                ? `${snapshot.reward.elo >= 0 ? "+" : ""}${snapshot.reward.elo} ELO`
                : `+${snapshot.reward.xp} XP`}
              <span>SALVATI SUL TUO ACCOUNT</span>
            </div>
            <button className="secondary" onClick={() => setReview(true)}>
              Rivedi il tavolo
            </button>
            {rematchControls}
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <button
              ref={button}
              className="primary"
              disabled={busy}
              onClick={() => void exitTable()}
            >
              Torna al club <span>↗</span>
            </button>
          </section>
        </div>
      )}
    </>
  );
}
