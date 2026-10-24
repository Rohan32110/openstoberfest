// Shared LLM client. Every AI feature calls chatComplete() and nothing else,
// so key rotation, model fallback and timeouts live in exactly one place.
//
// Strategy: try keys on the best model first; only when no key can serve
// that model do we drop to the next model tier. Calls are NON-streaming, so a
// failure halfway through is invisible to the user - we just replay the same
// messages on the next key/tier while the UI keeps showing "thinking".

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

type Key = { name: string; id: string; value: string }; // name is safe to log, value never is
type Tier = { model: string; label: string };
type Target = { baseUrl: string; keys: Key[]; tiers: Tier[]; budgetMs: number; attemptMs: number };

// Ordered best-first. The last tier is a different model family, so a problem
// specific to gpt-oss still leaves us something to answer with.
const GROQ_TIERS: Tier[] = [
  { model: "openai/gpt-oss-120b", label: "gpt-oss-120b" },
  { model: "openai/gpt-oss-20b", label: "gpt-oss-20b" },
  { model: "qwen/qwen3.8-27b", label: "qwen3.8-27b" },
];
const OLLAMA_TIERS: Tier[] = [{ model: "gemma3:1b", label: "gemma3:1b local" }];

const KEY_ENV_NAMES = ["LLM_KEY_1", "LLM_KEY_2"];
const MAX_COOLDOWN_MS = 15 * 60_000; // a bad retry-after header can't park a key forever

// All model-specific parameters in one place. `answerTokens` is roughly how
// long the visible answer can be (short chat reply vs. a set of flashcards).
function modelParams(model: string, answerTokens: number): Record<string, unknown> {
  // gpt-oss "thinks" before answering and those hidden tokens count toward
  // max_tokens, so it needs headroom or it returns empty content. Low effort
  // keeps replies fast; the task (asking one good question) doesn't need more.
  if (model.startsWith("openai/gpt-oss")) return { reasoning_effort: "low", max_tokens: answerTokens + 1024 };
  if (model.startsWith("qwen/")) return { reasoning_effort: "none", max_tokens: answerTokens };
  // Local gemma: tiny model that forgets the JSON format, so force JSON mode.
  return { max_tokens: answerTokens, response_format: { type: "json_object" } };
}

// ---- Ledger: in-memory, per server instance, advisory only. ----
// Cold starts wipe it; real 429s re-teach it. Keyed by "key:model" so one
// exhausted model does not block the same key on other models.
type Stats = { recent: number[]; cooldownUntil: number };
const ledger = new Map<string, Stats>();

function statsFor(key: Key, model: string): Stats {
  const id = `${key.id}:${model}`;
  if (!ledger.has(id)) ledger.set(id, { recent: [], cooldownUntil: 0 });
  return ledger.get(id)!;
}

// Pick the least-loaded key that isn't cooling down and wasn't already tried
// in this request. Returns null when none is eligible = "move to next tier".
function pickKey(keys: Key[], model: string, tried: Set<string>): Key | null {
  const now = Date.now();
  let best: Key | null = null;
  let bestLoad = Infinity;
  for (const key of keys) {
    const stats = statsFor(key, model);
    stats.recent = stats.recent.filter((t) => now - t < 60_000); // rolling 60s window
    if (tried.has(key.id) || stats.cooldownUntil > now) continue;
    if (stats.recent.length < bestLoad) {
      best = key;
      bestLoad = stats.recent.length;
    }
  }
  // Reserve synchronously (before any await) so concurrent requests
  // don't all grab the same idle key.
  if (best) statsFor(best, model).recent.push(now);
  return best;
}

function coolDown(key: Key, model: string, retryAfter: string | null) {
  // Short retry-after (<=120s) = per-minute limit, wait it out. Long or missing
  // usually means a daily limit; we park the key, capped at 15 minutes.
  const seconds = Number(retryAfter);
  const ms = retryAfter && Number.isFinite(seconds) ? seconds * 1000 : MAX_COOLDOWN_MS;
  statsFor(key, model).cooldownUntil = Date.now() + Math.min(ms, MAX_COOLDOWN_MS);
}

// Thrown when every key and tier failed. rateLimited tells the UI whether to
// offer "use your own key"; the message itself is never shown to the user.
export class LLMBusyError extends Error {
  constructor(public rateLimited: boolean, cause: string) {
    super(cause);
  }
}

type Attempt = { ok: true; content: string } | { ok: false; status: number; retryAfter?: string | null };

async function attempt(target: Target, key: Key, tier: Tier, messages: ChatMessage[], deadline: number, answerTokens: number): Promise<Attempt> {
  try {
    const res = await fetch(`${target.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key.value}` },
      body: JSON.stringify({ model: tier.model, messages, ...modelParams(tier.model, answerTokens) }),
      signal: AbortSignal.timeout(Math.max(1, Math.min(target.attemptMs, deadline - Date.now()))),
    });
    if (!res.ok) {
      console.error(`[llm] ${key.name} ${tier.model} -> ${res.status}: ${(await res.text()).slice(0, 300)}`);
      return { ok: false, status: res.status, retryAfter: res.headers.get("retry-after") };
    }
    const choice = (await res.json()).choices?.[0];
    // Only ever use "content"; gpt-oss puts its reasoning in a separate field.
    // Strip <think> blocks defensively in case a model inlines them.
    const content = String(choice?.message?.content ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    if (!content || choice?.finish_reason === "length") {
      console.error(`[llm] ${key.name} ${tier.model} -> empty/truncated (${choice?.finish_reason})`);
      return { ok: false, status: 200 };
    }
    return { ok: true, content };
  } catch (err) {
    console.error(`[llm] ${key.name} ${tier.model} -> network/timeout: ${(err as Error).name}`);
    return { ok: false, status: 0 };
  }
}

// Decide where calls go: local Ollama (offline toggle) or Groq with the
// user's own key (if given) plus the server's shared keys.
function resolveTarget(opts: { offline?: boolean; userKey?: string }): Target {
  if (opts.offline) {
    const baseUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434/v1";
    // A local CPU model can take 15-30s on its first reply (loading into
    // memory), so one attempt may use almost the whole budget.
    return { baseUrl, keys: [{ name: "OLLAMA", id: "OLLAMA", value: "ollama" }], tiers: OLLAMA_TIERS, budgetMs: 60_000, attemptMs: 55_000 };
  }
  const keys: Key[] = KEY_ENV_NAMES.filter((name) => process.env[name]) // skip unset env vars
    .map((name) => ({ name, id: name, value: process.env[name]! }));
  if (opts.userKey) keys.unshift({ name: "USER_KEY", id: `USER_KEY#${opts.userKey.slice(-6)}`, value: opts.userKey });
  const baseUrl = process.env.LLM_BASE_URL || "https://api.groq.com/openai/v1";
  // Groq answers in ~1s; a 12s attempt cap leaves room to try the next key/tier.
  return { baseUrl, keys, tiers: GROQ_TIERS, budgetMs: 20_000, attemptMs: 12_000 };
}

export async function chatComplete(
  messages: ChatMessage[],
  opts: { offline?: boolean; userKey?: string; answerTokens?: number } = {},
): Promise<{ content: string; model: string }> {
  const answerTokens = opts.answerTokens ?? 400;
  const target = resolveTarget(opts);
  const deadline = Date.now() + target.budgetMs;
  let saw429 = false;

  for (const tier of target.tiers) {
    const tried = new Set<string>();
    let backoffMs = 0; // first key on a tier goes immediately
    while (Date.now() < deadline) {
      const key = pickKey(target.keys, tier.model, tried);
      if (!key) break; // no eligible key for this model -> next tier
      tried.add(key.id);

      // Back off 1s, 2s, 4s between key moves - but never past the deadline.
      if (backoffMs && Date.now() + backoffMs < deadline) await new Promise((r) => setTimeout(r, backoffMs));
      backoffMs = backoffMs ? backoffMs * 2 : 1000;

      const result = await attempt(target, key, tier, messages, deadline, answerTokens);
      if (result.ok) return { content: result.content, model: tier.label };

      if (result.status === 429) {
        saw429 = true;
        coolDown(key, tier.model, result.retryAfter ?? null);
      }
      // 400/413 means the request itself is bad for this model; every key
      // would fail the same way, so skip straight to the next tier.
      if (result.status === 400 || result.status === 413) break;
    }
  }
  throw new LLMBusyError(saw429, Date.now() >= deadline ? "deadline exceeded" : "all keys and tiers exhausted");
}
