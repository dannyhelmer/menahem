// Extracts exactly two comparison subjects from free text -- deterministic,
// no LLM call, matching this project's established regex-routing philosophy.
// Conservative by design: returns null rather than guessing when it can't
// confidently find two distinct targets, so an ambiguous "compare" mention
// just falls through to the existing single-entity flow untouched.

const FEDERAL_BILL_G_RE =
  /\b(?:h\.?\s?r\.?|h\.?\s?res\.?|h\.?\s?j\.?\s?res\.?|h\.?\s?con\.?\s?res\.?|s\.?\s?res\.?|s\.?\s?j\.?\s?res\.?|s\.?\s?con\.?\s?res\.?|s\.?)\s*\d+\b/gi;
const NAME_G_RE = /\b[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){1,2}\b/g;

// Trigger words that, because they're also capitalized, get swept into the
// front of a greedy NAME_G_RE match (e.g. "Compare Jane Smith" instead of
// "Jane Smith") -- stripped off the front of each match rather than only
// filtered as a whole, since the regex rarely matches them alone.
const NAME_STOPWORDS = new Set(["Compare", "Comparing", "Versus", "Between", "Which"]);

function stripLeadingStopword(name: string): string {
  const words = name.split(/\s+/);
  if (words.length > 1 && NAME_STOPWORDS.has(words[0])) return words.slice(1).join(" ");
  return name;
}

function distinctMatches(text: string, pattern: RegExp): string[] {
  const seen = new Set<string>();
  const results: string[] = [];
  for (const match of text.matchAll(pattern)) {
    const value = match[0].trim();
    const key = value.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      results.push(value);
    }
  }
  return results;
}

export interface ComparisonTargets {
  kind: "bill" | "name";
  a: string;
  b: string;
}

export function extractComparisonTargets(text: string): ComparisonTargets | null {
  const bills = distinctMatches(text, FEDERAL_BILL_G_RE);
  if (bills.length >= 2) return { kind: "bill", a: bills[0], b: bills[1] };

  const rawNames = distinctMatches(text, NAME_G_RE).map(stripLeadingStopword);
  const names = Array.from(new Set(rawNames)).filter((n) => !NAME_STOPWORDS.has(n) && n.includes(" "));
  if (names.length >= 2) return { kind: "name", a: names[0], b: names[1] };

  return null;
}
