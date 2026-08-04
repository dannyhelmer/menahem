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
// ever gets `true`; the other proceeds straight to reading whatever's
// there (possibly empty for a moment until the winner finishes writing --
// acceptable eventual consistency, not worth a full lock/wait mechanism
// for how rarely two budget questions land within milliseconds of each
// other).
export async function claimFinancialExtraction(documentId: string, userId: string): Promise<boolean> {
  await ensureSchema();
  const rows = (await sql`
    UPDATE documents SET financial_extraction_attempted = true
    WHERE id = ${documentId} AND user_id = ${userId} AND financial_extraction_attempted = false
    RETURNING id
  `) as { id: string }[];
  return rows.length > 0;
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
