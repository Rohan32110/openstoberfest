# Rewise

**Learn by explaining.** Rewise is a study buddy that acts confused on purpose. You teach it a topic in your own words, it asks the questions that expose what you missed, and at the end it turns your explanation into flashcards that correct anything you got wrong.

Built solo at **Hacktoberfest Hack Day Chittagong** (IIUC, 24 October 2026).

**Live demo:** https://openstoberfest.vercel.app
**Licence:** MIT

![Rewise chat: the AI catches a mistake in the student's explanation](docs/screenshots/chat.png)

---

## Overview

Students often re-read notes until they *feel* ready, then go blank in the exam. Re-reading creates a feeling of understanding without the real thing. The proven fix is the **Feynman technique**: explain the idea simply, in your own words, to someone who doesn't know it. The gaps show up immediately. The problem is that you need a patient listener, and friends get tired of hearing about binary search at midnight.

Rewise is that listener. Pick a topic (type anything, or pick one straight from your **IIUC course syllabus**), choose who you're teaching, and explain by typing or speaking. An open-weight AI plays a genuinely confused learner. It replies in 1–3 sentences, asks one follow-up question about your weakest point, and never lectures or gives the answer away. An understanding bar shows how well it "gets it", your chosen points tick off as you cover them, and at 80% it finally understands. Then you get **flashcards built from your own words**, with mistakes clearly corrected.

## The problem

- **Who has it:** university students preparing for midterms and finals, especially in concept-heavy courses (Data Structures, Digital Logic, Chemistry and so on).
- **How they deal with it today:** re-reading slides, highlighting, or watching videos. These are passive methods that feel productive but don't reveal gaps. Explaining to a friend works, but a friend isn't always available, patient, or willing to push back.

## The solution

Rewise makes the Feynman technique available any time:

1. **Choose a topic.** Type any topic, or use the built-in **syllabus picker** (CSE, EEE, ELL, CE → semester → course → topic).
2. **Choose a listener:** **Kiddo** (a curious 10-year-old who needs simple words), **Senior** (a sharp senior from your department who skips the basics) or **The Prof.** (a skeptical professor who wants mechanisms, not analogies).
3. **Explain** by typing or speaking. Voice is transcribed live.
4. **Get questioned.** The AI asks about the gap in your explanation and scores its understanding.
5. **Finish with flashcards** made from what you said, with errors corrected.

---

## Features

### Pick any topic, or one from your syllabus
Add optional **points to cover**, and Rewise tracks each one. The syllabus picker loads real course data for CSE, EEE, ELL and CE.

![Setup screen with syllabus picker and persona orbs](docs/screenshots/setup.png)

### A confused learner that finds your gaps
In this real session, the student said binary search "works on any list". The AI immediately asked whether the list has to be sorted. The points checklist ticks off what has been explained correctly, and the understanding bar moves accordingly.

![Chat: the AI asks a follow-up question](docs/screenshots/chat.png)

### "Finally gets it" at 80%
Explain the core mechanism clearly and the bar fills, every point is ticked, and the listener says it understands.

![Understanding reached 85%](docs/screenshots/understood.png)

### Flashcards that fix your mistakes
Cards are generated from your own explanation. Anything you got wrong is corrected on the card and the mistake is spelled out.

![Flashcard with a correction](docs/screenshots/flashcards.png)

### Speak instead of typing
Tap the mic and your words appear **live** while you talk (Speechmatics realtime), in English or Bangla. Recording stops automatically after 5 seconds of silence. If live mode is unavailable, the clip is transcribed when you stop, using Speechmatics batch with ElevenLabs Scribe as a fallback.

### Works offline with a local model
Run Rewise on your own computer with **Ollama**, switch **Offline** on, and replies come from **Gemma 3 1B** running locally. No internet is needed for the AI. Clicking Offline always opens an animated setup guide that checks whether Ollama is ready.

![Offline setup guide](docs/screenshots/offline-guide.png)

![A real reply from Gemma 3 1B running locally](docs/screenshots/offline-chat.png)

### Built to be easy to use
- First-visit **onboarding** (three animated cards)
- **Light, dark and system themes**
- **Mobile-friendly**, keyboard-accessible, readable contrast
- **Settings** to add your own API keys if the shared free ones are busy, with a friendly **rate-limit popup** that links to the Groq key page
- **Conversation history**, a model badge ("answered by …"), and a typing timer

| Welcome | Onboarding |
|---|---|
| ![Welcome](docs/screenshots/welcome.png) | ![Onboarding](docs/screenshots/onboarding.png) |

| Light theme | Settings | Mobile |
|---|---|---|
| ![Light theme](docs/screenshots/light-theme.png) | ![Settings](docs/screenshots/settings-light.png) | ![Mobile](docs/screenshots/mobile-chat.png) |

---

## How it works

```
Browser (Next.js client)                      Next.js API routes (server)
─────────────────────────                     ───────────────────────────
Setup → Chat → Flashcards   ── /api/chat ──▶  shared LLM client ──▶ Groq: gpt-oss-120b
  localStorage only                            (key rotation,          → gpt-oss-20b
  (name, chats, keys)                           per-key rate limits,   → qwen3.8-27b
                                                deadlines, fallback)   or Ollama: gemma3:1b (offline)
Mic (live)  ── /api/speech-token ──▶ 60-second Speechmatics key, then the browser streams audio over a WebSocket
Mic (fallback) ── /api/transcribe ──▶ Speechmatics batch → ElevenLabs Scribe
Syllabus picker ── /api/framedit/* ──▶ Framedit export API (validated, cached 12h)
```

- **One shared AI client** ([`lib/ai/llm-client.ts`](lib/ai/llm-client.ts)) is used by every AI feature. It rotates API keys by load, tracks rate limits per key and model, falls back through model tiers, and enforces timeouts. Calls are non-streaming, so a failure halfway through is invisible: the request is replayed on the next key or model while the UI keeps showing "Thinking…". Users see a friendly message, never a raw error.
- **Strict JSON from the model.** Each reply returns `{ reply, understanding, confusion, covered }`, which the server validates before the UI updates. If the JSON is broken, the reply is still shown and the old scores are kept.
- **No database.** Your name, conversations and any keys you add stay in your browser's localStorage. Keys are sent to the server only to make the call, and are never stored.

---

## Models and AI

### Open-weight models used in the product (the core of the app)

| Model | Where it runs | What it does |
|---|---|---|
| **gpt-oss-120b** (OpenAI, open-weight) | Groq hosted inference | Main model: plays the learner, scores understanding, tracks points, writes flashcards |
| **gpt-oss-20b** (OpenAI, open-weight) | Groq hosted inference | Automatic fallback if 120b is rate-limited or fails |
| **Qwen3.8-27B** (open-weight) | Groq hosted inference | Final fallback, from a different model family |
| **Gemma 3 1B** (Google, open-weight) | **Locally via Ollama** | Offline mode: the same learner and flashcard features with no internet |

All AI reasoning in Rewise runs on open-weight models.

### Proprietary models used in the product

| Service | What it does |
|---|---|
| **Speechmatics** (realtime and batch speech-to-text) | Voice input only: turns speech into text in the input box |
| **ElevenLabs Scribe v2** | Voice input fallback if Speechmatics fails |

These only transcribe speech. They never generate replies, scores or flashcards. Voice input is optional, and typing works without it.

### AI coding assistants used during development
- **Claude Code** (models: Claude Sonnet 5.5 and Claude Opus 5.5) was used to write most of the code.
- **My own work:** I came up with the idea, the scope and the product and design decisions. I wrote the specifications for each feature, set the fallback strategy and requirements, reviewed and tested every change in the browser, set up GitHub, Vercel and the environment, connected the Framedit API, and made every commit.

---

## Tech stack

- **Framework:** Next.js 16 (App Router), React 19, TypeScript
- **Styling:** Tailwind CSS 4, lucide-react icons, Geist font
- **AI:** Groq (OpenAI-compatible API) for gpt-oss and Qwen; Ollama for local Gemma 3 1B
- **Speech:** Speechmatics realtime and batch, ElevenLabs Scribe
- **Data:** Framedit export API (syllabus topics); browser localStorage
- **Hosting:** Vercel

## Templates and starter kits

- Started from the official **`create-next-app`** template (TypeScript, Tailwind, App Router). The first commit is the unmodified template.
- No other templates, starter kits or UI kits were used.

## Datasets

- Syllabus topics come from the **Framedit** export API (https://www.framedit.tech), a student-resource site for IIUC that I built separately. Rewise only reads public course and syllabus data (no personal data), and the picker is optional: Rewise works fully without it.

---

## How to run it

### Requirements
- Node.js 20+ (built with Node 22)
- A free Groq API key: https://console.groq.com/keys
- Optional: Speechmatics or ElevenLabs keys (voice), Framedit export key (syllabus), Ollama (offline)

### Steps
```bash
git clone https://github.com/Rohan32110/openstoberfest
cd openstoberfest
npm install
cp .env.example .env.local   # on Windows PowerShell: copy .env.example .env.local
```

Fill in `.env.local`:

```env
LLM_BASE_URL=https://api.groq.com/openai/v1
LLM_KEY_1=your_groq_key
LLM_KEY_2=                       # optional second key
OLLAMA_BASE_URL=http://localhost:11434/v1
SPEECHMATICS_API_KEY=            # optional, for voice
ELEVENLABS_API_KEY=              # optional, voice fallback
FRAMEDIT_API_URL=https://www.framedit.tech   # optional, syllabus picker
FRAMEDIT_EXPORT_KEY=             # optional
```

Then run:

```bash
npm run dev
```

Open http://localhost:3000.

### Offline mode
1. Install Ollama: https://ollama.com/download
2. Run `ollama pull gemma3:1b` (about 800 MB, one time)
3. Run Rewise locally (steps above)
4. Click **Offline** in the top bar. The guide confirms that Ollama was found and switches it on.

Offline mode only works when Rewise runs on your own computer: a deployed server can't reach your laptop's Ollama. Voice input and the syllabus picker still need internet.

### Deploying (Vercel)
Import the repo, add the same environment variables (except `OLLAMA_BASE_URL`), and deploy. Environment variables apply only to new deployments, so redeploy after changing them.

---

## What's not done yet

- **Bangla voice** is supported by the API but was only lightly tested; English is tested end to end.
- **Rate-limit tracking** is in memory per server instance (by design, no database), so it resets when the server restarts.
- **No accounts or sync:** history lives in one browser. Clearing site data deletes it.
- **Offline mode** uses a small 1B model, so its questions are simpler and sometimes a bit off compared with gpt-oss-120b.
- The syllabus picker covers **CSE, EEE, ELL and CE** only, and shows only what has been uploaded to Framedit.

## Credits

- [Next.js](https://nextjs.org), [React](https://react.dev), [Tailwind CSS](https://tailwindcss.com), [lucide](https://lucide.dev), Geist font
- [Groq](https://groq.com) for hosted open-weight inference; [Ollama](https://ollama.com) for local models
- Open-weight models: OpenAI gpt-oss, Qwen, Google Gemma
- [Speechmatics](https://www.speechmatics.com) and [ElevenLabs](https://elevenlabs.io) for speech-to-text
- [Framedit](https://www.framedit.tech) for syllabus data
- The Feynman technique, the idea everything here is built on

## Licence

Released under the **MIT License**. See [LICENSE](LICENSE).
Copyright (c) 2026 Mohammed Saiful Alam Rohan
