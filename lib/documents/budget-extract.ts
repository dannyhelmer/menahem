// Document Intelligence Phase 4: extracts structured financial line items
// from a document so budget statistics can be COMPUTED IN CODE (see
// budget-analysis.ts) instead of asked of the model. The LLM is used only
// to LOCATE candidate line items in unstructured text -- every extracted
// amount is then mechanically checked against the actual source page text
// before being trusted, the same "never trust an unverified number"
// principle as Phase 3's citation verification, applied to extraction
// instead of citation.
import { getProvider } from "@/lib/ai/get-provider";
import type { DocumentPage } from "./types";

export interface FinancialLineItem {
  category: string;
  amount: number;
  fiscalYear: string | null;
  pageNumber: number | null;
  sourceSnippet: string;
}

const MAX_EXTRACTION_INPUT = 30_000;
const FIELD_SEPARATOR = "|";
const NONE_MARKER = "NONE";

function buildExtractionPrompt(pages: DocumentPage[], paginated: boolean): { prompt: string; truncated: boolean } {
  let excerpt = "";
  let usedPages = 0;
  for (const page of pages) {
    const withPage = `${excerpt}\n\n--- ${paginated ? `Page ${page.pageNumber}` : "Document"} ---\n${page.text}`;
    if (withPage.length > MAX_EXTRACTION_INPUT && usedPages > 0) break;
    excerpt = withPage;
    usedPages += 1;
    if (excerpt.length > MAX_EXTRACTION_INPUT) break;
  }
  const truncated = usedPages < pages.length;

  const prompt = [
    "Extract every budget or financial line item from the document excerpt below -- a specific dollar amount " +
      "tied to a specific named category (a department, program, fund, or line-item name), such as \"Police " +
      "Overtime: $4,200,000\" or \"Transportation Budget FY2027: $42,000,000\". This is for a system that will " +
      "mechanically verify every extracted figure against this exact text afterward, so do not paraphrase, " +
      "round, estimate, or infer an amount that isn't written explicitly as a number in the text -- only " +
      "extract what's literally there.",
    "Reply with ONLY one line per line item, in exactly this format (pipe-separated, no other text, no " +
      "markdown, no explanation):",
    "CATEGORY | AMOUNT | FISCAL_YEAR | PAGE",
    "- CATEGORY: the specific name of the department/program/fund/line item, as written.",
    "- AMOUNT: digits only, no $ sign, no commas, no abbreviations (write 4200000, not $4.2M or $4,200,000).",
    "- FISCAL_YEAR: the fiscal year this amount applies to if stated nearby (e.g. FY2027, 2026), or the literal " +
      "text NONE if not stated.",
    paginated ? "- PAGE: the page number shown in the excerpt's \"--- Page N ---\" marker this line item came from." : "- PAGE: the literal text NONE (this document has no real pages).",
    `If the excerpt contains no extractable budget/financial line items at all, reply with exactly: ${NONE_MARKER}`,
    "",
    excerpt,
  ].join("\n");

  return { prompt, truncated };
}

function parseAmount(raw: string): number | null {
  const digits = raw.replace(/[^0-9.]/g, "");
  if (!digits) return null;
  const value = Number(digits);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function parseExtractionResponse(response: string): Omit<FinancialLineItem, "sourceSnippet">[] {
  const trimmed = response.trim();
  if (!trimmed || trimmed.toUpperCase() === NONE_MARKER) return [];

  const items: Omit<FinancialLineItem, "sourceSnippet">[] = [];
  for (const line of trimmed.split("\n")) {
    const parts = line.split(FIELD_SEPARATOR).map((part) => part.trim());
    if (parts.length < 2) continue;
    const [category, rawAmount, rawYear, rawPage] = parts;
    if (!category) continue;

    const amount = parseAmount(rawAmount ?? "");
    if (amount === null) continue;

    const fiscalYear = rawYear && rawYear.toUpperCase() !== NONE_MARKER ? rawYear : null;
    const pageNumber = rawPage && rawPage.toUpperCase() !== NONE_MARKER ? Number(rawPage.replace(/\D/g, "")) : null;

    items.push({
      category,
      amount,
      fiscalYear,
      pageNumber: pageNumber && Number.isFinite(pageNumber) && pageNumber > 0 ? pageNumber : null,
    });
  }
  return items;
}

// The amount as literally written can appear as "4,200,000", "4200000", or
// occasionally with a trailing ".00" -- checked as a comma-optional digit
// sequence rather than an exact string match, but never anything looser
// than that (no abbreviated-form matching like "$4.2M" -- if the source
// only ever writes an abbreviated figure, the amount is left unverified
// and discarded rather than guessed at).
function buildAmountPattern(amount: number): RegExp {
  const digits = String(Math.round(amount));
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",?");
  return new RegExp(grouped.replace(/,\?/g, "[,\\s]?"));
}

function findSourceSnippet(item: Omit<FinancialLineItem, "sourceSnippet">, pages: DocumentPage[]): string | null {
  const pattern = buildAmountPattern(item.amount);
  const candidatePages = item.pageNumber
    ? pages.filter((page) => page.pageNumber === item.pageNumber)
    : pages;

  for (const page of candidatePages.length > 0 ? candidatePages : pages) {
    const match = pattern.exec(page.text);
    if (match) {
      const start = Math.max(0, match.index - 60);
      const end = Math.min(page.text.length, match.index + match[0].length + 60);
      return page.text.slice(start, end).trim();
    }
  }
  return null;
}

// Extracts candidate line items via one LLM call, then discards any whose
// amount can't actually be found in the source page text -- an
// unverifiable extraction is treated exactly like a fabricated one and
// never stored, regardless of how plausible it looks.
export async function extractFinancialLineItems(
  pages: DocumentPage[],
  paginated: boolean,
  userId?: string,
): Promise<FinancialLineItem[]> {
  const provider = await getProvider(userId);
  if (!(await provider.isConfigured()) || pages.length === 0) return [];

  const { prompt } = buildExtractionPrompt(pages, paginated);

  let result = "";
  try {
    await provider.streamChat([{ role: "user", content: prompt }], (piece) => {
      result += piece;
    });
  } catch {
    return [];
  }

  const candidates = parseExtractionResponse(result);
  const verified: FinancialLineItem[] = [];
  for (const candidate of candidates) {
    const sourceSnippet = findSourceSnippet(candidate, pages);
    if (sourceSnippet === null) continue; // unverifiable -- discarded, never stored
    verified.push({ ...candidate, sourceSnippet });
  }
  return verified;
}
