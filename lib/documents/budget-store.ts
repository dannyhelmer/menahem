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

export async function hasAttemptedFinancialExtraction(documentId: string, userId: string): Promise<boolean> {
  await ensureSchema();
  const rows = (await sql`
    SELECT financial_extraction_attempted FROM documents WHERE id = ${documentId} AND user_id = ${userId}
  `) as { financial_extraction_attempted: boolean }[];
  return rows[0]?.financial_extraction_attempted ?? false;
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

// Saves the extraction result (even if empty -- an empty result IS the
// result for a non-budget document) and marks extraction as attempted in
// one transaction, so a document is never left in a state where
// financial_extraction_attempted is true but its line items didn't
// actually get written, or vice versa.
export async function saveFinancialLineItems(
  documentId: string,
  userId: string,
  items: FinancialLineItem[],
): Promise<void> {
  await ensureSchema();
  await sql.transaction((tx) => [
    tx`UPDATE documents SET financial_extraction_attempted = true WHERE id = ${documentId} AND user_id = ${userId}`,
    ...items.map(
      (item) => tx`
        INSERT INTO document_financial_line_items (document_id, category, amount, fiscal_year, page_number, source_snippet)
        VALUES (${documentId}, ${item.category}, ${item.amount}, ${item.fiscalYear}, ${item.pageNumber}, ${item.sourceSnippet})
      `,
    ),
  ]);
}
