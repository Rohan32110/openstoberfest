// POST /api/chat - one round of the Feynman conversation.
// Builds the prompt, asks the shared LLM client, and returns a validated
// { reply, understanding, confusion, covered, model } to the browser.

import { chatComplete, LLMBusyError, type ChatMessage } from "@/lib/ai/llm-client";
import { getPersona } from "@/lib/personas";
import { splitPoints } from "@/lib/points";

type Body = {
  concept?: string;
  points?: string;
  persona?: string;
  understanding?: number;
  messages?: { role: string; content: string }[];
  offline?: boolean;
  userKey?: string;
};

function systemPrompt(concept: string, points: string[], personaId: string, understanding: number): string {
  const persona = getPersona(personaId);
  return `You are ${persona.character}

A student is learning "${concept}" with the Feynman technique: they explain it to you in their own words. You do NOT already know this topic. You only understand what the student has actually explained so far.
${points.length ? `\nNumbered points the student wants to cover:\n${points.map((p, i) => `${i + 1}. ${p}`).join("\n")}\nIf some of these have not been explained yet, steer your questions towards them.\n` : ""}
How to reply:
- 1 to 3 short sentences, like a real person talking. No lists, no markdown, no lectures.
- Ask ONE follow-up question about the biggest gap, vague word or unexplained jargon.
- Never explain the topic yourself and never give away the answer.
- Stay in character.

Scoring:
- "understanding" (0-100) is how well the student has explained the topic across the whole conversation. It was ${understanding} before this message.
- Be fair and encouraging. A clear, correct explanation of the core mechanism should jump it by 30-50 points at once. Surface details or restating add only a little. Contradictions or wrong claims lower it.
- A student who explains the core idea correctly and answers your follow-ups well should reach 80+ within about 2-4 messages. Do not hold out for perfection.
- "confusion" (0-100) is how confused you personally feel right now.
- When understanding reaches 80 or more, tell them you finally get it and thank them warmly instead of asking another question.
- "covered" lists the numbers of the points the student has clearly and correctly explained so far (empty list if none or no points).

Respond with ONLY this JSON object and nothing else:
{"reply": "...", "understanding": <number>, "confusion": <number>, "covered": [<numbers>]}`;
}

// Models sometimes wrap JSON in prose or code fences, so grab the first {...}.
// If that still fails, show the raw text and let the client keep old scores.
function parseReply(raw: string, pointCount: number) {
  const clamp = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? Math.round(Math.min(100, Math.max(0, n))) : null);
  try {
    const json = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "");
    if (typeof json.reply === "string" && json.reply.trim()) {
      // Keep only valid point numbers (1..pointCount), turned into 0-based indexes.
      const covered = Array.isArray(json.covered)
        ? json.covered.filter((n: unknown) => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= pointCount).map((n: number) => n - 1)
        : null;
      return { reply: json.reply.trim(), understanding: clamp(json.understanding), confusion: clamp(json.confusion), covered };
    }
  } catch {}
  return { reply: raw, understanding: null, confusion: null, covered: null };
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const concept = String(body.concept ?? "").slice(0, 200).trim();
  const points = splitPoints(String(body.points ?? "").slice(0, 1000));
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
    return Response.json({ ...parseReply(content, points.length), model });
  } catch (err) {
    // Real cause stays in the server log; the browser only gets a friendly message.
    console.error("[chat]", err);
    const rateLimited = err instanceof LLMBusyError && err.rateLimited;
    return Response.json({ error: "The AI is busy right now. Try again in a moment.", rateLimited }, { status: 503 });
  }
}
