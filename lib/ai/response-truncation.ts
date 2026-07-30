// When generation is cut off by the token cap, the raw text often ends
// mid-sentence or mid-word. Trimming to the last complete sentence keeps
// the truncation notice honest -- "here's a clean, complete-sentence
// excerpt" rather than a response that just stops.
export function trimToSentenceBoundary(text: string): string {
  const matches = [...text.matchAll(/[.!?](?:["')\]]?)(?=\s|$)/g)];
  if (matches.length === 0) return text;
  const last = matches[matches.length - 1];
  const cutIndex = (last.index ?? 0) + last[0].length;
  return text.slice(0, cutIndex).trimEnd();
}
