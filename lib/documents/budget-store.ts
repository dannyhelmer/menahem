import { ensureSchema } from "@/lib/db/schema";
import { sql } from "@/lib/db/client";
import type { FinancialLineItem } from "./budget-extract";

interface LineItemRow {
  category: string;
  amount: string;
  fiscal_year: string | null;
  page_number: number | null;
  source_snippet: string | null;
}

function toLineItem(row: LineItemRow): FinancialLineItem {
  return {
    category: row.category,
    amount: Number(row.amount),
    fiscalYear: row.fiscal_year,
    pageNumber: row.page_number,
    sourceSnippet: row.source_snippet ?? "",
  };
}

// Atomically "claims" the extraction job for this document -- true only
// for the ONE caller that successfully flips financial_extraction_attempted
// from false to true. Two concurrent budget-analysis questions about the
// same document (a double-click, or two quick follow-up questions) would
// otherwise both see "not attempted yet" via a separate read, both run
// extraction, and both insert every line item -- silently doubling every
// computed sum with no error or warning. The UPDATE...WHERE...RETURNING
// here is atomic at the database level, so exactly one concurrent caller
// ever gets `true`; the loser must NOT immediately read line items (still
// empty at that instant) -- see waitForFinancialExtraction.
export async function claimFinancialExtraction(documentId: string, userId: string): Promise<boolean> {
  await ensureSchema();
  const rows = (await sql`
    UPDATE documents SET financial_extraction_attempted = true
    WHERE id = ${documentId} AND user_id = ${userId} AND financial_extraction_attempted = false
    RETURNING id
  `) as { id: string }[];
  return rows.length > 0;
}

export async function markFinancialExtractionComplete(documentId: string, userId: string): Promise<void> {
  await ensureSchema();
  await sql`
    UPDATE documents SET financial_extraction_completed_at = now()
    WHERE id = ${documentId} AND user_id = ${userId}
  `;
}

const EXTRACTION_POLL_INTERVAL_MS = 400;

// Called by the caller that LOST the claim race -- rather than reading
// line items immediately (which would still be empty if the winner hasn't
// finished the LLM extraction call yet, wrongly reporting "no financial
// data" for a document that actually has some), polls until
// financial_extraction_completed_at is set or `timeoutMs` elapses. Returns
// immediately, with no actual waiting, for the overwhelmingly common case
// where extraction already finished long ago (completed_at was already
// non-null before the first check) -- the polling cost only exists for a
// genuine, rare race.
export async function waitForFinancialExtraction(documentId: string, userId: string, timeoutMs: number): Promise<void> {
  await ensureSchema();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rows = (await sql`
      SELECT financial_extraction_completed_at FROM documents WHERE id = ${documentId} AND user_id = ${userId}
    `) as { financial_extraction_completed_at: string | null }[];
    if (rows[0]?.financial_extraction_completed_at) return;
    await new Promise((resolve) => setTimeout(resolve, EXTRACTION_POLL_INTERVAL_MS));
  }
  // Timed out -- the winner may have errored before marking completion.
  // Proceed anyway rather than hanging the response; the caller reads
  // whatever's actually there (possibly still empty), which is honest.
}

export async function getFinancialLineItems(documentId: string, userId: string): Promise<FinancialLineItem[]> {
  await ensureSchema();
  const rows = (await sql`
    SELECT dfli.category, dfli.amount, dfli.fiscal_year, dfli.page_number, dfli.source_snippet
    FROM document_financial_line_items dfli
    JOIN documents d ON d.id = dfli.document_id
    WHERE dfli.document_id = ${documentId} AND d.user_id = ${userId}
    ORDER BY dfli.fiscal_year, dfli.category
  `) as LineItemRow[];
  return rows.map(toLineItem);
}

// Saves the extraction result -- a no-op for an empty result (an empty
// result IS the result for a non-budget document; nothing to insert).
// financial_extraction_attempted is set separately by
// claimFinancialExtraction, BEFORE extraction even runs, not here -- see
// that function's comment for why.
export async function saveFinancialLineItems(documentId: string, items: FinancialLineItem[]): Promise<void> {
  await ensureSchema();
  if (items.length === 0) return;
  await sql.transaction((tx) =>
    items.map(
      (item) => tx`
        INSERT INTO document_financial_line_items (document_id, category, amount, fiscal_year, page_number, source_snippet)
        VALUES (${documentId}, ${item.category}, ${item.amount}, ${item.fiscalYear}, ${item.pageNumber}, ${item.sourceSnippet})
      `,
    ),
  );
}
