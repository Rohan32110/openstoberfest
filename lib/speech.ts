// Server-side speech-to-text. Speechmatics (batch API) first, ElevenLabs
// Scribe as the fallback. Keys never reach the browser from here.

const SPEECHMATICS_URL = "https://asr.api.speechmatics.com/v2";
const ELEVENLABS_URL = "https://api.elevenlabs.io/v1/speech-to-text";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Speechmatics batch flow: 1) upload audio as a job, 2) poll until the job is
// done, 3) download the transcript as plain text.
export async function transcribeWithSpeechmatics(audio: File, language: string, key: string): Promise<string> {
  const auth = { Authorization: `Bearer ${key}` };
  const form = new FormData();
  form.append("data_file", audio, audio.name);
  form.append("config", JSON.stringify({ type: "transcription", transcription_config: { language } }));

  const created = await fetch(`${SPEECHMATICS_URL}/jobs`, { method: "POST", headers: auth, body: form, signal: AbortSignal.timeout(15_000) });
  if (!created.ok) throw new Error(`Speechmatics create ${created.status}: ${(await created.text()).slice(0, 200)}`);
  const { id } = await created.json();

  // Short clips usually finish in about a second, so poll quickly but give up after 20s.
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    await sleep(700);
    const res = await fetch(`${SPEECHMATICS_URL}/jobs/${id}`, { headers: auth, signal: AbortSignal.timeout(5_000) });
    const status = (await res.json())?.job?.status;
    if (status === "done") {
      const transcript = await fetch(`${SPEECHMATICS_URL}/jobs/${id}/transcript?format=txt`, { headers: auth, signal: AbortSignal.timeout(5_000) });
      if (!transcript.ok) throw new Error(`Speechmatics transcript ${transcript.status}`);
      return (await transcript.text()).trim();
    }
    if (status === "rejected" || status === "deleted") throw new Error(`Speechmatics job ${status}`);
  }
  throw new Error("Speechmatics timed out");
}

// ElevenLabs is a single request: upload audio, get { text } back.
export async function transcribeWithElevenLabs(audio: File, language: string, key: string): Promise<string> {
  const form = new FormData();
  form.append("file", audio, audio.name);
  form.append("model_id", "scribe_v2");
  form.append("language_code", language);

  const res = await fetch(ELEVENLABS_URL, { method: "POST", headers: { "xi-api-key": key }, body: form, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return String((await res.json()).text ?? "").trim();
}
