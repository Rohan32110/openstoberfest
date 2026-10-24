// Plain-language terms of use.

import Link from "next/link";

export const metadata = { title: "Terms · Rewise" };

export default function Terms() {
  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-12 leading-relaxed text-zinc-200">
      <Link href="/" className="text-sm text-zinc-300 underline underline-offset-2 hover:text-white">← Back to Rewise</Link>
      <h1 className="mt-6 text-3xl font-semibold text-white">Terms</h1>
      <ul className="mt-6 list-disc space-y-3 pl-5">
        <li>Rewise is provided as-is, with no warranty of any kind.</li>
        <li>AI replies and flashcards can be wrong. Check important facts against your course material.</li>
        <li>Please don&apos;t abuse the shared API key. It is free and shared by everyone.</li>
        <li>You are responsible for your own API keys and any costs they incur.</li>
        <li>Rewise is open source under the MIT License.</li>
      </ul>
    </main>
  );
}
