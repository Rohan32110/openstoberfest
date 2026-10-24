// POST /api/transcribe - turns a voice recording into text.
// The browser sends the audio here (never straight to a provider) so our keys
// stay on the server. A user's own key, if they set one, arrives as a header.

import { transcribeWithElevenLabs, transcribeWithSpeechmatics } from "@/lib/speech";

export const maxDuration = 30; // Speechmatics polling can take a few seconds

const MAX_BYTES = 4 * 1024 * 1024; // Vercel rejects request bodies above ~4.5 MB

export async function POST(request: Request) {
  let audio: FormDataEntryValue | null;
  let language = "en";
  try {
    const form = await request.formData();
    audio = form.get("audio");
    if (form.get("language") === "bn") language = "bn";
  } catch {
    return Response.json({ error: "Invalid recording." }, { status: 400 });
  }
  if (!(audio instanceof File) || audio.size === 0) return Response.json({ error: "The recording was empty." }, { status: 400 });
  if (audio.size > MAX_BYTES) return Response.json({ error: "That recording is too long. Try a shorter one." }, { status: 413 });

  const speechmaticsKey = request.headers.get("x-speechmatics-key") || process.env.SPEECHMATICS_API_KEY;
  const elevenLabsKey = request.headers.get("x-elevenlabs-key") || process.env.ELEVENLABS_API_KEY;
  if (!speechmaticsKey && !elevenLabsKey) return Response.json({ error: "Voice input isn't set up." }, { status: 503 });

  // Try Speechmatics first; if it fails for any reason, fall back to ElevenLabs.
  if (speechmaticsKey) {
    try {
      return Response.json({ text: await transcribeWithSpeechmatics(audio, language, speechmaticsKey) });
    } catch (err) {
      console.error("[transcribe] speechmatics failed:", (err as Error).message);
    }
  }
  if (elevenLabsKey) {
    try {
      return Response.json({ text: await transcribeWithElevenLabs(audio, language, elevenLabsKey) });
    } catch (err) {
      console.error("[transcribe] elevenlabs failed:", (err as Error).message);
    }
  }
  return Response.json({ error: "Couldn't transcribe that. Try again, or type instead." }, { status: 502 });
}
