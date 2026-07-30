import { getProvider } from "@/lib/ai/get-provider";

const FALLBACK_SUMMARY = "Summary unavailable -- Menahem's local model wasn't reachable at upload time.";
const MAX_INPUT_LENGTH = 12_000;

// Same one-shot, non-streaming pattern as lib/memory/title.ts's generateTitle.
export async function generateDocumentSummary(text: string, userId?: string): Promise<string> {
  const provider = await getProvider(userId);
  if (!(await provider.isConfigured())) return FALLBACK_SUMMARY;

  const excerpt = text.slice(0, MAX_INPUT_LENGTH);
  const prompt = [
    "Summarize the following document in 3-5 sentences, capturing its actual content and purpose.",
    "Only summarize what's shown below -- never invent details the excerpt doesn't contain.",
    excerpt.length < text.length
      ? "Note: this is only the first portion of a longer document -- summarize what's shown, don't imply it's the whole thing."
      : "",
    "",
    excerpt,
  ]
    .filter(Boolean)
    .join("\n");

  let result = "";
  try {
    await provider.streamChat([{ role: "user", content: prompt }], (piece) => {
      result += piece;
    });
  } catch {
    return FALLBACK_SUMMARY;
  }

  return result.trim() || FALLBACK_SUMMARY;
}
