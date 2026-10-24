// GET /api/speech-status - tells the UI whether the server has a speech key,
// so the mic button can be hidden when voice input can't work.
// Returns only true/false, never the keys themselves.

import { connection } from "next/server";

export async function GET() {
  await connection(); // read env at request time, not baked in at build time
  return Response.json({ available: Boolean(process.env.SPEECHMATICS_API_KEY || process.env.ELEVENLABS_API_KEY) });
}
