import { getProvider } from "@/lib/ai/get-provider";
import type { StoredMessage } from "./types";

const FALLBACK_TITLE = "New conversation";
const MAX_TITLE_LENGTH = 80;

export async function generateTitle(messages: StoredMessage[], userId?: string): Promise<string> {
  const provider = await getProvider(userId);
  if (!(await provider.isConfigured())) return FALLBACK_TITLE;

  const transcript = messages
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n")
    .slice(0, 4000);

  const prompt = [
    "Generate a short 3-6 word title summarizing this conversation.",
    'Reply with ONLY the title -- no quotes, no punctuation at the end, nothing else.',
    "",
    transcript,
  ].join("\n");

  let result = "";
  try {
    await provider.streamChat([{ role: "user", content: prompt }], (piece) => {
      result += piece;
    });
  } catch {
    return FALLBACK_TITLE;
  }

  const title = result.trim().replace(/^["']|["']$/g, "");
  if (!title) return FALLBACK_TITLE;
  return title.length > MAX_TITLE_LENGTH ? `${title.slice(0, MAX_TITLE_LENGTH)}…` : title;
}
