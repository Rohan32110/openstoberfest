// GET /api/ollama-status - can this server reach a local Ollama?
// True only when Rewise runs on the same computer as Ollama; on Vercel it is
// always false, which is how the UI knows to show the offline setup guide.

import { connection } from "next/server";

export async function GET() {
  await connection(); // check at request time, never at build time
  const base = process.env.OLLAMA_BASE_URL || "http://localhost:11434/v1";
  try {
    const res = await fetch(`${base}/models`, { signal: AbortSignal.timeout(1500), cache: "no-store" });
    const data = res.ok ? await res.json() : null;
    // Ollama is running; also report whether the model Rewise uses is downloaded.
    const hasModel = Array.isArray(data?.data) && data.data.some((m: { id?: string }) => m.id?.startsWith("gemma3:1b"));
    return Response.json({ available: res.ok, hasModel });
  } catch {
    return Response.json({ available: false, hasModel: false });
  }
}
