// POST /api/speech-token - creates a short-lived (60s) Speechmatics key so the
// browser can stream audio straight to Speechmatics' realtime API and show
// words live. Our real key never leaves the server; the temporary one expires.

export async function POST(request: Request) {
  const key = request.headers.get("x-speechmatics-key") || process.env.SPEECHMATICS_API_KEY;
  if (!key) return Response.json({ error: "Live voice isn't set up." }, { status: 503 });

  try {
    const res = await fetch("https://mp.speechmatics.com/v1/api_keys?type=rt", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ttl: 60 }), // only needs to live long enough to open the connection
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const { key_value } = await res.json();
    if (typeof key_value !== "string") throw new Error("no key in response");
    return Response.json({ token: key_value });
  } catch (err) {
    console.error("[speech-token] failed:", (err as Error).message);
    return Response.json({ error: "Live voice is unavailable." }, { status: 502 });
  }
}
