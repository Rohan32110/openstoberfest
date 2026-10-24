"use client";

// The whole Rewise screen flow in one client component:
//   no name yet -> ask for it  ->  setup (topic, points, persona)  ->  chat.
// Popups (onboarding, settings, rate limit, history, flashcards) sit on top.
// Everything is remembered in localStorage via useStored.

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, History, Plus, Settings as SettingsIcon } from "lucide-react";
import Flashcards from "@/components/Flashcards";
import Mascot from "@/components/Mascot";
import MicButton, { type MicState } from "@/components/MicButton";
import Modal from "@/components/Modal";
import { OfflineGuide, Onboarding, RateLimited, Settings, type Theme } from "@/components/Popups";
import SyllabusPicker from "@/components/SyllabusPicker";
import { PERSONAS, getPersona, type PersonaId } from "@/lib/personas";
import { splitPoints } from "@/lib/points";
import { useStored, type Session } from "@/lib/storage";

const PASS_MARK = 80; // understanding at or above this = "they finally get it"
const MIN_THINKING_MS = 1000; // always show "Thinking…" for about a second
const ONBOARDING_DELAY_MS = 5000;

// Shared looks. Every button is pill-shaped or round, with visible keyboard focus.
const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";
const primary = `rounded-full bg-white px-5 py-3 text-sm font-medium text-black transition hover:bg-zinc-200 disabled:opacity-40 ${focus}`;
const ghost = `rounded-full border border-white/15 px-5 py-3 text-sm font-medium text-white transition hover:bg-white/10 disabled:opacity-40 ${focus}`;
const iconBtn = `grid size-9 place-items-center rounded-full text-zinc-200 transition hover:bg-white/10 hover:text-white ${focus}`;
const field = "w-full rounded-3xl border border-white/10 bg-surface px-4 py-3 text-base placeholder:text-zinc-400 focus-visible:outline-2 focus-visible:outline-white/50";

export default function Rewise() {
  const [name, setName, ready] = useStored("name", "");
  const [session, setSession] = useStored<Session | null>("session", null);
  const [persona, setPersona] = useStored<PersonaId>("persona", "kid");
  const [offline, setOffline] = useStored("offline", false);
  const [onboarded, setOnboarded] = useStored("onboarded", false);
  const [speechLang, setSpeechLang] = useStored<"en" | "bn">("speechLang", "en");
  const [groqKey, setGroqKey] = useStored("groqKey", "");
  const [speechmaticsKey, setSpeechmaticsKey] = useStored("speechmaticsKey", "");
  const [elevenLabsKey, setElevenLabsKey] = useStored("elevenlabsKey", "");
  const [theme, setTheme] = useStored<Theme>("theme", "system");
  const spokenBase = useRef(""); // what was typed before the mic started
  const ignoreSpeech = useRef(false); // true after Send, so late transcript text can't refill the box
  const [stopMic, setStopMic] = useState(0); // bump to tell the mic to stop

  const [nameDraft, setNameDraft] = useState("");
  const [concept, setConcept] = useState("");
  const [points, setPoints] = useState("");
  const [draft, setDraft] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [cardsBusy, setCardsBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const [error, setError] = useState("");
  const [mic, setMic] = useState<MicState>("idle");
  const [serverSpeech, setServerSpeech] = useState(false);
  const [popup, setPopup] = useState<"none" | "onboarding" | "settings" | "rateLimit" | "history" | "cards" | "offline">("none");

  // Apply the theme to <html>; the CSS swaps colours via data-theme.
  // (layout.tsx does the same before first paint to avoid a flash.)
  useEffect(() => {
    const resolved = theme === "system"
      ? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark")
      : theme;
    document.documentElement.dataset.theme = resolved;
  }, [theme]);

  // Offline was saved as "on" but Ollama isn't reachable here (e.g. opened
  // the deployed site): switch back to online so chat and the mic keep working.
  useEffect(() => {
    if (!ready || !offline) return;
    ollamaReady().then((ok) => { if (!ok) setOffline(false); });
  }, [ready, offline, setOffline]);

  // Does the server have a speech key? If not, the mic only shows when the
  // user has added their own key in Settings.
  useEffect(() => {
    fetch("/api/speech-status").then((r) => r.json()).then((d) => setServerSpeech(Boolean(d.available))).catch(() => {});
  }, []);

  // First visit ever: once the user has entered their name, show the
  // onboarding popup after 5 seconds (never on top of the name screen).
  useEffect(() => {
    if (!ready || onboarded || !name) return;
    const id = setTimeout(() => setPopup((p) => (p === "none" ? "onboarding" : p)), ONBOARDING_DELAY_MS);
    return () => clearTimeout(id);
  }, [ready, onboarded, name]);

  // Timer: counts up while the user is typing or talking. Display only.
  const composing = draft.length > 0 || mic === "recording";
  useEffect(() => {
    if (!composing) return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [composing]);

  // While waiting for the AI: "Thinking…" first, then after 1.2s switch once
  // to "Analyzing…" and stay there until the answer arrives.
  useEffect(() => {
    if (!busy) return;
    const id = setTimeout(() => setTick(1), 1200);
    return () => clearTimeout(id);
  }, [busy]);

  const closePopup = () => setPopup("none");
  const turnOfflineOn = useCallback(() => setOffline(true), [setOffline]);
  const settingsButton = (
    <button className={iconBtn} onClick={() => setPopup("settings")} aria-label="Settings" title="Settings">
      <SettingsIcon className="size-5" aria-hidden />
    </button>
  );

  // ---------- 1. Ask for the name ----------
  function nameScreen() {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10 text-center">
        <div className="mx-auto"><Mascot color={PERSONAS[0].color} confusion={20} thinking={false} size="120px" /></div>
        <h1 className="mt-8 text-3xl font-semibold tracking-tight">Welcome to Rewise</h1>
        <p className="mt-2 text-zinc-300">Explain it to someone confused. That&apos;s how you find out what you really know.</p>
        <form className="mt-8 flex flex-col gap-3" onSubmit={(e) => {
          e.preventDefault();
          if (nameDraft.trim()) setName(nameDraft.trim());
        }}>
          <label htmlFor="name" className="sr-only">Your name</label>
          <input id="name" className={`${field} text-center`} placeholder="What should we call you?" value={nameDraft}
            maxLength={40} onChange={(e) => setNameDraft(e.target.value)} autoFocus />
          <button className={primary} disabled={!nameDraft.trim()}>Start</button>
        </form>
      </main>
    );
  }

  // ---------- 2. Setup: topic, points, persona ----------
  function setupScreen() {
    const chosen = getPersona(persona);
    return (
      <div className="flex min-h-dvh flex-col">
        <header className="mx-auto flex h-14 w-full max-w-6xl shrink-0 items-center justify-between px-5 md:px-10">
          <span className="text-base font-semibold tracking-tight">Rewise</span>
          {settingsButton}
        </header>
        {/* Anchored near the top (not vertically centred) so nothing ends up
            below the visible area on tall windows or behind a taskbar. */}
        <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-5 pb-8 md:px-10">
          <form className="grid gap-8 pt-2 md:grid-cols-[1.2fr_1fr] md:gap-14 md:pt-[4vh]" onSubmit={(e) => {
            e.preventDefault();
            if (!concept.trim()) return;
            setSession({ concept: concept.trim(), points: points.trim(), persona, messages: [], understanding: 0, confusion: 60 });
            setError("");
          }}>
            {/* Left: what to explain */}
            <section className="flex flex-col gap-5">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl">Hi {name}</h1>
                <p className="mt-2 text-zinc-300">What do you want to understand better today?</p>
              </div>
              <SyllabusPicker selected={concept} onPick={setConcept} />
              <div>
                <label htmlFor="concept" className="mb-1.5 block text-sm font-medium">Topic to explain</label>
                <input id="concept" autoComplete="off" className={field} placeholder="Type any topic, e.g. How photosynthesis works" value={concept}
                  maxLength={200} onChange={(e) => setConcept(e.target.value)} />
              </div>
              <div>
                <label htmlFor="points" className="mb-1.5 block text-sm font-medium">
                  Points to cover <span className="font-normal text-zinc-400">(optional)</span>
                </label>
                <textarea id="points" rows={2} className={`${field} resize-none`} value={points} maxLength={1000}
                  placeholder="e.g. light reactions, Calvin cycle" onChange={(e) => setPoints(e.target.value)}
                  aria-describedby="points-hint" />
                <p id="points-hint" className="mt-1.5 text-sm text-zinc-300">List the key points you want to hit — we&apos;ll track them.</p>
              </div>
            </section>

            {/* Right: who you're explaining to - pick one of three orbs */}
            <section className="flex flex-col gap-4 md:pt-22">
              <fieldset>
                <legend className="mb-4 w-full text-center text-sm font-medium">Who are you explaining it to?</legend>
                <div className="grid grid-cols-3 gap-2" role="radiogroup">
                  {PERSONAS.map((p) => {
                    const active = persona === p.id;
                    return (
                      <button key={p.id} type="button" role="radio" aria-checked={active} onClick={() => setPersona(p.id)}
                        aria-label={`${p.name}: ${p.short}`}
                        className={`flex flex-col items-center gap-2 rounded-[28px] px-1 py-3 text-center transition ${focus} ${
                          active ? "bg-white/6" : "opacity-60 hover:opacity-100"}`}>
                        <Mascot color={p.color} confusion={active ? 20 : 50} thinking={false} size={active ? "clamp(76px, 11dvh, 104px)" : "clamp(64px, 9dvh, 88px)"} />
                        <span className="font-semibold text-white">{p.name}</span>
                        <span className="text-xs leading-snug text-zinc-300">{p.short}</span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
              <p className="hidden rounded-3xl bg-white/4 px-5 py-3 text-center text-sm leading-relaxed text-zinc-200 sm:block">
                <span className="font-semibold text-white">{chosen.name}</span> · {chosen.role}. {chosen.description}
              </p>
              <button className={primary} disabled={!concept.trim()}>
                {concept.trim() ? `Start explaining to ${chosen.name}` : "Choose a topic to start"}
              </button>
            </section>
          </form>
        </main>
      </div>
    );
  }

  // ---------- 3. Chat ----------
  function chatScreen(s: Session) {
    const p = getPersona(s.persona);
    const passed = s.understanding >= PASS_MARK;
    const lastAi = [...s.messages].reverse().find((m) => m.role === "assistant");
    const lastUser = [...s.messages].reverse().find((m) => m.role === "user");
    const micVisible = !offline && (serverSpeech || Boolean(speechmaticsKey || elevenLabsKey));
    const keyHeaders: Record<string, string> = {};
    if (speechmaticsKey) keyHeaders["x-speechmatics-key"] = speechmaticsKey;
    if (elevenLabsKey) keyHeaders["x-elevenlabs-key"] = elevenLabsKey;
    const pointList = splitPoints(s.points);
    const timer = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

    return (
      <div className="flex h-dvh flex-col">
        {/* Header: topic on the left, actions on the right */}
        <header className="mx-auto flex h-14 w-full max-w-6xl shrink-0 items-center justify-between gap-2 px-4 md:px-10">
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: p.color }} />
            <span className="truncate text-zinc-100">{s.concept}</span>
            <span className="hidden shrink-0 text-zinc-400 sm:inline">· with {p.name}</span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button role="switch" aria-checked={offline} onClick={toggleOffline}
              title="Offline uses a local Ollama model. Works only when running Rewise on your own computer."
              className={`mr-1 rounded-full border px-3 py-1.5 text-xs transition ${focus} ${
                offline ? "border-white bg-white text-black" : "border-white/15 text-zinc-200 hover:bg-white/10"}`}>
              Offline {offline ? "on" : "off"}
            </button>
            <button className={iconBtn} onClick={() => setPopup("history")} aria-label="Conversation history" title="Conversation history">
              <History className="size-5" aria-hidden />
            </button>
            {settingsButton}
            <button className={iconBtn} onClick={newConcept} aria-label="New topic" title="New topic">
              <Plus className="size-5" aria-hidden />
            </button>
          </div>
        </header>

        {/* Centre: orb, progress and the latest exchange. Scrolls on its own if
            it ever gets too tall, so the composer below always stays in view. */}
        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col items-center justify-center gap-5 px-4 py-6 text-center md:px-10">
            <Mascot color={p.color} confusion={passed ? 0 : s.confusion} thinking={busy} size="clamp(100px, 19dvh, 180px)" />

            <div className="w-full max-w-72">
              <div className="mb-1.5 flex justify-between text-xs text-zinc-300">
                <span>{passed ? `${p.name} gets it!` : `${p.name}'s understanding`}</span>
                <span className="tabular-nums">{s.understanding}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-label="Understanding"
                aria-valuenow={s.understanding} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{ width: `${s.understanding}%`, background: passed ? "var(--success)" : p.color }} />
              </div>
            </div>

            {/* Points checklist: ticks off as the AI judges each point explained */}
            {pointList.length > 0 && (
              <ul className="flex max-w-2xl flex-wrap justify-center gap-1.5" aria-label="Points to cover">
                {pointList.map((pt, i) => {
                  const done = s.covered?.includes(i);
                  return (
                    <li key={i} className={`rounded-full border px-3 py-1 text-xs transition ${done ? "text-white" : "border-white/15 text-zinc-300"}`}
                      style={done ? { borderColor: p.color, background: `color-mix(in srgb, ${p.color} 20%, transparent)` } : undefined}>
                      {done ? "✓ " : ""}{pt}<span className="sr-only">{done ? " (covered)" : " (not covered yet)"}</span>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="flex w-full max-w-3xl flex-col items-center gap-3" aria-live="polite">
              {lastUser && <p className="line-clamp-2 text-sm text-zinc-400">You: “{lastUser.content}”</p>}
              {busy ? (
                <p key={tick} className="fade-in shimmer text-xl font-medium">{tick === 0 ? "Thinking…" : "Analyzing…"}</p>
              ) : lastAi ? (
                <p key={s.messages.length} className="fade-in text-xl leading-snug text-white md:text-2xl">{lastAi.content}</p>
              ) : (
                <p className="text-xl leading-snug text-zinc-200 md:text-2xl">
                  Explain <span className="font-medium text-white">{s.concept}</span> to {p.name} in your own words.
                </p>
              )}
              {passed && !busy && (
                <div className="mt-2 flex flex-wrap justify-center gap-2">
                  <button className={primary} onClick={makeFlashcards} disabled={cardsBusy}>
                    {cardsBusy ? "Making flashcards…" : s.flashcards ? "Open flashcards" : "Make flashcards"}
                  </button>
                  <button className={ghost} onClick={newConcept}>Explain something new</button>
                </div>
              )}
            </div>
          </div>
        </main>

        {/* Composer, pinned to the bottom like ChatGPT / Claude */}
        <footer className="mx-auto w-full max-w-3xl shrink-0 px-4 pb-3 pt-1">
          {error && <p role="alert" className="mb-2 text-center text-sm text-red-300">{error}</p>}
          <div className="mb-1.5 flex h-4 items-center justify-between px-5 text-xs text-zinc-400">
            <span aria-label="Time spent on this explanation" className="tabular-nums">{composing || seconds > 0 ? `⏱ ${timer}` : ""}</span>
            <span>{lastAi?.model ? `answered by ${lastAi.model}` : ""}</span>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); send(); }}
            className="flex items-end gap-1.5 rounded-[28px] border border-white/10 bg-surface p-2 pl-5 shadow-lg shadow-black/20 transition focus-within:border-white/25">
            <label htmlFor="explain" className="sr-only">Your explanation</label>
            <textarea id="explain" rows={1} value={draft} disabled={busy} readOnly={mic !== "idle"} maxLength={4000}
              placeholder={mic === "recording" ? "Listening… (stops after 5s of silence)" : mic === "transcribing" ? "Finishing…" : `Explain it to ${p.name}…`}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              className="max-h-40 min-h-10 flex-1 resize-none self-center bg-transparent py-2 text-base leading-6 outline-none field-sizing-content placeholder:text-zinc-400" />
            {micVisible && (
              <>
                <button type="button" onClick={() => setSpeechLang(speechLang === "en" ? "bn" : "en")}
                  aria-label={`Voice language: ${speechLang === "en" ? "English" : "Bangla"}. Click to switch.`}
                  title="Voice input language"
                  className={`h-10 shrink-0 rounded-full px-2.5 text-xs text-zinc-300 transition hover:bg-white/10 hover:text-white ${focus}`}>
                  {speechLang === "en" ? "EN" : "বাং"}
                </button>
                <MicButton language={speechLang} keyHeaders={keyHeaders} disabled={busy} stopSignal={stopMic}
                  onStateChange={setMic}
                  onStart={() => { spokenBase.current = draft.trim(); ignoreSpeech.current = false; setError(""); }}
                  onLive={(text) => { if (!ignoreSpeech.current) setDraft(joinText(spokenBase.current, text)); }}
                  onText={(text) => { if (!ignoreSpeech.current) setDraft(joinText(spokenBase.current, text)); }}
                  onError={setError} />
              </>
            )}
            <button aria-label="Send" disabled={busy || !draft.trim()}
              className={`grid size-10 shrink-0 place-items-center rounded-full bg-white text-black transition hover:bg-zinc-200 disabled:bg-white/20 disabled:text-zinc-400 ${focus}`}>
              <ArrowUp className="size-5" strokeWidth={2.4} aria-hidden />
            </button>
          </form>
          <p className="mt-2 text-center text-[11px] text-zinc-400">
            {offline
              ? <>Offline: replies come from Gemma 3 1B on this computer via Ollama. Voice input is off.{" "}
                  <button type="button" onClick={() => setPopup("offline")} className="underline underline-offset-2 hover:text-white">Setup guide</button></>
              : "Rewise can make mistakes. Check important facts against your course material."}
          </p>
        </footer>
      </div>
    );
  }

  // Turning Offline on always opens the guide. The guide checks for Ollama and
  // switches Offline on only if it's ready; otherwise (always the case on the
  // deployed site) Rewise stays online.
  function toggleOffline() {
    if (offline) setOffline(false);
    else setPopup("offline");
  }

  function newConcept() {
    setSession(null);
    setConcept("");
    setPoints("");
    setDraft("");
    setSeconds(0);
    setError("");
  }

  async function send() {
    const text = draft.trim();
    if (!text || busy || !session) return;
    // Sending while the mic is still on: stop it and drop any words that
    // arrive afterwards, so the box stays empty for the next answer.
    if (mic !== "idle") {
      ignoreSpeech.current = true;
      setStopMic((n) => n + 1);
    }
    const before = session;
    const messages = [...before.messages, { role: "user" as const, content: text }];
    const started = Date.now();
    setSession({ ...before, messages });
    setDraft("");
    setSeconds(0);
    setTick(0);
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          concept: before.concept, points: before.points, persona: before.persona,
          understanding: before.understanding, offline, userKey: groqKey || undefined,
          messages: messages.map(({ role, content }) => ({ role, content })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.rateLimited) setPopup("rateLimit");
        throw new Error(data.error || "The AI is busy right now. Try again in a moment.");
      }
      // Even fast answers show "Thinking…" briefly, so replies don't feel abrupt.
      const wait = MIN_THINKING_MS - (Date.now() - started);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      setSession({
        ...before,
        messages: [...messages, { role: "assistant", content: data.reply, model: data.model }],
        understanding: data.understanding ?? before.understanding, // keep old score if the model's JSON was broken
        confusion: data.confusion ?? before.confusion,
        covered: [...new Set([...(before.covered ?? []), ...(data.covered ?? [])])], // once covered, stays covered
        flashcards: undefined, // new explanation -> old cards are out of date
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

  async function makeFlashcards() {
    if (!session) return;
    if (session.flashcards) return setPopup("cards"); // already made for this conversation
    setCardsBusy(true);
    setError("");
    try {
      const res = await fetch("/api/flashcards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          concept: session.concept, points: session.points, offline, userKey: groqKey || undefined,
          messages: session.messages.map(({ role, content }) => ({ role, content })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.rateLimited) setPopup("rateLimit");
        throw new Error(data.error || "Couldn't make flashcards. Try again.");
      }
      setSession({ ...session, flashcards: data.cards });
      setPopup("cards");
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Couldn't make flashcards. Try again.");
    } finally {
      setCardsBusy(false);
    }
  }

  if (!ready) return <main className="h-dvh" />; // wait for localStorage

  return (
    <>
      {!name ? nameScreen() : !session ? setupScreen() : chatScreen(session)}

      {popup === "onboarding" && <Onboarding onClose={() => { setOnboarded(true); closePopup(); }} />}
      {popup === "settings" && (
        <Settings
          keys={{ groq: groqKey, speechmatics: speechmaticsKey, elevenlabs: elevenLabsKey }}
          theme={theme}
          onTheme={setTheme}
          onSave={(k) => { setGroqKey(k.groq); setSpeechmaticsKey(k.speechmatics); setElevenLabsKey(k.elevenlabs); }}
          onClose={closePopup} />
      )}
      {popup === "offline" && <OfflineGuide onClose={closePopup} onReady={turnOfflineOn} />}
      {popup === "rateLimit" && <RateLimited onSave={setGroqKey} onClose={closePopup} />}
      {popup === "history" && session && (
        <Modal title="Conversation" onClose={closePopup}>
          {session.messages.length === 0 ? (
            <p className="text-sm text-zinc-300">Nothing yet. Start explaining!</p>
          ) : (
            <div className="space-y-2">
              {session.messages.map((m, i) => (
                <div key={i} className={`max-w-[85%] rounded-3xl px-4 py-2 text-sm leading-relaxed ${
                  m.role === "user" ? "ml-auto bg-white/10" : "bg-black/40 text-zinc-100"}`}>
                  {m.content}
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}
      {popup === "cards" && session?.flashcards && (
        <Modal title={`Flashcards · ${session.concept}`} onClose={closePopup}>
          <Flashcards cards={session.flashcards} color={getPersona(session.persona).color} />
        </Modal>
      )}
    </>
  );
}

// Typed text + spoken text, with one space between them.
const joinText = (typed: string, spoken: string) => [typed, spoken.trim()].filter(Boolean).join(" ");

// Can the server reach Ollama with Gemma 3 1B downloaded? (see /api/ollama-status)
async function ollamaReady(): Promise<boolean> {
  try {
    const data = await (await fetch("/api/ollama-status")).json();
    return Boolean(data.available && data.hasModel);
  } catch {
    return false;
  }
}
