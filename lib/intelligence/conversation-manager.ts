// Ported from the Python app's core/conversation_manager.py: a short
// follow-up message ("look at polls", "why?", "expand") doesn't make sense
// as a standalone search query -- this resolves it against the recent
// conversation before it's used to build a search query. The original user
// message is never rewritten for the model itself; only the search query
// construction uses the resolved version.
import { getProvider } from "@/lib/ai/get-provider";
import type { ChatMessage } from "@/lib/ai/types";

const FOLLOWUP_STARTERS_RE =
  /^(yes|yeah|yep|sure|ok|okay|no|nope|why|continue|expand|go on|look (at|into|it up)|show me|tell me more|what about|and him|and her|and them|do (it|that)|please (do|continue)|keep going)\b/i;

const CLARIFYING_REPLY_MARKERS_RE =
  /\?|let me know|which (state|city|county|district|office|candidate)|please (specify|clarify|let me know|tell me)|could you (clarify|specify|tell me)|i'?d need to know|can you (tell me|specify|clarify)/i;

const MAX_REWRITE_LENGTH = 300;

export function isShortFollowup(text: string): boolean {
  const stripped = text.trim();
  if (!stripped) return false;
  const wordCount = stripped.split(/\s+/).length;
  return wordCount <= 15 && FOLLOWUP_STARTERS_RE.test(stripped);
}

function isReplyToClarifyingQuestion(text: string, messagesSnapshot: ChatMessage[]): boolean {
  const stripped = text.trim();
  if (!stripped || stripped.split(/\s+/).length > 15) return false;
  if (messagesSnapshot.length < 2) return false;
  const previous = messagesSnapshot[messagesSnapshot.length - 2];
  return previous.role === "assistant" && CLARIFYING_REPLY_MARKERS_RE.test(previous.content);
}

export interface FollowupResolution {
  query: string;
  resolved: boolean;
}

export async function resolveFollowupTopic(
  text: string,
  messagesSnapshot: ChatMessage[],
  userId?: string,
): Promise<FollowupResolution> {
  if (!isShortFollowup(text) && !isReplyToClarifyingQuestion(text, messagesSnapshot)) {
    return { query: text, resolved: false };
  }

  const priorMessages = messagesSnapshot.slice(0, -1).slice(-4);
  if (priorMessages.length === 0) return { query: text, resolved: false };

  const transcript = priorMessages.map((m) => `${m.role}: ${m.content}`).join("\n");
  const prompt =
    `Given this recent conversation snippet:\n---\n${transcript}\n---\n` +
    `The user just sent this short follow-up: "${text}"\n` +
    'Rewrite it into a single standalone question or search query that preserves exactly what the user means, ' +
    'resolving any pronoun or short reference ("it", "that", "polls", "him", "continue") against the ' +
    "conversation above. Respond with ONLY the rewritten text, nothing else -- no quotes, no explanation.";

  let result = "";
  try {
    const provider = await getProvider(userId);
    await provider.streamChat([{ role: "user", content: prompt }], (piece) => {
      result += piece;
    });
  } catch {
    return { query: text, resolved: false };
  }

  const rewritten = result.trim().replace(/^["']|["']$/g, "");
  if (!rewritten || rewritten.length > MAX_REWRITE_LENGTH) return { query: text, resolved: false };
  return { query: rewritten, resolved: true };
}
