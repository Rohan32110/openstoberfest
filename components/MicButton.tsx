"use client";

// Mic button: tap to talk, tap again to stop.
// Live mode (preferred): audio streams to Speechmatics' realtime API and words
// appear in the input box while you speak (onLive). Uses a 60s temporary key
// from /api/speech-token, so our real key never reaches the browser.
// Fallback: if live mode can't start, record the clip and send it to
// /api/transcribe (Speechmatics batch, then ElevenLabs) when you stop.

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Mic, Square } from "lucide-react";

export type MicState = "idle" | "recording" | "transcribing";

type Props = {
  language: "en" | "bn";
  keyHeaders: Record<string, string>; // the user's own speech keys, if any
  disabled: boolean;
  onStart: () => void;
  onLive: (text: string) => void; // transcript so far, updated while speaking
  onText: (text: string) => void; // final transcript
  onError: (message: string) => void;
  onStateChange: (state: MicState) => void;
};

const MAX_SECONDS = 90;
const REALTIME_URL = "wss://eu2.rt.speechmatics.com/v2";

export default function MicButton({ language, keyHeaders, disabled, onStart, onLive, onText, onError, onStateChange }: Props) {
  const [state, setState] = useState<MicState>("idle");
  const stopRef = useRef<() => void>(() => {});
  const cleanupRef = useRef<() => void>(() => {});

  function update(next: MicState) {
    setState(next);
    onStateChange(next);
  }

  // If the component goes away mid-recording, release the microphone.
  useEffect(() => () => cleanupRef.current(), []);

  async function start() {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const denied = err instanceof DOMException && err.name === "NotAllowedError";
      onError(denied
        ? "Microphone access is blocked. Allow it in your browser's site settings, or type instead."
        : "No microphone found. You can type your explanation instead.");
      return;
    }
    onStart();
    update("recording");
    const autoStop = setTimeout(() => stopRef.current(), MAX_SECONDS * 1000);
    const releaseMic = () => {
      clearTimeout(autoStop);
      stream.getTracks().forEach((t) => t.stop());
    };
    cleanupRef.current = releaseMic;

    const live = await startLive(stream, releaseMic);
    if (!live) startBatch(stream, releaseMic);
  }

  // ---------- Live: stream raw audio to Speechmatics realtime ----------
  async function startLive(stream: MediaStream, releaseMic: () => void): Promise<boolean> {
    let token: string;
    try {
      const res = await fetch("/api/speech-token", { method: "POST", headers: keyHeaders });
      if (!res.ok) return false;
      token = (await res.json()).token;
    } catch {
      return false;
    }

    return new Promise<boolean>((resolve) => {
      const audio = new AudioContext();
      const source = audio.createMediaStreamSource(stream);
      // ScriptProcessor hands us raw samples in small chunks; simple and
      // supported everywhere, which matters more here than the newer API.
      const processor = audio.createScriptProcessor(4096, 1, 1);
      const ws = new WebSocket(`${REALTIME_URL}?jwt=${encodeURIComponent(token)}`);
      let finalText = "";
      let started = false;
      let finished = false;
      let chunks = 0;
      let audioStopped = false;

      const stopAudio = () => {
        if (audioStopped) return;
        audioStopped = true;
        processor.disconnect();
        source.disconnect();
        audio.close();
        releaseMic();
      };
      const finish = () => {
        if (finished) return;
        finished = true;
        stopAudio(); // also covers the connection dropping mid-recording
        ws.close();
        onText(finalText.trim());
        update("idle");
      };

      ws.onopen = () => ws.send(JSON.stringify({
        message: "StartRecognition",
        audio_format: { type: "raw", encoding: "pcm_f32le", sample_rate: audio.sampleRate },
        transcription_config: { language, enable_partials: true, max_delay: 1 },
      }));

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.message === "RecognitionStarted") {
          started = true;
          resolve(true);
        } else if (msg.message === "AddPartialTranscript") {
          onLive(finalText + msg.metadata.transcript); // best guess so far, may still change
        } else if (msg.message === "AddTranscript") {
          finalText += msg.metadata.transcript; // confirmed words
          onLive(finalText);
        } else if (msg.message === "EndOfTranscript") {
          finish();
        } else if (msg.message === "Error") {
          console.error("[mic] realtime error:", msg.type);
        }
      };

      ws.onerror = () => {
        if (!started) {
          // Couldn't even start: hand the mic over to the batch fallback.
          processor.disconnect();
          source.disconnect();
          audio.close();
          resolve(false);
        }
      };
      ws.onclose = () => {
        if (started) finish();
      };

      processor.onaudioprocess = (e) => {
        if (started && ws.readyState === WebSocket.OPEN) {
          ws.send(new Float32Array(e.inputBuffer.getChannelData(0)).buffer);
          chunks++;
        }
      };
      source.connect(processor);
      processor.connect(audio.destination); // required for the processor to run; it outputs silence

      stopRef.current = () => {
        stopAudio();
        update("transcribing");
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ message: "EndOfStream", last_seq_no: chunks }));
        setTimeout(finish, 5000); // never hang if the final message doesn't arrive
      };
    });
  }

  // ---------- Fallback: record a clip, transcribe it when stopped ----------
  function startBatch(stream: MediaStream, releaseMic: () => void) {
    // Chrome/Firefox record webm, Safari records mp4. Use whatever is supported.
    const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t));
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
    rec.onstop = () => {
      releaseMic();
      transcribe(new Blob(chunks, { type: rec.mimeType }));
    };
    rec.start();
    stopRef.current = () => rec.state === "recording" && rec.stop();
  }

  async function transcribe(blob: Blob) {
    update("transcribing");
    try {
      const form = new FormData();
      form.append("audio", blob, blob.type.includes("mp4") ? "speech.mp4" : "speech.webm");
      form.append("language", language);
      const res = await fetch("/api/transcribe", { method: "POST", body: form, headers: keyHeaders });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.text) onText(data.text);
      else onError("We didn't catch any speech. Try again a little closer to the mic.");
    } catch (err) {
      onError(err instanceof Error && err.message ? err.message : "Couldn't transcribe that. Try again, or type instead.");
    } finally {
      update("idle");
    }
  }

  const label = state === "recording" ? "Stop recording" : state === "transcribing" ? "Finishing…" : "Speak your explanation";

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled || state === "transcribing"}
      onClick={() => (state === "recording" ? stopRef.current() : start())}
      className={`relative grid size-10 shrink-0 place-items-center rounded-full transition focus-visible:outline-2 focus-visible:outline-white disabled:opacity-40 ${
        state === "recording" ? "bg-red-500 text-[#fff]" : "text-zinc-300 hover:bg-white/10"}`}
    >
      {state === "recording" && <span className="absolute inset-0 rounded-full bg-red-500/60 motion-safe:animate-ping" />}
      {state === "transcribing" ? (
        <LoaderCircle className="size-5 motion-safe:animate-spin" aria-hidden />
      ) : state === "recording" ? (
        <Square className="relative size-3.5 fill-current" aria-hidden />
      ) : (
        <Mic className="size-5" aria-hidden />
      )}
    </button>
  );
}
