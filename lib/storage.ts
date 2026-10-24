"use client";

// useStored: like useState, but the value is saved in the browser's
// localStorage under "rewise:<key>". Nothing ever leaves the browser.
// It is built on useSyncExternalStore: React reads localStorage as an
// "external store". On the server (and the first browser render) it sees
// `initial`, so the HTML matches; right after hydration it sees the saved value.
// `ready` is false until that has happened.

import { useCallback, useMemo, useSyncExternalStore } from "react";

const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);
  window.addEventListener("storage", callback); // changes from another tab
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(`rewise:${key}`);
  } catch {
    return null; // blocked storage: behave as if nothing is saved
  }
}

export function useStored<T>(key: string, initial: T) {
  const raw = useSyncExternalStore(subscribe, () => read(key), () => null);
  const ready = useSyncExternalStore(() => () => {}, () => true, () => false);

  const value = useMemo(() => {
    if (raw === null) return initial;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return initial; // corrupt data: fall back to the default
    }
  }, [raw, initial]);

  const update = useCallback(
    (next: T) => {
      try {
        localStorage.setItem(`rewise:${key}`, JSON.stringify(next));
      } catch {
        // Storage full or blocked: the app still works, it just won't remember.
      }
      listeners.forEach((l) => l()); // tell every useStored to re-read
    },
    [key],
  );

  return [value, update, ready] as const;
}

export type Msg = { role: "user" | "assistant"; content: string; model?: string };

// A study card made from the user's explanation; `fix` explains a mistake.
export type Card = { front: string; back: string; fix?: string };

// One study session = one concept. Starting a new concept replaces it,
// which is what resets the progress bar.
export type Session = {
  concept: string;
  points: string;
  persona: "kid" | "friend" | "professor";
  messages: Msg[];
  understanding: number;
  confusion: number;
  flashcards?: Card[]; // saved so reopening them doesn't call the AI again
  covered?: number[]; // indexes of "points to cover" the user has explained
};
