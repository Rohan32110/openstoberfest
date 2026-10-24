"use client";

// Shows flashcards one at a time. Tap the card to flip between question and
// answer. If the user got something wrong, the back shows the correction.

import { useState } from "react";
import type { Card } from "@/lib/storage";

const pill = "rounded-full border border-white/15 px-4 py-2 text-sm text-zinc-100 transition hover:bg-white/10 disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-white";

export default function Flashcards({ cards, color }: { cards: Card[]; color: string }) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const card = cards[index];
  const fixes = cards.filter((c) => c.fix).length;

  function go(step: number) {
    setIndex((i) => Math.min(cards.length - 1, Math.max(0, i + step)));
    setFlipped(false);
  }

  return (
    <div>
      <p className="mb-3 text-sm text-zinc-300">
        Made from your own explanation.{" "}
        {fixes > 0 ? `${fixes} card${fixes > 1 ? "s" : ""} correct${fixes > 1 ? "" : "s"} something you said.` : "Everything you said was correct."}
      </p>
      <button type="button" onClick={() => setFlipped(!flipped)} aria-label={flipped ? "Show question" : "Show answer"}
        className="flex min-h-48 w-full flex-col justify-center rounded-3xl border p-5 text-left transition focus-visible:outline-2 focus-visible:outline-white"
        style={{ borderColor: flipped ? color : "color-mix(in srgb, var(--foreground) 12%, transparent)", background: flipped ? `color-mix(in srgb, ${color} 12%, transparent)` : "color-mix(in srgb, var(--foreground) 3%, transparent)" }}>
        <span key={`${index}-${flipped}`} className="fade-in block">
          <span className="mb-2 block text-xs uppercase tracking-wider text-zinc-400">{flipped ? "Answer" : "Question"}</span>
          <span className="block text-lg leading-snug text-white">{flipped ? card.back : card.front}</span>
          {flipped && card.fix && (
            <span className="mt-3 block rounded-2xl bg-amber-400/10 px-3 py-2 text-sm text-amber-200">
              <strong className="font-semibold">Correction: </strong>{card.fix}
            </span>
          )}
          {!flipped && <span className="mt-4 block text-xs text-zinc-400">Tap to see the answer</span>}
        </span>
      </button>
      <div className="mt-4 flex items-center justify-between">
        <button type="button" className={pill} onClick={() => go(-1)} disabled={index === 0}>Previous</button>
        <span className="text-sm text-zinc-300">{index + 1} / {cards.length}</span>
        <button type="button" className={pill} onClick={() => go(1)} disabled={index === cards.length - 1}>Next</button>
      </div>
    </div>
  );
}
