// POST /api/flashcards - turns the user's own explanations into study cards.
// Each card is built from what the user said; anything they got wrong is
// corrected on the card and the mistake is spelled out in "fix".

import { chatComplete, LLMBusyError, type ChatMessage } from "@/lib/ai/llm-client";

type Card = { front: string; back: string; fix?: string };

const INSTRUCTIONS = `You turn a student's own explanation of a topic into study flashcards.

Rules:
- Make 4 to 8 cards covering the key ideas the student explained (and the points they wanted to cover).
- "front" is a short, clear question. "back" is a correct answer in 1-3 plain sentences.
- Base the cards on what the student said, in their wording where it was right.
- If the student said something wrong, incomplete or contradictory, the "back" must give the CORRECT version, and "fix" must say plainly what they got wrong, e.g. "You said X, but actually Y." Leave "fix" out when they were right.
- No markdown, no lists inside the text.

Respond with ONLY this JSON object and nothing else:
{"cards": [{"front": "...", "back": "...", "fix": "..."}]}`;

function parseCards(raw: string): Card[] {
  try {
    const json = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "");
    if (!Array.isArray(json.cards)) return [];
    return json.cards
      .filter((c: Card) => typeof c?.front === "string" && typeof c?.back === "string" && c.front.trim() && c.back.trim())
      .slice(0, 8)
      .map((c: Card) => ({ front: c.front.trim(), back: c.back.trim(), ...(typeof c.fix === "string" && c.fix.trim() ? { fix: c.fix.trim() } : {}) }));
  } catch {
    return [];
  }
}

export async function POST(request: Request) {
  let body: { concept?: string; points?: string; messages?: { role: string; content: string }[]; offline?: boolean; userKey?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  const concept = String(body.concept ?? "").slice(0, 200).trim();
  const history = Array.isArray(body.messages) ? body.messages : [];
  if (!concept || !history.some((m) => m.role === "user")) {
    return Response.json({ error: "Explain the concept first, then make flashcards." }, { status: 400 });
  }

  // One readable transcript, so the model sees exactly who said what.
  const transcript = history.slice(-16)
    .map((m) => `${m.role === "user" ? "STUDENT" : "LISTENER"}: ${String(m.content).slice(0, 2000)}`)
    .join("\n");
  const points = String(body.points ?? "").slice(0, 1000).trim();
  const messages: ChatMessage[] = [
    { role: "system", content: INSTRUCTIONS },
    { role: "user", content: `Topic: ${concept}\n${points ? `Points they wanted to cover: ${points}\n` : ""}\nConversation:\n${transcript}` },
  ];

  try {
    const { content, model } = await chatComplete(messages, {
      offline: Boolean(body.offline),
      userKey: typeof body.userKey === "string" ? body.userKey.trim() : undefined,
      answerTokens: 1500, // several cards need more room than a chat reply
    });
    const cards = parseCards(content);
    if (cards.length === 0) {
      console.error("[flashcards] unparseable model output");
      return Response.json({ error: "Couldn't make flashcards this time. Try again." }, { status: 502 });
    }
    return Response.json({ cards, model });
  } catch (err) {
    console.error("[flashcards]", err);
    const rateLimited = err instanceof LLMBusyError && err.rateLimited;
    const error = body.offline
      ? "Offline mode needs Ollama running on this computer, so it only works when you run Rewise locally. Turn Offline off to use the online AI."
      : "The AI is busy right now. Try again in a moment.";
    return Response.json({ error, rateLimited }, { status: 503 });
  }
}
