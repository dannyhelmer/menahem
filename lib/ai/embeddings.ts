// Deliberately separate from the chat-provider abstraction (lib/ai/provider.ts)
// -- embeddings and chat completion are different capabilities, and this
// app's chat provider can legitimately be Anthropic, which has no
// embeddings API at all. Embeddings always go directly to OpenAI
// regardless of which provider is handling chat. Every caller must treat
// `null` (both isEmbeddingConfigured() and a null vector back from
// embedTexts) as a normal, expected state -- a deployment with no
// OPENAI_API_KEY set still works, it just falls back to exact/full-text
// search instead of semantic search (see lib/documents/retrieval.ts).
const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;

function getApiKey(): string | null {
  const key = process.env.OPENAI_API_KEY?.trim();
  return key ? key : null;
}

export function isEmbeddingConfigured(): boolean {
  return getApiKey() !== null;
}

// Batched -- one request for a whole document's chunks at upload time,
// rather than one call per chunk. Returns null for every input if
// embeddings aren't configured or the request fails, so callers never have
// to special-case "some succeeded, some didn't" -- either the whole batch
// has real vectors or none of it does.
export async function embedTexts(texts: string[]): Promise<(number[] | null)[]> {
  if (texts.length === 0) return [];
  const apiKey = getApiKey();
  if (!apiKey) return texts.map(() => null);

  try {
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      console.error(`[embeddings] OpenAI embeddings request failed: ${response.status} ${await response.text()}`);
      return texts.map(() => null);
    }
    const data = (await response.json()) as { data: { index: number; embedding: number[] }[] };
    const byIndex = new Map(data.data.map((d) => [d.index, d.embedding]));
    return texts.map((_, i) => byIndex.get(i) ?? null);
  } catch (err) {
    console.error("[embeddings] OpenAI embeddings request threw:", err);
    return texts.map(() => null);
  }
}

export async function embedText(text: string): Promise<number[] | null> {
  const [embedding] = await embedTexts([text]);
  return embedding ?? null;
}

// pgvector's fetch driver returns a vector column as its literal text
// representation ("[0.1,0.2,...]"); this formats a JS array the same way
// for use inside a query.
export function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}
