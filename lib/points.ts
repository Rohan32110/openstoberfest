// "Points to cover" is free text. Split it into a short list the same way on
// the server (for the prompt) and in the browser (for the checklist chips).
export function splitPoints(text: string): string[] {
  return text.split(/[\n,;]+/).map((p) => p.trim()).filter(Boolean).slice(0, 8);
}
