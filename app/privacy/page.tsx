// Plain-language privacy page. Honest about where data actually goes.

import Link from "next/link";

export const metadata = { title: "Privacy · Rewise" };

export default function Privacy() {
  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-12 leading-relaxed text-zinc-200">
      <Link href="/" className="text-sm text-zinc-300 underline underline-offset-2 hover:text-white">← Back to Rewise</Link>
      <h1 className="mt-6 text-3xl font-semibold text-white">Privacy</h1>
      <ul className="mt-6 list-disc space-y-3 pl-5">
        <li>Your conversations, your name and any API keys you add are stored in your browser&apos;s localStorage only.</li>
        <li>We do not run a database and do not store your data on a server.</li>
        <li>When you send a message, the text is sent to Groq (or to your local Ollama in offline mode) to generate a reply. If you add your own API key, it is sent to our server only to make that call.</li>
        <li>Speech audio is sent to Speechmatics or ElevenLabs for transcription when you use the mic.</li>
        <li>Syllabus topics are loaded from Framedit when you use the course picker. Only the department, semester and course you choose are sent.</li>
        <li>To delete everything, clear this site&apos;s data in your browser settings.</li>
      </ul>
    </main>
  );
}
