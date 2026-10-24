// POST /api/chat - one round of the Feynman conversation.
// Builds the prompt, asks the shared LLM client, and returns a validated
// { reply, understanding, confusion, model } to the browser.

import { chatComplete, LLMBusyError, type ChatMessage } from "@/lib/ai/llm-client";
import { getPersona } from "@/lib/personas";

type Body = {
  concept?: string;
  points?: string;
  persona?: string;
  understanding?: number;
  messages?: { role: string; content: string }[];
  offline?: boolean;
  userKey?: string;
};

function systemPrompt(concept: string, points: string, personaId: string, understanding: number): string {
  const persona = getPersona(personaId);
  return `You are ${persona.character}

A student is learning "${concept}" with the Feynman technique: they explain it to you in their own words. You do NOT already know this topic. You only understand what the student has actually explained so far.
${points ? `\nPoints the student wants to cover:\n${points}\nIf some of these have not been explained yet, steer your questions towards them.\n` : ""}
How to reply:
- 1 to 3 short sentences, like a real person talking. No lists, no markdown, no lectures.
- Ask ONE follow-up question about the biggest gap, vague word or unexplained jargon.
- Never explain the topic yourself and never give away the answer.
- Stay in character.

Scoring:
- "understanding" (0-100) is how well the student has explained the topic across the whole conversation. It was ${understanding} before this message.
- Raise it a lot when they clearly explain the core mechanism, only a little for surface details or restating, and lower it if they contradict themselves or say something wrong.
- "confusion" (0-100) is how confused you personally feel right now.
- When understanding reaches 80 or more, tell them you finally get it and thank them warmly instead of asking another question.

Respond with ONLY this JSON object and nothing else:
{"reply": "...", "understanding": <number>, "confusion": <number>}`;
}

// Models sometimes wrap JSON in prose or code fences, so grab the first {...}.
// If that still fails, show the raw text and let the client keep old scores.
function parseReply(raw: string) {
  const clamp = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? Math.round(Math.min(100, Math.max(0, n))) : null);
  try {
    const json = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "");
    if (typeof json.reply === "string" && json.reply.trim()) {
      return { reply: json.reply.trim(), understanding: clamp(json.understanding), confusion: clamp(json.confusion) };
    }
  } catch {}
  return { reply: raw, understanding: null, confusion: null };
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const concept = String(body.concept ?? "").slice(0, 200).trim();
  const points = String(body.points ?? "").slice(0, 1000).trim();
  const history = Array.isArray(body.messages) ? body.messages : [];
  if (!concept || history.length === 0) {
    return Response.json({ error: "Tell us the concept and your explanation first." }, { status: 400 });
  }

  // Built ONCE; every fallback attempt sends exactly the same messages.
  // Only the last 8 turns, to keep requests small on a free-tier quota.
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt(concept, points, String(body.persona), Number(body.understanding) || 0) },
    ...history.slice(-8).map((m) => ({
      role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: String(m.content).slice(0, 4000),
    })),
  ];

  try {
    const { content, model } = await chatComplete(messages, {
      offline: Boolean(body.offline),
      userKey: typeof body.userKey === "string" ? body.userKey.trim() : undefined,
    });
    return Response.json({ ...parseReply(content), model });
  } catch (err) {
    // Real cause stays in the server log; the browser only gets a friendly message.
    console.error("[chat]", err);
    const rateLimited = err instanceof LLMBusyError && err.rateLimited;
    return Response.json({ error: "The AI is busy right now. Try again in a moment.", rateLimited }, { status: 503 });
  }
}
