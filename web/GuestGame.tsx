import React, { useEffect, useRef, useState } from "react";
import { LocalMatch } from "./app/controller";
import type { Policy } from "./bot/difficult";
import type { Difficulty } from "./bot/levels";
import type { Fill, Game } from "./game/core";
import {
  decidedOutcome,
  estimateAdvantage,
  Outcome,
  redistributeFill,
} from "./game/presentation";
import { BotPortrait, BOT_PROFILES } from "./portraits";
import "./style.css";
import {
  useMathHelp,
  MathHelpToggle,
  CardDifferences,
  ReviewSummary,
} from "./GameAids";

const rng = {
  next: () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32,
};
const levels: Difficulty[] = ["easy", "medium", "hard"];
type Stage =
  | "lobby"
  | "split-intro"
  | "split1"
  | "reveal1"
  | "split2"
  | "reveal2"
  | "third"
  | "reveal3"
  | "fill-intro"
  | "fill"
  | "counting"
  | "highlight"
  | "result";
const XP_KEY = "duel8020.xp";
function storedXP() {
  try {
    const value = Number(localStorage.getItem(XP_KEY));
    return Number.isSafeInteger(value) && value >= 0 ? value : 0;
  } catch {
    return 0;
  }
}
function useCardNumber(target: number, animate: boolean) {
  const [value, setValue] = useState(target);
  const previous = useRef(target);
  useEffect(() => {
    const from = previous.current;
    previous.current = target;
    if (
      !animate ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      setValue(target);
      return;
    }
    let frame = 0,
      start: number | undefined;
    const tick = (now: number) => {
      start ??= now;
      const t = Math.min(1, (now - start) / 1300);
      setValue(Math.round(from + (target - from) * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, animate]);
  return value;
}
export function Card({
  value,
  open,
  index,
  own,
  state,
  animate,
  preview,
}: {
  value: number;
  open: boolean;
  index: number;
  own: boolean;
  state: string;
  animate: boolean;
  preview?: number;
}) {
  const displayed = useCardNumber(value, animate);
  return (
    <div
      className={`playing-card ${open ? "is-open" : ""} ${state}`}
      aria-label={`${own ? "Tua" : "Avversario"} carta ${index + 1}: ${open ? value : "coperta"}${open && preview !== undefined ? `, totale provvisorio ${preview}` : ""}`}
    >
      <div className="card-rotator">
        <div className="card-back" aria-hidden="true">
          <span className="corner-mark">80</span>
          <div className="back-emblem">
            <span>✦</span>
            <b>
              80<span>/</span>20
            </b>
            <i>DUEL CLUB</i>
          </div>
          <span className="corner-mark bottom">20</span>
        </div>
        <div className="card-front" aria-hidden="true">
          <span className="card-corner">
            {index + 1}
            <small>{own ? "♠" : "♦"}</small>
          </span>
          <strong>{displayed}</strong>
          {open && preview !== undefined && (
            <span className="fill-preview">
              <small>TOTALE</small>
              <b>{preview}</b>
              <small>
                {value} + {preview - value}
              </small>
            </span>
          )}
          <span className="card-suit">{own ? "♠" : "♦"}</span>
          <span className="card-caption">
            MANCHE {["I", "II", "III"][index]}
          </span>
        </div>
      </div>
    </div>
  );
}
export function GuestGame({
  navigation,
  accountPending = false,
}: {
  navigation?: React.ReactNode;
  accountPending?: boolean;
}) {
  const [difficulty, setDifficulty] = useState<Difficulty>("hard");
  const [mathHelp, setMathHelp] = useMathHelp();
  const [review, setReview] = useState(false);
  const [stage, setStage] = useState<Stage>("lobby");
  const [game, setGame] = useState<Game>();
  const [split, setSplit] = useState(["", "", ""]);
  const [fill, setFill] = useState<Fill>([7, 7, 6]);
  const [blankFill, setBlankFill] = useState<number>();
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [xp, setXP] = useState(storedXP);
  const [earned, setEarned] = useState(0);
  const [early, setEarly] = useState<Outcome>();
  const match = useRef<LocalMatch | undefined>(undefined);
  const policy = useRef<Policy | undefined>(undefined);
  const starting = useRef(false);
  const awarded = useRef(false);
  const resultButton = useRef<HTMLButtonElement>(null);
  const profile = BOT_PROFILES[difficulty];
  const result = early ?? game?.result?.outcome;

  async function start() {
    if (starting.current || accountPending) return;
    starting.current = true;
    setLoading(true);
    setError("");
    try {
      if (!policy.current) {
        const response = await fetch("/policies/80_20_difficult.policy.json");
        if (!response.ok) throw new Error("load");
        const data = (await response.json()) as Policy;
        if (!data.split1 || !data.split2 || !data.fill)
          throw new Error("policy");
        policy.current = data;
      }
      const next = new LocalMatch(policy.current, "B", rng, difficulty);
      match.current = next;
      awarded.current = false;
      setReview(false);
      setGame(next.game);
      setSplit(["", "", ""]);
      setFill([7, 7, 6]);
      setBlankFill(undefined);
      setFocused(false);
      setEarly(undefined);
      setEarned(0);
      setStage("split-intro");
    } catch {
      setError("Il tavolo non è pronto. Controlla la connessione e riprova.");
    } finally {
      starting.current = false;
      setLoading(false);
    }
  }

  useEffect(() => {
    const timed: Partial<Record<Stage, [number, Stage]>> = {
      "split-intro": [2600, "split1"],
      reveal1: [1300, "split2"],
      reveal2: [1400, "third"],
      third: [1100, "reveal3"],
      "fill-intro": [2800, "fill"],
      counting: [1700, "highlight"],
      highlight: [1400, "result"],
    };
    if (stage === "reveal3" && game) {
      const timer = window.setTimeout(() => {
        const fixed = decidedOutcome(game);
        setEarly(fixed);
        setStage(fixed ? "result" : "fill-intro");
      }, 1700);
      return () => clearTimeout(timer);
    }
    const next = timed[stage];
    if (next) {
      const timer = window.setTimeout(() => setStage(next[1]), next[0]);
      return () => clearTimeout(timer);
    }
  }, [stage, game]);
  useEffect(() => {
    if (stage !== "result" || !result || awarded.current) return;
    awarded.current = true;
    const reward =
      result === "A_WIN"
        ? { easy: 30, medium: 60, hard: 100 }[difficulty]
        : result === "DRAW"
          ? 20
          : 10;
    setEarned(reward);
    setXP((previous) => {
      const next = previous + reward;
      try {
        localStorage.setItem(XP_KEY, String(next));
      } catch {
        /* Session XP remains available without storage. */
      }
      return next;
    });
    resultButton.current?.focus();
  }, [stage, result, difficulty]);

  const revealed = ["reveal1", "split2"].includes(stage)
    ? 1
    : ["reveal2", "third"].includes(stage)
      ? 2
      : [
            "reveal3",
            "fill-intro",
            "fill",
            "counting",
            "highlight",
            "result",
          ].includes(stage)
        ? 3
        : 0;
  const filling = stage === "fill";
  const finalNumbers =
    stage === "counting" ||
    stage === "highlight" ||
    (stage === "result" && !early);
  const activeIndex = stage === "split1" ? 0 : stage === "split2" ? 1 : -1;
  const maxSplit = activeIndex === 1 ? 79 - (game?.split.A[0] ?? 1) : 78;
  const currentInput = activeIndex >= 0 ? split[activeIndex] : "";
  const validSplit =
    /^\d+$/.test(currentInput) &&
    Number(currentInput) >= 1 &&
    Number(currentInput) <= maxSplit;
  const advantage =
    game && revealed
      ? estimateAdvantage(
          game.split.A.slice(0, revealed),
          game.split.B.slice(0, revealed),
        )
      : 50;
  const shownAdvantage =
    stage === "result"
      ? result === "A_WIN"
        ? 100
        : result === "B_WIN"
          ? 0
          : 50
      : advantage;
  const intro = stage === "split-intro" || stage === "fill-intro";
  const fillTotal = fill.reduce((sum, value) => sum + value, 0);

  function commitSplit(event: React.FormEvent) {
    event.preventDefault();
    if (!validSplit || !match.current || activeIndex < 0) return;
    try {
      setGame(match.current.commitHuman(Number(currentInput)));
      setFocused(false);
      setError("");
      setStage(activeIndex === 0 ? "reveal1" : "reveal2");
    } catch {
      setError("Scegli un numero intero nell’intervallo indicato.");
    }
  }
  function editFill(index: number, value: number) {
    if (!Number.isInteger(value) || value < 0 || value > 20) {
      setError("Ogni aggiunta deve essere un numero intero da 0 a 20.");
      return;
    }
    setFill((previous) => redistributeFill(previous, index, value));
    setBlankFill(undefined);
    setError("");
  }
  function commitFill(event: React.FormEvent) {
    event.preventDefault();
    if (
      !match.current ||
      blankFill !== undefined ||
      fillTotal !== 20 ||
      !filling
    )
      return;
    try {
      setGame(match.current.commitHuman(fill));
      setError("");
      setStage("counting");
    } catch {
      setError("Distribuisci esattamente 20 unità prima di confermare.");
    }
  }
  function cardState(own: boolean, index: number) {
    if ((stage !== "result" && stage !== "highlight") || !game) return "";
    const delta =
      game.split.A[index] +
      (early ? 0 : (game.fill.A?.[index] ?? 0)) -
      game.split.B[index] -
      (early ? 0 : (game.fill.B?.[index] ?? 0));
    if (early && Math.abs(delta) <= 20) return "";
    return delta === 0
      ? "tied"
      : (own ? delta > 0 : delta < 0)
        ? "winning"
        : "losing";
  }
  const subtitle =
    stage === "split1"
      ? "La prima mossa è tua."
      : stage === "split2"
        ? "Seconda carta. Scegli il tuo equilibrio."
        : stage === "third"
          ? "Il resto degli 80 sta per entrare in gioco…"
          : stage === "reveal3"
            ? "Tre carte. Ora cambia le sorti del tavolo."
            : filling
              ? "Venti unità. Fai la differenza."
              : stage === "counting"
                ? "Ogni unità conta…"
                : stage === "result" || stage === "highlight"
                  ? "Il tavolo ha parlato."
                  : "Scopriamo le carte…";

  return (
    <div
      className="app-shell"
      style={{ "--bot-accent": profile.color } as React.CSSProperties}
    >
      <header className="topbar">
        <div className="brand">
          <span className="brand-symbol">✦</span> 80
          <span className="brand-slash">/</span>20 <small>DUEL CLUB</small>
        </div>
        <div
          className="xp-pill"
          title="Esperienza contro i bot, salvata su questo dispositivo"
        >
          <span>✧</span>
          <b>{xp.toLocaleString("it-IT")}</b>
          <small>XP</small>
        </div>
      </header>
      {stage === "lobby" && navigation}
      {stage === "lobby" ? (
        <main className="lobby">
          <div className="lobby-copy">
            <span className="eyebrow">
              <i /> IL TUO PROSSIMO DUELLO
            </span>
            <h1>
              Piccoli numeri.
              <br />
              <em>Grandi mosse.</em>
            </h1>
            <p className="lead">
              Tre carte. Cento unità. Un solo obiettivo:
              <br className="desktop-break" /> conquistare più manche
              dell’avversario.
            </p>
            <div className="rules-pills">
              <span>
                <b>80</b> da dividere
              </span>
              <span className="plus">+</span>
              <span>
                <b>20</b> per ribaltare tutto
              </span>
            </div>
            <details className="how-to">
              <summary>
                Come si gioca <span>↗</span>
              </summary>
              <p>
                Dividi 80 unità tra tre carte: scegli la prima da 1 a 78, poi la
                seconda lasciando almeno 1 alla terza. Le mosse sono simultanee
                e segrete. Infine distribuisci altre 20 unità. In ogni manche
                vince il numero più alto; chi vince più manche conquista il
                duello. Anche un pareggio è possibile.
              </p>
            </details>
            <div className="lobby-footnote">
              STRATEGIA PURA <span>✦</span> NESSUNA PUNTATA
            </div>
          </div>
          <section
            className="opponent-picker"
            aria-label="Scegli il tuo avversario"
          >
            <div className="picker-top">
              <span>SOLO VS BOT</span>
              <span className="online-dot">PRONTO A GIOCARE</span>
            </div>
            <div className="portrait-frame" key={difficulty}>
              <span className="portrait-index">
                0{levels.indexOf(difficulty) + 1}
              </span>
              <BotPortrait difficulty={difficulty} />
              <div className="portrait-label">
                <span>IL TUO AVVERSARIO</span>
                <h2>{profile.name}</h2>
              </div>
            </div>
            <div className="difficulty-control">
              <label htmlFor="difficulty">
                Scegli la difficoltà{" "}
                <span>{levels.indexOf(difficulty) + 1} / 3</span>
              </label>
              <input
                id="difficulty"
                aria-label="Difficoltà bot"
                aria-valuetext={difficulty}
                type="range"
                min="0"
                max="2"
                step="1"
                value={levels.indexOf(difficulty)}
                disabled={loading || accountPending}
                onChange={(e) => setDifficulty(levels[Number(e.target.value)])}
              />
              <div className="difficulty-labels">
                {levels.map((level) => (
                  <button
                    key={level}
                    disabled={loading || accountPending}
                    aria-pressed={difficulty === level}
                    onClick={() => setDifficulty(level)}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>
            <div className="bot-description">
              <strong>{profile.title}</strong>
              <p>{profile.description}</p>
            </div>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button
              className="primary"
              disabled={loading || accountPending}
              onClick={start}
            >
              {loading ? "Prepariamo il tavolo…" : "Entra al tavolo"}
              <span>↗</span>
            </button>
            <p className="mode-note">Partita locale · XP sul dispositivo</p>
          </section>
        </main>
      ) : (
        <main className="game-main">
          <div
            className="match-heading"
            inert={intro || (stage === "result" && !review)}
          >
            <div>
              <span className="eyebrow">
                {filling || finalNumbers || stage === "fill-intro"
                  ? "02 / FILL"
                  : "01 / SPLIT"}
              </span>
              <h1>{review ? "Le scelte, a carte scoperte." : subtitle}</h1>
            </div>
            <span className="match-mode">
              VS BOT <b>{difficulty.toUpperCase()}</b>
            </span>
          </div>
          <section
            className={`casino-table ${review ? "review-mode" : ""}`}
            aria-label="Tavolo da gioco"
            inert={intro || (stage === "result" && !review)}
          >
            <div className="table-trim" />
            <div className="felt-watermark">
              80/20<span>THE NUMBERS ARE YOURS.</span>
            </div>
            <aside
              className={`advantage ${revealed ? "visible" : ""}`}
              aria-label="Barra di vantaggio"
            >
              <span className="bar-label">BOT</span>
              <div
                className="advantage-track"
                role="meter"
                aria-label="Vantaggio stimato del giocatore"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={shownAdvantage}
              >
                <div style={{ height: `${shownAdvantage}%` }} />
                <span className="bar-midline" />
              </div>
              <b>
                {shownAdvantage}
                <small>%</small>
              </b>
              <span className="bar-label">TU</span>
              <details className="odds-help">
                <summary aria-label="Come viene stimato il vantaggio">
                  i
                </summary>
                <p>
                  Stima del vantaggio su completamenti legali casuali, usando
                  solo le carte rivelate. I pareggi valgono metà. Non è una
                  probabilità calibrata contro il bot.
                </p>
              </details>
            </aside>
            <div className="table-content">
              <div className="player-info opponent-info">
                <span className="avatar bot-avatar">
                  <BotPortrait difficulty={difficulty} compact />
                </span>
                <div>
                  <strong>{profile.name}</strong>
                  <small>{difficulty.toUpperCase()} · BOT</small>
                </div>
                <span className="player-status">
                  <i />
                  {activeIndex >= 0 || filling
                    ? "Scelta sigillata"
                    : "Al tavolo"}
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
                      game?.split.B[i] !== undefined && i < revealed
                        ? game.split.B[i] +
                          (finalNumbers ? (game.fill.B?.[i] ?? 0) : 0)
                        : 0
                    }
                    animate={finalNumbers}
                    state={cardState(false, i)}
                  />
                ))}
              </div>
              {difficulty === "easy" && mathHelp && game && (
                <CardDifferences
                  revealed={revealed}
                  preview={filling}
                  own={game.split.A.map(
                    (v, i) =>
                      v +
                      (filling
                        ? fill[i]
                        : finalNumbers
                          ? (game.fill.A?.[i] ?? 0)
                          : 0),
                  )}
                  opponent={game.split.B.map(
                    (v, i) => v + (finalNumbers ? (game.fill.B?.[i] ?? 0) : 0),
                  )}
                />
              )}
              <div className="table-divider">
                <span />
                <b>{filling || finalNumbers ? "FILL" : "SPLIT"}</b>
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
                      game?.split.A[i] !== undefined && i < revealed
                        ? game.split.A[i] +
                          (finalNumbers ? (game.fill.A?.[i] ?? 0) : 0)
                        : 0
                    }
                    animate={finalNumbers}
                    preview={
                      difficulty === "easy" && mathHelp && filling && game
                        ? game.split.A[i] + fill[i]
                        : undefined
                    }
                    state={cardState(true, i)}
                  />
                ))}
              </div>
              {difficulty === "easy" && (
                <MathHelpToggle enabled={mathHelp} onChange={setMathHelp} />
              )}
              <form
                onSubmit={filling ? commitFill : commitSplit}
                className="move-form"
                noValidate
              >
                <div className="input-row">
                  {[0, 1, 2].map((i) => (
                    <div
                      className={`input-cell ${activeIndex === i || filling ? "active-input" : ""}`}
                      key={i}
                    >
                      {finalNumbers ? (
                        <>
                          <label>FILL AGGIUNTO</label>
                          <div className="final-addition">
                            +{game?.fill.A?.[i]}
                          </div>
                        </>
                      ) : filling ? (
                        <>
                          <label htmlFor={`fill-${i}`}>AGGIUNGI</label>
                          <div className="stepper">
                            <button
                              type="button"
                              aria-label={`Diminuisci Fill carta ${i + 1}`}
                              disabled={fill[i] === 0}
                              onClick={() => editFill(i, fill[i] - 1)}
                            >
                              −
                            </button>
                            <input
                              id={`fill-${i}`}
                              aria-label={`Fill carta ${i + 1}`}
                              type="number"
                              inputMode="numeric"
                              min={0}
                              max={20}
                              step={1}
                              value={blankFill === i ? "" : fill[i]}
                              onChange={(e) => {
                                if (e.target.value === "") {
                                  setBlankFill(i);
                                  return;
                                }
                                editFill(i, Number(e.target.value));
                              }}
                              onBlur={() => setBlankFill(undefined)}
                            />
                            <button
                              type="button"
                              aria-label={`Aumenta Fill carta ${i + 1}`}
                              disabled={fill[i] === 20}
                              onClick={() => editFill(i, fill[i] + 1)}
                            >
                              +
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <label htmlFor={`split-${i}`}>
                            {i === 2 ? "AUTOMATICA" : `CARTA 0${i + 1}`}
                          </label>
                          <input
                            id={`split-${i}`}
                            aria-label={`Split carta ${i + 1}`}
                            type="text"
                            inputMode="numeric"
                            autoComplete="off"
                            maxLength={2}
                            placeholder={i === 2 ? "auto" : "—"}
                            disabled={activeIndex !== i}
                            value={i < revealed ? game?.split.A[i] : split[i]}
                            aria-invalid={
                              activeIndex === i && !!currentInput && !validSplit
                            }
                            aria-describedby={
                              activeIndex === i ? "move-hint" : undefined
                            }
                            onFocus={() => setFocused(true)}
                            onChange={(e) => {
                              const value = e.target.value;
                              if (/^\d{0,2}$/.test(value))
                                setSplit((previous) =>
                                  previous.map((x, j) => (i === j ? value : x)),
                                );
                            }}
                          />
                        </>
                      )}
                    </div>
                  ))}
                </div>
                <div className="move-controls" aria-live="polite">
                  {filling ? (
                    <>
                      <div className="fill-budget">
                        <span>
                          <b>{fillTotal}</b> / 20 distribuite
                        </span>
                        <span className="budget-dots">
                          {fill.map((x, i) => (
                            <i key={i} style={{ flex: x || 0.1 }} />
                          ))}
                        </span>
                        <span>✓</span>
                      </div>
                      <p id="move-hint">
                        Modifica una carta: le altre si bilanciano. Totale
                        sempre 20.
                      </p>
                      <button
                        className="primary confirm"
                        disabled={blankFill !== undefined || fillTotal !== 20}
                      >
                        Conferma Fill <span>↗</span>
                      </button>
                    </>
                  ) : activeIndex >= 0 ? (
                    <>
                      <p id="move-hint">
                        {currentInput && !validSplit
                          ? `Inserisci un numero da 1 a ${maxSplit}.`
                          : `Scegli da 1 a ${maxSplit}. ${activeIndex === 0 ? "Hai 80 unità da dividere." : "Il resto va sulla terza carta."}`}
                      </p>
                      {focused && (
                        <button
                          className="primary confirm"
                          disabled={!validSplit}
                        >
                          Conferma giocata <span>↗</span>
                        </button>
                      )}
                    </>
                  ) : (
                    <p className="waiting">
                      <span className="pulse-dot" />
                      {stage === "third"
                        ? "Prepariamo la terza carta…"
                        : stage === "counting"
                          ? "Riveliamo il Fill…"
                          : stage === "highlight" || stage === "result"
                            ? "Duello completato"
                            : "Entrambe le scelte sono confermate"}
                    </p>
                  )}
                </div>
                {error && (
                  <p className="error" role="alert">
                    {error}
                  </p>
                )}
              </form>
              <div className="player-info own-info">
                <span className="avatar human-avatar">TU</span>
                <div>
                  <strong>Il tuo tavolo, le tue mosse.</strong>
                  <small>
                    {filling
                      ? "20 UNITÀ DA AGGIUNGERE"
                      : "80 UNITÀ DA DIVIDERE"}
                  </small>
                </div>
                <span className="you-tag">PLAYER 01</span>
              </div>
            </div>
          </section>
          <footer className="game-footer">
            <span>♠ Vince il numero più alto. Conquista più manche.</span>
            <span>80/20 DUEL CLUB</span>
          </footer>
        </main>
      )}
      {intro && (
        <div className="interlude" role="status">
          <div className="interlude-orbit">
            <span>♠</span>
            <i />
            <i />
          </div>
          <span className="eyebrow">
            {stage === "split-intro"
              ? "IL DUELLO COMINCIA"
              : "È IL MOMENTO DI CAMBIARE LE COSE"}
          </span>
          <h2>
            {stage === "split-intro" ? "SPLIT" : "FILL"}
            <span>.</span>
          </h2>
          <p>
            {stage === "split-intro" ? (
              <>
                Dividi <b>80 unità</b> tra le tue tre carte.
                <br />
                Prima carta: scegli un numero <b>da 1 a 78</b>.
              </>
            ) : (
              <>
                Aggiungi <b>da 0 a 20 unità</b> per carta.
                <br />
                La somma delle aggiunte deve essere <b>20</b>.
              </>
            )}
          </p>
          <div className="interlude-progress" />
          <button
            className="text-button"
            onClick={() =>
              setStage(stage === "split-intro" ? "split1" : "fill")
            }
          >
            Ci sono, giochiamo <span>→</span>
          </button>
        </div>
      )}
      {stage === "result" && review && game && (
        <ReviewSummary
          game={game}
          onClose={() => {
            setReview(false);
            window.setTimeout(() => resultButton.current?.focus(), 0);
          }}
        />
      )}
      {stage === "result" && !review && (
        <div
          className={`result-overlay ${result === "A_WIN" ? "victory" : ""}`}
        >
          <section
            className="result-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="result-title"
            onKeyDown={(event) => {
              if (event.key !== "Tab") return;
              const buttons = Array.from(
                event.currentTarget.querySelectorAll<HTMLButtonElement>(
                  "button:not(:disabled)",
                ),
              );
              const first = buttons[0],
                last = buttons[buttons.length - 1];
              if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last?.focus();
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first?.focus();
              }
            }}
          >
            <div className="result-spark">
              {result === "A_WIN" ? "♛" : result === "DRAW" ? "◇" : "♠"}
            </div>
            <span className="eyebrow">DUELLO COMPLETATO</span>
            <h2 id="result-title">
              {result === "A_WIN"
                ? "YOU WIN"
                : result === "B_WIN"
                  ? "YOU LOSE"
                  : "DRAW"}
              <span>.</span>
            </h2>
            <p>
              {early
                ? "Il risultato è già deciso: nessun Fill può cambiarlo."
                : result === "A_WIN"
                  ? "Hai giocato bene le tue carte."
                  : result === "B_WIN"
                    ? "Ogni duello insegna una nuova mossa."
                    : "Stesso equilibrio. La rivincita ti aspetta."}
            </p>
            {!early && (
              <div className="final-score">
                <span>
                  TU <b>{game?.result?.scores?.[0]}</b>
                </span>
                <i>:</i>
                <span>
                  <b>{game?.result?.scores?.[1]}</b> BOT
                </span>
              </div>
            )}
            <div className="xp-reward">
              ✧ +{earned} XP <span>{xp} XP TOTALI</span>
            </div>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <button className="secondary" onClick={() => setReview(true)}>
              Rivedi il tavolo
            </button>
            <button
              ref={resultButton}
              className="primary"
              disabled={loading || accountPending}
              onClick={start}
            >
              Rivincita <span>↗</span>
            </button>
            <button
              className="text-button"
              onClick={() => {
                setError("");
                setStage("lobby");
              }}
            >
              Cambia avversario →
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
