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
const STEPS = [
  { title: "What Rewise is", text: "A study partner that is confused on purpose. You teach it a topic, and it tells you where your explanation falls apart." },
  { title: "How it works", text: "Pick a topic and who you're explaining to. Type or speak your explanation. They ask follow-up questions, and the bar shows how well they understand." },
  { title: "Why it helps", text: "The Feynman technique: if you can't explain it simply, you don't really know it yet. At the end, get flashcards that fix anything you got wrong." },
];

export function Onboarding({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Welcome to Rewise" onClose={onClose}>
      <div className="space-y-2.5">
        {STEPS.map((s, i) => (
          <div key={s.title} className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-sm font-semibold"><span className="mr-2 text-zinc-400">{i + 1}</span>{s.title}</p>
            <p className="mt-1 text-sm leading-relaxed text-zinc-300">{s.text}</p>
          </div>
        ))}
      </div>
      <button className={`${primary} mt-4 w-full`} onClick={onClose}>Got it</button>
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
