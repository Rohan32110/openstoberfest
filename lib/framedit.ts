// Shared helpers for the Framedit export API. SERVER-ONLY: only the
// /api/framedit/* routes import this file, because it reads the export key.
// Framedit allows 20 requests/minute for ALL our users together, so we
// validate input locally before calling it and cache good answers for 12h.

// All codes Framedit knows, exact case (a wrong case silently returns nothing).
// The picker UI offers a subset; the server accepts any valid code.
export const DEPARTMENTS = ["QSIS", "DIS", "SHIS", "CSE", "EEE", "ETE", "CCE", "CE", "Pharmacy", "BA", "EB", "ELL", "ALL", "Law"] as const;

const CACHE_MS = 12 * 60 * 60 * 1000;
const cache = new Map<string, { at: number; data: unknown }>(); // per server instance

export const isDepartment = (v: string | null): v is string => v !== null && (DEPARTMENTS as readonly string[]).includes(v);
export const isSemester = (v: string | null) => v !== null && /^[1-8]$/.test(v);
// Env values pasted into a dashboard often pick up spaces, newlines or quotes.
const clean = (v: string | undefined) => (v ?? "").trim().replace(/^["']|["']$/g, "");

export const isCourseId = (v: string | null) => v !== null && /^[1-9]\d{0,9}$/.test(v);

// Calls Framedit with a 15s timeout. Returns the JSON on a 200, otherwise null.
// Only successful answers are cached; failures are retried on the next request.
// `label` ("courses" / "syllabus") is all that goes in logs - never the key.
export async function frameditGet(label: string, params: URLSearchParams): Promise<unknown | null> {
  const base = clean(process.env.FRAMEDIT_API_URL).replace(/\/+$/, ""); // tolerate a trailing slash
  const key = clean(process.env.FRAMEDIT_EXPORT_KEY);
  if (!base || !key) {
    console.warn(`[framedit] ${label} not configured`);
    return null;
  }
  const url = `${base}/api/export/${label}?${params.toString()}`;
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;

  try {
    const res = await fetch(url, { headers: { "x-export-key": key }, signal: AbortSignal.timeout(15_000), cache: "no-store" });
    if (!res.ok) {
      console.warn(`[framedit] ${label} ${res.status}`);
      return null;
    }
    const data = await res.json();
    cache.set(url, { at: Date.now(), data });
    return data;
  } catch (err) {
    console.warn(`[framedit] ${label} ${(err as Error).name}`); // e.g. TimeoutError, never the URL/key
    return null;
  }
}
