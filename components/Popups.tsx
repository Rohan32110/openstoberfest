"use client";

// The app's three small popups, all built on the shared Modal:
// onboarding (first visit), settings (API keys), and "shared key is busy".

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, Monitor, Moon, Sun } from "lucide-react";
import Modal from "@/components/Modal";

const primary = "rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black transition hover:bg-zinc-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";
const ghost = "inline-block rounded-full border border-white/15 px-4 py-2 text-sm text-zinc-100 transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white";
const field = "w-full rounded-full border border-white/10 bg-black/40 px-4 py-2.5 text-sm placeholder:text-zinc-400 focus-visible:outline-2 focus-visible:outline-white/60";

const KEY_PAGES = {
  groq: "https://console.groq.com/keys",
  speechmatics: "https://portal.speechmatics.com/settings/api-keys",
  elevenlabs: "https://elevenlabs.io/app/settings/api-keys",
};

// ---------- Onboarding ----------
// Small animated pictures, one per step. Plain SVG + CSS (see .ob-* in
// globals.css); the animation only runs if the user allows motion.

// 1. A confused orb with question marks floating up out of it.
function ConfusedArt() {
  return (
    <svg viewBox="0 0 120 72" className="h-full w-full" aria-hidden>
      <defs>
        <radialGradient id="ob-orb" cx="40%" cy="35%">
          <stop offset="0%" stopColor="#FCD9A0" />
          <stop offset="60%" stopColor="#EF9F27" />
          <stop offset="100%" stopColor="#A86A12" />
        </radialGradient>
      </defs>
      <circle cx="60" cy="44" r="22" fill="url(#ob-orb)" className="ob-breathe" />
      <text x="84" y="26" className="ob-float" fontSize="14" fontWeight="700" fill="currentColor">?</text>
      <text x="30" y="30" className="ob-float ob-delay-1" fontSize="11" fontWeight="700" fill="currentColor">?</text>
      <text x="74" y="16" className="ob-float ob-delay-2" fontSize="9" fontWeight="700" fill="currentColor">?</text>
    </svg>
  );
}

// 2. You explain, it replies with "typing" dots, and the bar fills up.
function ChatArt() {
  return (
    <svg viewBox="0 0 120 72" className="h-full w-full" aria-hidden>
      <rect x="44" y="6" width="66" height="16" rx="8" fill="currentColor" opacity="0.18" />
      <rect x="10" y="28" width="48" height="16" rx="8" fill="currentColor" opacity="0.1" />
      <circle cx="24" cy="36" r="2.5" fill="currentColor" className="ob-dot" />
      <circle cx="34" cy="36" r="2.5" fill="currentColor" className="ob-dot ob-delay-1" />
      <circle cx="44" cy="36" r="2.5" fill="currentColor" className="ob-dot ob-delay-2" />
      <rect x="10" y="56" width="100" height="5" rx="2.5" fill="currentColor" opacity="0.15" />
      <rect x="10" y="56" width="100" height="5" rx="2.5" fill="#1D9E75" className="ob-fill" />
    </svg>
  );
}

// 3. A flashcard flipping from the question side ("?") to the answer side (tick).
function CardArt() {
  return (
    <svg viewBox="0 0 120 72" className="h-full w-full" aria-hidden>
      <g className="ob-flip">
        <rect x="34" y="8" width="52" height="56" rx="10" fill="#534AB7" fillOpacity="0.35" stroke="#8C84E0" strokeWidth="1.5" />
        <text x="60" y="45" textAnchor="middle" fontSize="24" fontWeight="700" fill="currentColor" className="ob-front">?</text>
        <path d="M48 37l8 8 16-17" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className="ob-back" />
      </g>
    </svg>
  );
}

const STEPS = [
  { title: "What Rewise is", text: "A study buddy that acts confused on purpose. You teach it, and it shows you what you missed.", Art: ConfusedArt },
  { title: "How it works", text: "Pick a topic and who you’re teaching. Type or speak. It asks questions, and the bar shows how well it gets it.", Art: ChatArt },
  { title: "Why it helps", text: "If you can’t explain it simply, you don’t know it yet. At the end, get flashcards for what you got wrong.", Art: CardArt },
];

export function Onboarding({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Welcome to Rewise" onClose={onClose} wide>
      <div className="grid gap-3 md:grid-cols-3">
        {STEPS.map(({ title, text, Art }, i) => (
          <div key={title} className="rounded-3xl border border-white/10 bg-white/3 p-5">
            <div className="mb-4 h-20 rounded-2xl bg-white/4 p-2 text-zinc-200">
              <Art />
            </div>
            <p className="text-sm font-semibold"><span className="mr-2 text-zinc-400">{i + 1}</span>{title}</p>
            <p className="mt-1 text-sm leading-relaxed text-zinc-300">{text}</p>
          </div>
        ))}
      </div>
      <div className="mt-5 flex justify-center">
        <button className={`${primary} w-full md:w-56`} onClick={onClose}>Got it</button>
      </div>
    </Modal>
  );
}

// ---------- Offline setup guide ----------
// Offline mode runs the AI on the user's own computer with Ollama. These four
// pictures + commands walk them through it; "Check again" asks the server
// whether it can now reach Ollama.

const REPO_URL = "https://github.com/Rohan32110/openstoberfest";

// 1. A download arrow dropping into a tray.
function InstallArt() {
  return (
    <svg viewBox="0 0 120 72" className="h-full w-full" aria-hidden>
      <g className="ob-drop">
        <path d="M60 10v26" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
        <path d="M49 27l11 11 11-11" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <path d="M38 46v10h44V46" fill="none" stroke="#EF9F27" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// 2. A terminal downloading the model, with a blinking cursor and progress bar.
function PullArt() {
  return (
    <svg viewBox="0 0 120 72" className="h-full w-full" aria-hidden>
      <rect x="10" y="6" width="100" height="60" rx="8" fill="currentColor" fillOpacity="0.08" stroke="currentColor" strokeOpacity="0.25" />
      <text x="18" y="26" fontSize="9" fontFamily="monospace" fill="currentColor">$ ollama pull</text>
      <rect x="84" y="19" width="5" height="9" fill="currentColor" className="ob-blink" />
      <rect x="18" y="44" width="84" height="5" rx="2.5" fill="currentColor" opacity="0.15" />
      <rect x="18" y="44" width="84" height="5" rx="2.5" fill="#1D9E75" className="ob-fill" />
    </svg>
  );
}

// 3. A laptop running Rewise locally (the "localhost" dot pulses).
function LocalArt() {
  return (
    <svg viewBox="0 0 120 72" className="h-full w-full" aria-hidden>
      <rect x="26" y="8" width="68" height="44" rx="5" fill="currentColor" fillOpacity="0.08" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" />
      <path d="M16 58h88" stroke="currentColor" strokeOpacity="0.35" strokeWidth="4" strokeLinecap="round" />
      <circle cx="60" cy="30" r="9" fill="#534AB7" className="ob-breathe" />
      <text x="60" y="47" textAnchor="middle" fontSize="7" fontFamily="monospace" fill="currentColor">localhost</text>
    </svg>
  );
}

// 4. The Offline switch sliding on.
function ToggleArt() {
  return (
    <svg viewBox="0 0 120 72" className="h-full w-full" aria-hidden>
      <rect x="30" y="22" width="60" height="28" rx="14" fill="#1D9E75" className="ob-track" />
      <circle cx="44" cy="36" r="10" fill="#ffffff" className="ob-knob" />
    </svg>
  );
}

const OFFLINE_STEPS = [
  { title: "Install Ollama", text: "Free app that runs AI models on your computer.", code: "ollama.com/download", Art: InstallArt },
  { title: "Get the model", text: "Downloads Gemma 3 1B (about 800 MB), once.", code: "ollama pull gemma3:1b", Art: PullArt },
  { title: "Run Rewise locally", text: "Clone the repo, then start it and open localhost:3000.", code: "npm install && npm run dev", Art: LocalArt },
  { title: "Turn Offline on", text: "Replies now come from your own computer. No internet needed for the AI.", code: "Offline: on", Art: ToggleArt },
];

export function OfflineGuide({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = useState<"idle" | "checking" | "ready" | "noModel" | "missing">("idle");

  async function check() {
    setStatus("checking");
    try {
      const data = await (await fetch("/api/ollama-status")).json();
      setStatus(data.available ? (data.hasModel ? "ready" : "noModel") : "missing");
    } catch {
      setStatus("missing");
    }
  }

  const message = {
    idle: "",
    checking: "Checking…",
    ready: "Ollama and Gemma 3 1B found. Offline mode is ready.",
    noModel: "Ollama is running, but the model is missing. Run step 2.",
    missing: "Ollama isn't reachable from here. Offline only works when Rewise runs on your own computer (step 3).",
  }[status];

  return (
    <Modal title="Use Rewise offline" onClose={onClose} wide>
      <p className="mb-4 text-sm text-zinc-300">
        Offline mode runs the AI on your own computer, so it works without internet. It needs a one-time setup:
      </p>
      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {OFFLINE_STEPS.map(({ title, text, code, Art }, i) => (
          <li key={title} className="flex flex-col rounded-3xl border border-white/10 bg-white/3 p-4">
            <div className="mb-3 h-20 rounded-2xl bg-white/4 p-2 text-zinc-200"><Art /></div>
            <p className="text-sm font-semibold"><span className="mr-2 text-zinc-400">{i + 1}</span>{title}</p>
            <p className="mt-1 flex-1 text-sm leading-relaxed text-zinc-300">{text}</p>
            <code className="mt-3 block select-all break-all rounded-xl bg-black/40 px-3 py-2 font-mono text-xs text-zinc-100">{code}</code>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-xs text-zinc-300">
        Step 3 in full: <code className="select-all font-mono text-zinc-100">git clone {REPO_URL}</code>, open the folder, then run the command.
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p role="status" className={`text-sm ${status === "ready" ? "text-[var(--success)]" : "text-zinc-300"}`}>{message}</p>
        <div className="flex gap-2">
          <button className={ghost} onClick={check} disabled={status === "checking"}>Check again</button>
          <button className={primary} onClick={onClose}>Got it</button>
        </div>
      </div>
    </Modal>
  );
}

// ---------- Settings ----------
type Keys = { groq: string; speechmatics: string; elevenlabs: string };
export type Theme = "system" | "light" | "dark";

const THEMES = [
  { id: "system", label: "System", Icon: Monitor },
  { id: "light", label: "Light", Icon: Sun },
  { id: "dark", label: "Dark", Icon: Moon },
] as const;

type SettingsProps = { keys: Keys; theme: Theme; onTheme: (t: Theme) => void; onSave: (keys: Keys) => void; onClose: () => void };

export function Settings({ keys, theme, onTheme, onSave, onClose }: SettingsProps) {
  const [draft, setDraft] = useState(keys);
  const rows: { id: keyof Keys; label: string; placeholder: string; cta: string }[] = [
    { id: "groq", label: "Groq API key", placeholder: "gsk_…", cta: "Get your Groq API key" },
    { id: "speechmatics", label: "Speechmatics API key", placeholder: "For voice input", cta: "Get your Speechmatics API key" },
    { id: "elevenlabs", label: "ElevenLabs API key", placeholder: "Voice input backup", cta: "Get your ElevenLabs API key" },
  ];

  return (
    <Modal title="Settings" onClose={onClose}>
      {/* Appearance applies instantly; keys below apply on Save. */}
      <p className="mb-2 text-sm font-medium">Appearance</p>
      <div className="mb-6 grid grid-cols-3 gap-1 rounded-full border border-white/10 p-1" role="radiogroup" aria-label="Theme">
        {THEMES.map(({ id, label, Icon }) => (
          <button key={id} type="button" role="radio" aria-checked={theme === id} onClick={() => onTheme(id)}
            className={`flex items-center justify-center gap-1.5 rounded-full py-2 text-sm transition focus-visible:outline-2 focus-visible:outline-white ${
              theme === id ? "bg-white text-black" : "text-zinc-300 hover:bg-white/10"}`}>
            <Icon className="size-4" aria-hidden />{label}
          </button>
        ))}
      </div>
      <p className="mb-4 text-sm text-zinc-300">API keys are optional. Add your own if the shared ones are busy.</p>
      <div className="space-y-4">
        {rows.map((r) => (
          <div key={r.id}>
            <label htmlFor={`key-${r.id}`} className="mb-1.5 block text-sm font-medium">{r.label}</label>
            <input id={`key-${r.id}`} type="password" autoComplete="off" className={field} placeholder={r.placeholder}
              value={draft[r.id]} onChange={(e) => setDraft({ ...draft, [r.id]: e.target.value.trim() })} />
            <a href={KEY_PAGES[r.id]} target="_blank" rel="noopener noreferrer" className={`${ghost} mt-2 inline-flex items-center gap-1.5 !py-1.5 text-xs`}>{r.cta}<ExternalLink className="size-3.5" aria-hidden /></a>
          </div>
        ))}
      </div>
      <p className="mt-5 rounded-2xl bg-white/5 px-4 py-3 text-xs leading-relaxed text-zinc-300">
        Keys are saved in this browser&apos;s localStorage and are sent to our server only to make the API call on your
        behalf — they are never stored on the server.
      </p>
      <div className="mt-4 flex items-center justify-between gap-2">
        <div className="flex gap-3 text-xs text-zinc-300">
          <Link href="/privacy" className="underline underline-offset-2 hover:text-white">Privacy</Link>
          <Link href="/terms" className="underline underline-offset-2 hover:text-white">Terms</Link>
        </div>
        <button className={primary} onClick={() => { onSave(draft); onClose(); }}>Save</button>
      </div>
    </Modal>
  );
}

// ---------- Shared key rate-limited ----------
export function RateLimited({ onSave, onClose }: { onSave: (groqKey: string) => void; onClose: () => void }) {
  const [key, setKey] = useState("");
  return (
    <Modal title="The shared AI key is busy" onClose={onClose}>
      <p className="text-sm leading-relaxed text-zinc-300">
        Lots of people are using Rewise right now, so the free shared key hit its limit. Wait a minute and try again, or
        add your own free Groq key to keep going straight away.
      </p>
      <label htmlFor="rl-key" className="mb-1.5 mt-4 block text-sm font-medium">Your Groq API key</label>
      <input id="rl-key" type="password" autoComplete="off" className={field} placeholder="gsk_…" value={key}
        onChange={(e) => setKey(e.target.value.trim())} />
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <a href={KEY_PAGES.groq} target="_blank" rel="noopener noreferrer" className={`${ghost} inline-flex items-center gap-1.5`}>Get your Groq API key<ExternalLink className="size-3.5" aria-hidden /></a>
        <span className="flex-1" />
        <button className={ghost} onClick={onClose}>Skip</button>
        <button className={primary} disabled={!key} onClick={() => { onSave(key); onClose(); }}>Use my key</button>
      </div>
    </Modal>
  );
}
