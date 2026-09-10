import React, { useEffect, useRef, useState } from "react";
import type { Game } from "./game/core";

export function useMathHelp() {
  const [enabled, setEnabled] = useState(() => {
    try {
      return localStorage.getItem("duel8020.mathHelp") === "true";
    } catch {
      return false;
    }
  });
  return [
    enabled,
    (value: boolean) => {
      setEnabled(value);
      try {
        localStorage.setItem("duel8020.mathHelp", String(value));
      } catch {
        /* Optional preference. */
      }
    },
  ] as const;
}
export function MathHelpToggle({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="math-help-toggle">
      <input
        type="checkbox"
        role="switch"
        checked={enabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <b>Aiuti di calcolo</b>
        <small>Differenze e totali Fill</small>
      </span>
    </label>
  );
}
export function CardDifferences({
  own,
  opponent,
  revealed,
  preview = false,
}: {
  own: number[];
  opponent: number[];
  revealed: number;
  preview?: boolean;
}) {
  return (
    <div className="card-differences">
      <small>
        TU − AVVERSARIO{preview ? " · prima del Fill avversario" : ""}
      </small>
      <div className="card-row">
        {[0, 1, 2].map((i) => {
          const delta = own[i] - opponent[i];
          return (
            <span
              key={i}
              className={
                i < revealed
                  ? delta > 0
                    ? "positive"
                    : delta < 0
                      ? "negative"
                      : ""
                  : ""
              }
              aria-label={`Differenza carta ${i + 1}: ${i < revealed ? delta : "non rivelata"}`}
            >
              {i < revealed ? `${delta > 0 ? "+" : ""}${delta}` : "—"}
            </span>
          );
        })}
      </div>
    </div>
  );
}
export function ReviewSummary({
  game,
  onClose,
  children,
}: {
  game: Game;
  onClose: () => void;
  children?: React.ReactNode;
}) {
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    title.current?.focus();
  }, []);
  return (
    <section className="review-summary" aria-label="Analisi della partita">
      <h2 ref={title} tabIndex={-1}>
        Rivedi il duello
      </h2>
      <p>Split + Fill = totale. Confronta le scelte di ogni coppia.</p>
      <table>
        <thead>
          <tr>
            <th>Carta</th>
            <th>Tu</th>
            <th>Avversario</th>
          </tr>
        </thead>
        <tbody>
          {[0, 1, 2].map((i) => (
            <tr key={i}>
              <th>{i + 1}</th>
              {(["A", "B"] as const).map((seat) => (
                <td key={seat}>
                  {game.split[seat][i] === undefined
                    ? "Non rivelata"
                    : game.fill[seat]
                      ? `${game.split[seat][i]} + ${game.fill[seat]![i]} = ${game.split[seat][i] + game.fill[seat]![i]}`
                      : `${game.split[seat][i]} · senza Fill`}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!game.fill.A && (
        <p>Il Fill non è stato rivelato: nessuna aggiunta viene inventata.</p>
      )}
      <button className="secondary" onClick={onClose}>
        Mostra risultato
      </button>
      {children}
    </section>
  );
}
export function trapDialog(event: React.KeyboardEvent<HTMLElement>) {
  if (event.key !== "Tab") return;
  const buttons = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>(
      "button:not(:disabled)",
    ),
  );
  const first = buttons[0],
    last = buttons.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
}
