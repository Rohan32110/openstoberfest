"use client";

// The whole Rewise screen flow in one client component:
//   no name yet -> ask for it  ->  setup (concept, points, persona)  ->  chat.
// Everything is remembered in localStorage via useStored.

import { useEffect, useRef, useState } from "react";
import Mascot from "@/components/Mascot";
import { PERSONAS, getPersona, type PersonaId } from "@/lib/personas";
import { useStored, type Session } from "@/lib/storage";

const PASS_MARK = 80; // understanding at or above this = "they finally get it"

// Shared look for every button: always pill-shaped, visible keyboard focus.
const pill =
  "rounded-full px-5 py-2.5 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-40 disabled:cursor-not-allowed";
const primary = `${pill} bg-white text-black hover:bg-zinc-200`;
const ghost = `${pill} border border-white/15 text-zinc-200 hover:bg-white/10`;
const field =
  "w-full rounded-2xl border border-white/10 bg-surface px-4 py-3 text-base text-zinc-100 placeholder:text-zinc-500 focus-visible:outline-2 focus-visible:outline-white/60";

export default function Rewise() {
  const [name, setName, nameReady] = useStored("name", "");
  const [session, setSession, sessionReady] = useStored<Session | null>("session", null);
  const [persona, setPersona] = useStored<PersonaId>("persona", "kid");
  const [offline, setOffline] = useStored("offline", false);
  const [userKey] = useStored("groqKey", "");

  const [nameDraft, setNameDraft] = useState("");
  const [concept, setConcept] = useState("");
  const [points, setPoints] = useState("");
  const [draft, setDraft] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  // Timer: counts up only while there is text in the box. Display only.
  const typing = draft.length > 0;
  useEffect(() => {
    if (!typing) return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [typing]);

  // Keep the newest message in view.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [session?.messages.length, busy]);

  if (!nameReady || !sessionReady) return <main className="flex-1" />; // wait for localStorage

  // ---------- 1. Ask for the name ----------
  if (!name) {
    return (
      <Centered>
        <h1 className="text-3xl font-semibold">Welcome to Rewise</h1>
        <p className="mt-2 text-muted">Explain it to someone confused. That is how you find out what you really know.</p>
        <form
          className="mt-8 flex w-full flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (nameDraft.trim()) setName(nameDraft.trim());
          }}
        >
          <label htmlFor="name" className="sr-only">Your name</label>
          <input id="name" className={field} placeholder="What should we call you?" value={nameDraft} maxLength={40}
            onChange={(e) => setNameDraft(e.target.value)} autoFocus />
          <button className={primary} disabled={!nameDraft.trim()}>Start</button>
        </form>
      </Centered>
    );
  }

  // ---------- 2. Setup: concept, points, persona ----------
  if (!session) {
    return (
      <Centered>
        <h1 className="text-3xl font-semibold">Hi {name}</h1>
        <p className="mt-2 text-muted">What do you want to understand better today?</p>
        <form
          className="mt-8 flex w-full flex-col gap-5 text-left"
          onSubmit={(e) => {
            e.preventDefault();
            if (!concept.trim()) return;
            setSession({ concept: concept.trim(), points: points.trim(), persona, messages: [], understanding: 0, confusion: 60 });
            setError("");
          }}
        >
          <div>
            <label htmlFor="concept" className="mb-1.5 block text-sm font-medium">Concept to explain</label>
            <input id="concept" className={field} placeholder="e.g. How photosynthesis works" value={concept}
              maxLength={200} onChange={(e) => setConcept(e.target.value)} autoFocus />
          </div>
          <div>
            <label htmlFor="points" className="mb-1.5 block text-sm font-medium">
              Points you want to cover <span className="font-normal text-muted">(optional)</span>
            </label>
            <textarea id="points" className={`${field} h-24 resize-none`} value={points} maxLength={1000}
              onChange={(e) => setPoints(e.target.value)} aria-describedby="points-hint" />
            <p id="points-hint" className="mt-1.5 text-sm text-muted">
              List the key points you want to hit — we&apos;ll track them.
            </p>
          </div>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Who are you explaining it to?</legend>
            <div className="flex flex-col gap-2">
              {PERSONAS.map((p) => (
                <button key={p.id} type="button" role="radio" aria-checked={persona === p.id}
                  onClick={() => setPersona(p.id)}
                  className={`${pill} flex items-center gap-3 border text-left ${persona === p.id ? "bg-white/10" : "border-white/10 hover:bg-white/5"}`}
                  style={persona === p.id ? { borderColor: p.color } : undefined}>
                  <span className="size-3 shrink-0 rounded-full" style={{ background: p.color }} />
                  <span>
                    <span className="block">{p.name}</span>
                    <span className="block text-xs font-normal text-muted">{p.tagline}</span>
                  </span>
                </button>
              ))}
            </div>
          </fieldset>
          <button className={primary} disabled={!concept.trim()}>Start explaining</button>
        </form>
      </Centered>
    );
  }

  // ---------- 3. Chat ----------
  const p = getPersona(session.persona);
  const passed = session.understanding >= PASS_MARK;
  const lastModel = [...session.messages].reverse().find((m) => m.role === "assistant")?.model;
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  async function send() {
    const text = draft.trim();
    if (!text || busy || !session) return;
    const before = session;
    const messages = [...before.messages, { role: "user" as const, content: text }];
    setSession({ ...before, messages });
    setDraft("");
    setSeconds(0);
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          concept: before.concept, points: before.points, persona: before.persona,
          understanding: before.understanding, offline, userKey: userKey || undefined,
          messages: messages.map(({ role, content }) => ({ role, content })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "The AI is busy right now. Try again in a moment.");
      setSession({
        ...before,
        messages: [...messages, { role: "assistant", content: data.reply, model: data.model }],
        understanding: data.understanding ?? before.understanding, // keep old score if the model's JSON was broken
        confusion: data.confusion ?? before.confusion,
      });
    } catch (err) {
      // Undo: give the user their text back so nothing is lost.
      setSession(before);
      setDraft(text);
      setError(err instanceof Error && err.message ? err.message : "Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex h-dvh w-full max-w-2xl flex-col px-4">
      <header className="flex items-center justify-between gap-2 py-4">
        <span className="truncate text-sm text-muted">Hi {name}</span>
        <div className="flex items-center gap-2">
          <button role="switch" aria-checked={offline} onClick={() => setOffline(!offline)}
            className={`${pill} !px-4 !py-1.5 border border-white/15 ${offline ? "bg-white text-black" : "text-zinc-300 hover:bg-white/10"}`}
            title="Offline uses a local Ollama model (works only when running the app on your own computer)">
            {offline ? "Offline: on" : "Offline: off"}
          </button>
          <button className={`${ghost} !px-4 !py-1.5`} onClick={() => { setSession(null); setConcept(""); setPoints(""); setDraft(""); setSeconds(0); setError(""); }}>
            New concept
          </button>
        </div>
      </header>

      <section className="flex flex-col items-center gap-3 pb-4" aria-label="Understanding">
        <Mascot color={p.color} confusion={passed ? 0 : session.confusion} thinking={busy} />
        <p className="text-sm text-muted">{p.name} · <span className="text-zinc-300">{session.concept}</span></p>
        <div className="w-full max-w-xs">
          <div className="mb-1 flex justify-between text-xs text-muted">
            <span>{passed ? "Got it!" : "Understanding"}</span>
            <span>{session.understanding}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/10" role="progressbar"
            aria-valuenow={session.understanding} aria-valuemin={0} aria-valuemax={100} aria-label="Understanding">
            <div className="h-full rounded-full transition-all duration-700 ease-out"
              style={{ width: `${session.understanding}%`, background: passed ? "var(--success)" : p.color }} />
          </div>
        </div>
        {lastModel && <span className="rounded-full border border-white/10 px-3 py-0.5 text-xs text-muted">answered by {lastModel}</span>}
      </section>

      <div className="flex-1 space-y-3 overflow-y-auto pb-4" aria-live="polite">
        {session.messages.length === 0 && (
          <p className="text-center text-muted">
            Explain <strong className="text-zinc-200">{session.concept}</strong> in your own words, as if {p.name.split(",")[0]} had never heard of it.
          </p>
        )}
        {session.messages.map((m, i) => (
          <div key={i} className={`max-w-[85%] rounded-3xl px-4 py-2.5 text-[15px] leading-relaxed ${
            m.role === "user" ? "ml-auto bg-white/10" : "bg-surface"}`}
            style={m.role === "assistant" ? { borderLeft: `3px solid ${p.color}` } : undefined}>
            {m.content}
          </div>
        ))}
        {busy && <div className="text-sm text-muted">{p.name.split(",")[0]} is thinking…</div>}
        {passed && (
          <div className="rounded-3xl border border-[var(--success)]/40 bg-[var(--success)]/10 px-4 py-3 text-center text-sm">
            You explained it so well that {p.name.split(",")[0]} finally gets it. Nice work, {name}!
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form className="pb-4 pt-2" onSubmit={(e) => { e.preventDefault(); send(); }}>
        {error && <p role="alert" className="mb-2 rounded-2xl bg-red-500/10 px-4 py-2 text-sm text-red-300">{error}</p>}
        <div className="flex items-end gap-2">
          <label htmlFor="explain" className="sr-only">Your explanation</label>
          <textarea id="explain" rows={2} className={`${field} resize-none`} value={draft} disabled={busy}
            placeholder="Type your explanation…" maxLength={4000}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
          <button className={primary} disabled={busy || !draft.trim()}>Send</button>
        </div>
        <p className="mt-1.5 px-2 text-xs text-muted" aria-label="Time spent on this explanation">⏱ {mm}:{ss}</p>
      </form>
    </div>
  );
}

// Centres a narrow column of content in the middle of the screen.
function Centered({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-4 py-10 text-center">{children}</main>;
}
