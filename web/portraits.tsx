import React, { useId } from "react";
import type { Difficulty } from "./bot/levels";
export const BOT_PROFILES = {
  easy: {
    name: "The Rookie",
    title: "Un buon inizio.",
    description: "Ha imparato le regole. Ora tocca a te sorprenderlo.",
    color: "#85d6bd",
    symbol: "♣",
  },
  medium: {
    name: "The Tactician",
    title: "Alza la posta.",
    description: "Legge il tavolo e sceglie con cura. Gioca un passo avanti.",
    color: "#a7a2ff",
    symbol: "♦",
  },
  hard: {
    name: "The Oracle",
    title: "Accetta la sfida.",
    description: "Strategico, imprevedibile. Ogni numero conta.",
    color: "#ebc77f",
    symbol: "♠",
  },
};
export function BotPortrait({
  difficulty,
  compact = false,
}: {
  difficulty: Difficulty;
  compact?: boolean;
}) {
  const id = useId().replace(/:/g, "");
  const p = BOT_PROFILES[difficulty];
  return (
    <svg
      className={compact ? "bot-portrait compact" : "bot-portrait"}
      viewBox="0 0 320 340"
      role="img"
      aria-label={`Ritratto di ${p.name}`}
    >
      <defs>
        <linearGradient id={`${id}body`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor={p.color} />
          <stop offset="1" stopColor="#304344" />
        </linearGradient>
        <radialGradient id={`${id}halo`}>
          <stop stopColor={p.color} stopOpacity=".24" />
          <stop offset="1" stopColor={p.color} stopOpacity="0" />
        </radialGradient>
        <pattern
          id={`${id}grid`}
          width="22"
          height="22"
          patternUnits="userSpaceOnUse"
        >
          <path d="M11 7v8M7 11h8" stroke={p.color} strokeOpacity=".16" />
        </pattern>
      </defs>
      <rect width="320" height="340" fill={`url(#${id}grid)`} />
      <circle cx="160" cy="159" r="156" fill={`url(#${id}halo)`} />
      <g fill="none" stroke={p.color} opacity=".35">
        <circle cx="160" cy="161" r="111" />
        <circle cx="160" cy="161" r="120" strokeDasharray="2 8" />
        <path d="M160 20v30M160 272v35M18 161h30M272 161h30" />
      </g>
      <path
        d="M62 299q8-72 62-81h72q54 9 62 81l-98 27z"
        fill={`url(#${id}body)`}
      />
      <path d="m125 220 35 35 35-35-10 81h-50z" fill="#14212a" />
      <path d="m160 248-18 31 18 26 18-26z" fill={p.color} />
      <path
        d="M97 113q0-34 63-34t63 34v77q0 21-63 48-63-27-63-48z"
        fill={`url(#${id}body)`}
        stroke={p.color}
      />
      <path d="M107 136q53-17 106 0v40q-53 35-106 0z" fill="#101e27" />
      {difficulty === "easy" ? (
        <>
          <rect x="125" y="146" width="15" height="21" rx="7" fill={p.color} />
          <rect x="180" y="146" width="15" height="21" rx="7" fill={p.color} />
          <path
            d="M148 190q12 12 24 0"
            stroke="#14212a"
            strokeWidth="5"
            fill="none"
          />
          <path d="m116 94 16-33 66 14 10 19z" fill={p.color} />
        </>
      ) : difficulty === "medium" ? (
        <>
          <path
            d="m117 146 29 6-6 13-23-7M203 146l-29 6 6 13 23-7"
            fill={p.color}
          />
          <path d="m145 84 15-34 15 34-15 26z" fill={p.color} />
          <path d="M145 199h30" stroke="#14212a" strokeWidth="4" />
        </>
      ) : (
        <>
          <path
            d="m116 150 30 5-5 9-25-6M204 150l-30 5 5 9 25-6"
            fill={p.color}
          />
          <path d="m103 94-9-46 34 20 32-38 32 38 34-20-9 46z" fill={p.color} />
          <path d="m160 119-10 13 10 13 10-13z" fill={p.color} />
          <path
            d="m145 197 15 5 15-5"
            stroke="#14212a"
            strokeWidth="4"
            fill="none"
          />
        </>
      )}
      <path
        d="m104 242 22 24-19 35M216 242l-22 24 19 35"
        fill="none"
        stroke={p.color}
        strokeOpacity=".6"
      />
      <text x="31" y="53" fill={p.color} fontSize="24">
        {p.symbol}
      </text>
      <text x="270" y="298" fill={p.color} fontSize="24">
        {p.symbol}
      </text>
    </svg>
  );
}
