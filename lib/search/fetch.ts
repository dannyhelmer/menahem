import { NodeType, parse, type Node } from "node-html-parser";

const FETCH_TIMEOUT_MS = 8_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_EXTRACTED_CHARS = 4_000;
const USER_AGENT = "Mozilla/5.0 (compatible; MenahemBot/1.0; local AI assistant, not a crawler)";

const SKIP_TAGS = new Set(["script", "style", "noscript", "nav", "header", "footer", "svg", "form", "iframe"]);
const BLOCK_TAGS = new Set(["p", "div", "br", "li", "tr", "h1", "h2", "h3", "h4", "h5", "h6", "article", "section"]);

function extractVisibleText(node: Node): string {
  let out = "";

  function walk(current: Node) {
    if (current.nodeType === NodeType.TEXT_NODE) {
      out += current.rawText;
      return;
    }
    if (current.nodeType === NodeType.ELEMENT_NODE) {
      const tag = "tagName" in current ? (current as { tagName?: string }).tagName?.toLowerCase() : undefined;
      if (tag && SKIP_TAGS.has(tag)) return;
      for (const child of current.childNodes) walk(child);
      if (tag && BLOCK_TAGS.has(tag)) out += "\n";
    }
  }

  walk(node);
  return out
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]*\n+/g, "\n\n")
    .trim();
}

interface FetchResult {
  text: string | null;
  error: string | null;
}

export async function fetchPageText(url: string, maxChars = MAX_EXTRACTED_CHARS): Promise<FetchResult> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    return { text: null, error: `Couldn't fetch page: ${err instanceof Error ? err.message : String(err)}` };
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("html")) {
    return { text: null, error: `Not an HTML page (content-type: ${contentType || "unknown"})` };
  }
  if (!response.body) return { text: null, error: "Empty response body." };

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (totalBytes < MAX_RESPONSE_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      totalBytes += value.byteLength;
    }
  }
  reader.cancel().catch(() => {});

  const charsetMatch = contentType.match(/charset=([^;]+)/i);
  let decoder: TextDecoder;
  try {
    decoder = new TextDecoder(charsetMatch ? charsetMatch[1].trim() : "utf-8");
  } catch {
    decoder = new TextDecoder("utf-8");
  }
  const html = chunks.map((chunk) => decoder.decode(chunk, { stream: true })).join("") + decoder.decode();

  let text: string;
  try {
    text = extractVisibleText(parse(html));
  } catch (err) {
    return { text: null, error: `Couldn't parse page content: ${err instanceof Error ? err.message : String(err)}` };
  }

  if (!text) return { text: null, error: "Page loaded but no readable text content was found (may be JS-rendered)." };

  // Bot-challenge/interstitial pages (Cloudflare, etc.) return HTTP 200 with
  // real HTML, so the checks above don't catch them -- but the "content" is
  // a JS-challenge placeholder, not the actual article, and feeding that to
  // the model as if it were real page content produces confidently wrong
  // answers sourced to a page that never actually said what's claimed. A
  // short extraction combined with a telltale phrase is a reliable signal.
  const BOT_CHALLENGE_RE = /just a moment|checking your browser|enable javascript and cookies|verify you are human|attention required/i;
  if (text.length < 200 && BOT_CHALLENGE_RE.test(text)) {
    return { text: null, error: "Page returned a bot-challenge/interstitial page instead of real content." };
  }

  if (text.length > maxChars) {
    const truncated = text.slice(0, maxChars);
    const lastSpace = truncated.lastIndexOf(" ");
    text = `${lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated}...`;
  }

  return { text, error: null };
}
