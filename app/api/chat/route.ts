import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { getProvider } from "@/lib/ai/get-provider";
import { buildSystemPrompt } from "@/lib/ai/system-prompt";
import { buildModelMessages, performValidationPass } from "@/lib/ai/grounding";
import type { ChatMessage } from "@/lib/ai/types";
import { withAuth } from "@/lib/auth/with-auth";
import { checkMessageLimit, checkDeepResearch, checkConversationLimit } from "@/lib/subscription/guards";
import { incrementMessageCount } from "@/lib/subscription/store";
import { resolveFollowupTopic } from "@/lib/intelligence/conversation-manager";
import { CRITICISM_GUIDANCE, detectCriticism } from "@/lib/intelligence/criticism";
import { isFastPathMessage, isSystemTestMessage, SYSTEM_TEST_GUIDANCE } from "@/lib/intelligence/fast-path";
import {
  detectJurisdiction,
  detectState,
  hasLocalPlaceHint,
  JURISDICTION_CLARIFICATION_MESSAGE,
  LOCAL_JURISDICTION_CLARIFICATION_MESSAGE,
  type Jurisdiction,
} from "@/lib/intelligence/jurisdiction";
import { runMathForMessage } from "@/lib/intelligence/math-tool";
import { extractComparisonTargets } from "@/lib/intelligence/comparison-targets";
import { buildLearningModeGuidance, detectLearningMode } from "@/lib/intelligence/learning-mode";
import { classifyPoliticalIntents, isPoliticalQuestion, type PoliticalIntent } from "@/lib/intelligence/political-intent";
import { requiresLiveData, VERIFICATION_FAILED_MESSAGE } from "@/lib/intelligence/requires-live-data";
import { CATEGORY_LABELS, classify } from "@/lib/intelligence/task-classifier";
import { getDocument, getDocumentPages, getDocumentText, listDocuments } from "@/lib/documents/store";
import type { DocumentPage, StoredDocument } from "@/lib/documents/types";
import { retrieveRelevantChunks, type RetrievalResult, type RetrievedChunk } from "@/lib/documents/retrieval";
import {
  mergeDocumentCitationContexts,
  verifyDocumentCitations,
  type DocumentCitationContext,
} from "@/lib/documents/citation-verification";
import { extractFinancialLineItems } from "@/lib/documents/budget-extract";
import { getFinancialLineItems, hasAttemptedFinancialExtraction, saveFinancialLineItems } from "@/lib/documents/budget-store";
import { computeBudgetAnalysis, type BudgetAnalysis } from "@/lib/documents/budget-analysis";
import { verifyBudgetObjectiveFindings } from "@/lib/documents/budget-verification";
import { wantsBudgetAnalysis } from "@/lib/intelligence/budget-intent";
import { getProject } from "@/lib/notebook/store";
import { getResearchCategory } from "@/lib/research-categories/config";
import {
  detectEntityLookupNeed,
  detectExplicitSearchOverride,
  detectHistoricalVerificationNeed,
  detectOfflineRequest,
  detectRecencyNeed,
} from "@/lib/intelligence/web-search-intent";
import { trimToSentenceBoundary } from "@/lib/ai/response-truncation";
import {
  appendMessage,
  appendToLastMessage,
  isValidSessionId,
  loadSession,
  renameSession,
  touchEndTime,
} from "@/lib/memory/store";
import { generateTitle } from "@/lib/memory/title";
import { buildComparisonPacket } from "@/lib/research/comparison-packet";
import { runDeepResearch } from "@/lib/research/deep-research";
import { buildFollowupSuggestions } from "@/lib/research/followups";
import { buildConfidenceReason, buildResearchPacket, computeConfidence, type TieredSource } from "@/lib/research/packet";
import { buildPlannedResearchPacket, detectMultiPartResearchQuestion } from "@/lib/research/planner";
import { filterUsedSources } from "@/lib/research/source-attribution";
import { runSearchWithRetry, type SearchSource } from "@/lib/search/orchestrate";

const POLITICAL_CATEGORY_LABELS: Record<PoliticalIntent, string> = {
  political: "Researching",
  federal_legislation: "Researching federal legislation",
  state_legislation: "Researching state legislation",
  elections: "Researching the election",
  campaign_finance: "Checking campaign finance",
  supreme_court: "Researching Supreme Court records",
  state_courts: "Researching court records",
  constitution: "Researching constitutional text",
  budget: "Researching the budget",
  executive_branch: "Researching executive action",
  congress: "Researching Congress",
  governor: "Researching the governor's office",
  local_government: "Researching local government",
  regulations: "Researching regulations",
  history: "Researching",
  learning_mode: "Researching",
  deep_research: "Conducting deep research",
  comparison: "Comparing",
};

// Priority for picking ONE label when multiple intents matched -- display
// only, doesn't affect what actually gets retrieved (the packet uses the
// full matched set).
const LABEL_PRIORITY: PoliticalIntent[] = [
  "federal_legislation", "state_legislation", "campaign_finance", "elections",
  "supreme_court", "state_courts", "constitution", "budget", "executive_branch",
  "congress", "governor", "local_government", "regulations", "political",
];

function pickPrimaryIntent(intents: Set<PoliticalIntent>): PoliticalIntent {
  for (const intent of LABEL_PRIORITY) if (intents.has(intent)) return intent;
  return "political";
}

// The search phase (provider query + page fetches, now potentially run
// twice via runSearchWithRetry's automatic broaden-and-retry) must never be
// allowed to hang the response -- previously there was no ceiling at all
// beyond each individual fetch's own timeout, and those ran sequentially, so
// a slow provider or a handful of slow pages could stall the entire reply
// for a minute or more with the user seeing nothing but bouncing dots. 26s
// gives room for two sequential 11s search phases (see orchestrate.ts's
// SEARCH_PHASE_TIMEOUT_MS) plus provider-call overhead, so a retry actually
// gets to finish instead of being cut off mid-flight, while still leaving
// the model's own generation (FIRST_TOKEN_TIMEOUT_MS below) as a separate,
// later budget.
const SEARCH_TIMEOUT_MS = 26_000;
// From "start generating" to the first streamed token -- covers the case
// where the model call itself hangs (slow/stuck provider) even after the
// search phase's own timeout has already been accounted for. Once a single
// token has arrived the watchdog stands down; a long but ACTIVELY streaming
// answer is never cut off by this.
const FIRST_TOKEN_TIMEOUT_MS = 25_000;

class TimeoutError extends Error {}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

// Combines the request's own abort signal (client disconnected) with a
// timer that only fires if no token has arrived yet -- markFirstToken()
// disarms it permanently the moment real generation starts.
function createFirstTokenWatchdog(baseSignal: AbortSignal, ms: number) {
  const controller = new AbortController();
  const forwardAbort = () => controller.abort();
  baseSignal.addEventListener("abort", forwardAbort);
  let gotFirstToken = false;
  let timedOut = false;
  const timer = setTimeout(() => {
    if (!gotFirstToken) {
      timedOut = true;
      controller.abort();
    }
  }, ms);

  return {
    signal: controller.signal,
    markFirstToken: () => {
      if (!gotFirstToken) {
        gotFirstToken = true;
        clearTimeout(timer);
      }
    },
    didTimeOut: () => timedOut,
    cleanup: () => {
      clearTimeout(timer);
      baseSignal.removeEventListener("abort", forwardAbort);
    },
  };
}

const MAX_DOCUMENT_CONTEXT_LENGTH = 50_000;

// Document Intelligence Phase 1/2: folds an uploaded document's real,
// per-page (PDF) or per-line (DOCX/TXT/MD -- no real page concept) text
// into liveData. Every locator shown to the model -- a page number or a
// line number -- is real, taken directly from document_pages/document_chunks;
// there is no character-count estimation anywhere in this path. A document
// small enough to fit under the budget is shown in full (Phase 1 behavior
// -- simplest, no retrieval-precision risk). A larger document is too big
// to load whole, so Phase 2's chunked retrieval finds only the passages
// relevant to THIS specific question instead of silently truncating from
// the front the way Phase 1 alone would have. A document uploaded before
// Phase 1 existed (zero document_pages rows) falls back to the flat legacy
// text with an explicit instruction to never cite a page or line number
// for it -- private beta, so it's served as-is rather than backfilled;
// re-uploading gets it page-aware citations and retrieval both.
// Document Intelligence Phase 3: alongside the liveData text, every builder
// below also returns exactly which pages/line-ranges it actually showed
// the model -- the ground truth that verifyDocumentCitations checks the
// model's response against after generation (see the citation-verification
// call in the main POST handler). Null when there's nothing mechanically
// checkable (no document, or a legacy document with no real page/line data
// at all -- buildLegacyDocumentContext already instructs the model never
// to cite a locator for those).
interface DocumentContextResult {
  text: string;
  citationCheck: DocumentCitationContext | null;
}

async function buildDocumentContext(
  documentId: string,
  userId: string,
  query: string,
): Promise<DocumentContextResult | null> {
  const document = await getDocument(documentId, userId);
  if (!document) return null;

  const pages = await getDocumentPages(documentId, userId);
  if (pages.length === 0) {
    const text = await getDocumentText(documentId, userId);
    return text ? { text: buildLegacyDocumentContext(document, text), citationCheck: null } : null;
  }

  const totalLength = pages.reduce((sum, page) => sum + page.text.length, 0);
  if (totalLength <= MAX_DOCUMENT_CONTEXT_LENGTH) {
    return document.paginated
      ? buildPaginatedDocumentContext(document, pages)
      : buildLineNumberedDocumentContext(document, pages);
  }

  const result = await retrieveRelevantChunks({ type: "document", documentId }, userId, query);
  return buildRetrievedDocumentContext(document, result);
}

// Too large to load in full -- only the chunks retrieval found relevant to
// this specific question are shown. Each chunk's locator (page number, or
// line range for a non-paginated document) came straight from
// chunkDocument at upload time, which only ever splits along Phase 1's
// real page/line boundaries -- so it's exactly as trustworthy as the
// whole-document path's locators, just narrower in scope.
function buildRetrievedDocumentContext(document: StoredDocument, result: RetrievalResult): DocumentContextResult {
  // Chunks from a non-paginated document all carry pageNumber 1 (the
  // single document_pages row that format gets stored as -- see
  // chunk.ts) -- shownPages must stay empty for those, or a "page 1"
  // citation would wrongly validate for a document that should never be
  // cited by page at all.
  const citationCheck: DocumentCitationContext = {
    filename: document.filename,
    shownPages: document.paginated ? new Set(result.chunks.map((chunk) => chunk.pageNumber)) : new Set(),
    shownLineRanges: document.paginated
      ? []
      : result.chunks
          .filter((chunk): chunk is RetrievedChunk & { lineStart: number; lineEnd: number } => chunk.lineStart !== null)
          .map((chunk) => ({ start: chunk.lineStart, end: chunk.lineEnd })),
  };

  if (result.chunks.length === 0) {
    return {
      text:
        `Uploaded document "${document.filename}" is too large to load in full, and no relevant passages were ` +
        "found for this specific question via search. Say plainly that you couldn't find anything relevant to " +
        "this question in the document -- do not answer from general knowledge as if it came from the document.",
      citationCheck,
    };
  }

  const locatorLabel = (chunk: RetrievedChunk) =>
    document.paginated
      ? `Page ${chunk.pageNumber}`
      : chunk.lineStart !== null
        ? `Lines ${chunk.lineStart}-${chunk.lineEnd}`
        : document.filename;

  const body = result.chunks.map((chunk) => `--- ${locatorLabel(chunk)} ---\n${chunk.text}`).join("\n\n");

  const modeNote =
    result.mode === "exact"
      ? "These are ALL the passages in the document that literally match the search term -- if the user asked " +
        "for every mention/instance of something, this is the complete set of matches, not a sample."
      : "These are the passages retrieved as most relevant to this specific question -- not the whole " +
        "document. If what the user is asking about isn't actually covered by what's shown below, say plainly " +
        "that you couldn't find it in the retrieved excerpts rather than guessing; suggest a more specific " +
        "question if the answer might be elsewhere in the document.";

  const text = [
    `Uploaded document "${document.filename}" is too large to load in full, so the following excerpts were ` +
      "retrieved specifically for this question. Use ONLY this content to answer -- every locator below " +
      `(${document.paginated ? "page" : "line range"}) is real, taken directly from the source document. NEVER ` +
      "invent, estimate, or guess a page or line number -- only ever cite one shown in a marker below.",
    modeNote,
    body,
  ].join("\n\n");

  return { text, citationCheck };
}

function buildLegacyDocumentContext(document: StoredDocument, text: string): string {
  const truncated = text.length > MAX_DOCUMENT_CONTEXT_LENGTH;
  const excerpt = text.slice(0, MAX_DOCUMENT_CONTEXT_LENGTH);
  return [
    `Uploaded document "${document.filename}" -- use ONLY this content to answer questions about it. This ` +
      "document was uploaded before page-level citation support existed, so there is no real page or line " +
      "data for it -- NEVER cite a page number or line number for it, even if asked; cite only the document's " +
      "filename. If precise citations matter here, tell the user this specific document needs to be " +
      "re-uploaded to get them.",
    truncated
      ? `Only the first ${excerpt.length.toLocaleString()} of ${text.length.toLocaleString()} characters are ` +
        "shown below -- say plainly if the answer might be in the omitted portion rather than guessing."
      : "The complete document is shown below.",
    excerpt,
  ].join("\n\n");
}

// PDF -- pages[].pageNumber is a real page number extracted from the source
// file (see app/api/documents/route.ts's extractDocument). Pages are
// included whole, in order, up to the character budget -- never truncated
// mid-page, so every page the model sees is complete and its number is
// trustworthy.
function buildPaginatedDocumentContext(document: StoredDocument, pages: DocumentPage[]): DocumentContextResult {
  const included: DocumentPage[] = [];
  let remaining = MAX_DOCUMENT_CONTEXT_LENGTH;
  for (const page of pages) {
    if (remaining <= 0 && included.length > 0) break;
    included.push(page);
    remaining -= page.text.length;
  }
  const truncated = included.length < pages.length;
  const firstPage = included[0]?.pageNumber ?? 1;
  const lastPage = included[included.length - 1]?.pageNumber ?? firstPage;

  const body = included.map((page) => `--- Page ${page.pageNumber} ---\n${page.text}`).join("\n\n");

  const text = [
    `Uploaded document "${document.filename}" (${pages.length} pages) -- use ONLY this content to answer ` +
      "questions about it. Every page number below is REAL, extracted directly from the source PDF -- when " +
      "you cite a page, cite exactly the number shown in its \"--- Page N ---\" marker. NEVER invent, " +
      "estimate, or guess a page number from memory or by counting characters -- only ever cite a page number " +
      "you can actually see marked below. If a citation can't be tied to a specific marked page, don't state " +
      "one.",
    truncated
      ? `You can see pages ${firstPage}-${lastPage} of ${pages.length} total. If the user asks about content ` +
        `that might be on a page outside pages ${firstPage}-${lastPage}, say plainly that you can only see ` +
        "that range of this document rather than guessing at what a later page might say."
      : `The complete document (all ${pages.length} pages) is shown below.`,
    body,
  ].join("\n\n");

  return {
    text,
    citationCheck: {
      filename: document.filename,
      shownPages: new Set(included.map((page) => page.pageNumber)),
      shownLineRanges: [],
    },
  };
}

// DOCX/TXT/MD -- no real page concept (pagination is a property of how a
// word processor renders a file, not something stored in it; plain text
// has no pages at all), so pages here is always exactly one entry holding
// the whole document (see extractDocument's paginated: false branch). Line
// numbers are computed here, not stored, but the same principle as PDF
// page numbers applies: only ever show the model a real, checkable
// locator, never one it has to estimate.
function buildLineNumberedDocumentContext(document: StoredDocument, pages: DocumentPage[]): DocumentContextResult {
  const fullText = pages[0]?.text ?? "";
  const lines = fullText.split("\n");
  const totalLines = lines.length;

  let includedLineCount = 0;
  let charCount = 0;
  for (const line of lines) {
    if (charCount > MAX_DOCUMENT_CONTEXT_LENGTH && includedLineCount > 0) break;
    charCount += line.length + 1;
    includedLineCount += 1;
  }
  const truncated = includedLineCount < totalLines;

  const numbered = lines
    .slice(0, includedLineCount)
    .map((line, index) => `${index + 1}: ${line}`)
    .join("\n");

  const text = [
    `Uploaded document "${document.filename}" (${totalLines} lines) -- use ONLY this content to answer ` +
      "questions about it. This format has no real page numbers (DOCX/TXT/Markdown files aren't paginated) -- " +
      "NEVER cite a page number for it, even if asked. Instead cite the document's filename and, where a " +
      "specific passage matters, the real line number(s) shown at the start of each line below (e.g. \"lines " +
      "42-45\") -- never invent or estimate a line number that isn't actually shown.",
    truncated
      ? `You can see lines 1-${includedLineCount} of ${totalLines} total. If the user asks about content that ` +
        "might be further into the document, say plainly that you can only see the first portion rather than " +
        "guessing."
      : `The complete document (all ${totalLines} lines) is shown below.`,
    numbered,
  ].join("\n\n");

  return {
    text,
    citationCheck: {
      filename: document.filename,
      shownPages: new Set(),
      shownLineRanges: includedLineCount > 0 ? [{ start: 1, end: includedLineCount }] : [],
    },
  };
}

interface BudgetAnalysisContextResult {
  text: string;
  analysis: BudgetAnalysis;
}

// Document Intelligence Phase 4: extraction runs at most once per document
// (cached via hasAttemptedFinancialExtraction/financial_extraction_attempted
// -- most uploads aren't budget documents, so this only costs an extra LLM
// call the first time someone actually asks a budget-statistics question
// about a given document, not on every upload). Every number handed to the
// model below was computed in plain arithmetic from verified line items --
// never something the model is asked to calculate itself.
async function buildBudgetAnalysisContext(documentId: string, userId: string): Promise<BudgetAnalysisContextResult | null> {
  const document = await getDocument(documentId, userId);
  if (!document) return null;

  if (!(await hasAttemptedFinancialExtraction(documentId, userId))) {
    const pages = await getDocumentPages(documentId, userId);
    const items = pages.length > 0 ? await extractFinancialLineItems(pages, document.paginated, userId) : [];
    await saveFinancialLineItems(documentId, userId, items);
  }

  const items = await getFinancialLineItems(documentId, userId);
  if (items.length === 0) {
    return {
      text:
        `No specific budget or financial line items with a verifiable dollar amount could be extracted from ` +
        `"${document.filename}". Do NOT compute or state any financial statistics (percentages, totals, ` +
        "year-over-year changes, per-resident spending) for this document -- if asked, say plainly that this " +
        "document doesn't contain extractable structured financial data for that kind of analysis.",
      analysis: {
        categoryTotals: [],
        largestCategories: [],
        totalsByYear: [],
        yearOverYearChanges: [],
        biggestYearOverYearChanges: [],
        missingCategories: [],
        spendingPerResident: [],
      },
    };
  }

  const analysis = computeBudgetAnalysis(items);
  const fmt = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

  const lines: string[] = [];
  lines.push(`Verified financial line items extracted from "${document.filename}" (${items.length} items):`);
  for (const item of items) {
    lines.push(
      `- ${item.category}: ${fmt(item.amount)}${item.fiscalYear ? ` (${item.fiscalYear})` : ""}` +
        `${item.pageNumber ? ` [page ${item.pageNumber}]` : ""}`,
    );
  }

  lines.push("\nPRE-COMPUTED statistics (calculated in code from the line items above -- do not recompute, round differently, or alter any of these; only narrate them):");
  if (analysis.totalsByYear.length > 0) {
    lines.push("Totals by fiscal year:");
    for (const t of analysis.totalsByYear) lines.push(`- ${t.fiscalYear ?? "(year not stated)"}: ${fmt(t.total)}`);
  }
  if (analysis.largestCategories.length > 0) {
    lines.push("Largest categories:");
    for (const c of analysis.largestCategories) lines.push(`- ${c.category}${c.fiscalYear ? ` (${c.fiscalYear})` : ""}: ${fmt(c.amount)}`);
  }
  if (analysis.yearOverYearChanges.length > 0) {
    lines.push(`Year-over-year changes (${analysis.yearOverYearChanges[0].fromYear} -> ${analysis.yearOverYearChanges[0].toYear}):`);
    for (const c of analysis.yearOverYearChanges) {
      lines.push(
        `- ${c.category}: ${fmt(c.fromAmount)} -> ${fmt(c.toAmount)} (${c.dollarChange >= 0 ? "+" : ""}${fmt(c.dollarChange)}, ${c.percentChange >= 0 ? "+" : ""}${c.percentChange}%)`,
      );
    }
  } else if (analysis.totalsByYear.length > 2) {
    lines.push(
      "Year-over-year change was NOT computed: more than two fiscal years were found in the extracted data, " +
        "so which pair of years to compare is ambiguous -- do not compute or state a year-over-year percentage " +
        "yourself; ask the user which two years they want compared if that's what they need.",
    );
  }
  if (analysis.missingCategories.length > 0) {
    lines.push("Categories present in one year but missing in the other (documented gaps):");
    for (const m of analysis.missingCategories) {
      lines.push(`- ${m.category}: present in ${m.presentInYear}, not found in ${m.missingInYear}`);
    }
  }
  if (analysis.spendingPerResident.length > 0) {
    lines.push("Spending per resident (population figure was itself extracted from the document):");
    for (const s of analysis.spendingPerResident) {
      lines.push(`- ${s.fiscalYear ?? "(year not stated)"}: ${fmt(s.totalSpending)} / ${s.population.toLocaleString()} residents = ${fmt(s.perResident)} per resident`);
    }
  }

  lines.push(
    "\nStructure your answer with two clearly separated, exactly-headed sections. \"Objective Findings\" must " +
      "contain ONLY the numbers listed above, stated plainly with no evaluative language (no \"concerning,\" " +
      "\"significant,\" \"reflects,\" \"should\") -- verifiable math and extracted facts only, nothing you " +
      "computed yourself. Write every figure in full (e.g. \"$4,200,000\" and \"12%\", never abbreviated forms " +
      "like \"$4.2M\") so it can be mechanically checked against what was actually computed. \"Policy Analysis\" " +
      "comes after, clearly framed as interpretation -- possible explanations, pros, drawbacks, and competing " +
      "viewpoints, never presented as fact and never blended into Objective Findings. If a statistic the user " +
      "asked about wasn't computed above (e.g. it needs a comparison this data doesn't support), say so plainly " +
      "in Objective Findings rather than estimating it.",
  );

  return { text: lines.join("\n"), analysis };
}

// Document Intelligence Phase 5: "AI reads saved workspace contents
// automatically" -- when a conversation is happening inside a Political
// Workspace project and no single document was explicitly attached to
// this message, every document saved in that project is automatically
// available as context, retrieved dynamically (never loaded wholesale --
// an explicit Phase 5 requirement, since concatenating N whole documents
// would blow through the context budget the moment a workspace has more
// than a couple of files, exactly the problem Phase 2 already solved for
// one document). Built directly on Phase 2's retrieval layer via
// RetrievalScope's "workspace" case -- no new retrieval mechanism, just a
// wider scope for the existing one.
async function buildWorkspaceDocumentContext(
  projectId: string,
  userId: string,
  query: string,
): Promise<DocumentContextResult | null> {
  const documents = await listDocuments(projectId, userId);
  if (documents.length === 0) return null;

  const documentNames = documents.map((d) => d.filename).join(", ");
  const result = await retrieveRelevantChunks({ type: "workspace", projectId }, userId, query);

  if (result.chunks.length === 0) {
    return {
      text:
        `This workspace contains ${documents.length} document(s) (${documentNames}), but no passages relevant ` +
        "to this specific question were found via search across them. Say plainly that you couldn't find " +
        "anything relevant in the workspace's documents for this question -- do not answer from general " +
        "knowledge as if it came from one of them.",
      citationCheck: null,
    };
  }

  const locatorLabel = (chunk: RetrievedChunk) =>
    chunk.paginated
      ? `${chunk.filename}, Page ${chunk.pageNumber}`
      : chunk.lineStart !== null
        ? `${chunk.filename}, Lines ${chunk.lineStart}-${chunk.lineEnd}`
        : chunk.filename;

  const body = result.chunks.map((chunk) => `--- ${locatorLabel(chunk)} ---\n${chunk.text}`).join("\n\n");

  const modeNote =
    result.mode === "exact"
      ? "These are ALL the passages across this workspace's documents that literally match the search term -- " +
        "if the user asked for every mention/instance of something, this is the complete set of matches across " +
        "every document, not a sample."
      : "These are the passages retrieved as most relevant to this specific question across this workspace's " +
        "documents -- not the full contents of any of them. If what the user is asking about isn't actually " +
        "covered by what's shown below, say plainly that you couldn't find it rather than guessing.";

  const text = [
    `This Political Workspace contains ${documents.length} document(s): ${documentNames}. The following ` +
      "excerpts were automatically retrieved from across them for this specific question -- you never need the " +
      "user to manually attach or re-upload a document; every document saved in this workspace is available " +
      "context automatically. Use ONLY the content below to answer. Multiple documents are in play, so ALWAYS " +
      "name the specific filename alongside any page or line citation (e.g. \"page 12 of budget.pdf\", not just " +
      "\"page 12\") -- NEVER invent, estimate, or guess a locator, or attribute one to the wrong file; only " +
      "cite exactly what's shown in a marker below.",
    modeNote,
    body,
  ].join("\n\n");

  // One DocumentCitationContext per document actually shown, then merged --
  // the mechanical checker doesn't attribute a citation to a specific file
  // (see mergeDocumentCitationContexts), so this catches "cited a locator
  // never shown for ANY document this turn" rather than "right locator,
  // wrong file" specifically, which would need per-citation filename
  // parsing this project doesn't do.
  const byDocument = new Map<string, RetrievedChunk[]>();
  for (const chunk of result.chunks) {
    const list = byDocument.get(chunk.filename) ?? [];
    list.push(chunk);
    byDocument.set(chunk.filename, list);
  }
  const perDocumentContexts: DocumentCitationContext[] = Array.from(byDocument.entries()).map(([filename, chunks]) => {
    const paginated = chunks[0]?.paginated ?? false;
    return {
      filename,
      shownPages: paginated ? new Set(chunks.map((chunk) => chunk.pageNumber)) : new Set(),
      shownLineRanges: paginated
        ? []
        : chunks
            .filter((chunk): chunk is RetrievedChunk & { lineStart: number; lineEnd: number } => chunk.lineStart !== null)
            .map((chunk) => ({ start: chunk.lineStart, end: chunk.lineEnd })),
    };
  });

  return { text, citationCheck: mergeDocumentCitationContexts(perDocumentContexts, "the workspace's documents") };
}

// Deterministic (no LLM call) resolution of a short jurisdiction reply
// ("Illinois") following our own clarification question -- combines it with
// the original ambiguous question so intent/state detection re-run against
// the combined text ("Illinois HB 312"). Only the internal routing decision
// uses the combined text; the real message history sent to the model is
// untouched.
// detectJurisdiction's phrase-based check ("governor", "state senate", etc.)
// doesn't catch a bare state name, so "Illinois HB 312" alone silently falls
// back to its "federal" default. Once state_legislation intent is already
// confirmed (a state-shaped bill number matched), a named state alongside it
// really does mean state jurisdiction -- correct that one case without
// loosening jurisdiction detection for everything else (a federal bill that
// happens to mention a state for unrelated reasons should stay federal).
function resolveJurisdictionAndState(
  text: string,
  intents: Set<PoliticalIntent>,
): { jurisdiction: Jurisdiction; state: string | null } {
  const jurisdiction = detectJurisdiction(text);
  if (jurisdiction === "federal" && intents.has("state_legislation")) {
    const state = detectState(text);
    if (state) return { jurisdiction: "state", state };
  }
  return { jurisdiction, state: jurisdiction === "federal" ? null : detectState(text) };
}

const JURISDICTION_CLARIFICATION_MESSAGES = [JURISDICTION_CLARIFICATION_MESSAGE, LOCAL_JURISDICTION_CLARIFICATION_MESSAGE];

function resolveJurisdictionReply(text: string, messagesSnapshot: ChatMessage[]): string {
  const priorAssistant = messagesSnapshot[messagesSnapshot.length - 2];
  const originalQuestion = messagesSnapshot[messagesSnapshot.length - 3];
  if (
    priorAssistant?.role === "assistant" &&
    JURISDICTION_CLARIFICATION_MESSAGES.includes(priorAssistant.content.trim()) &&
    originalQuestion?.role === "user"
  ) {
    return `${text} ${originalQuestion.content}`;
  }
  return text;
}

interface RouteOutcome {
  category: string;
  label: string;
  liveDataParts: string[];
  sources?: (SearchSource | TieredSource)[];
  confidence?: "high" | "medium" | "low";
  confidenceReason?: string;
  followups?: string[];
  skipModel?: boolean;
  skipModelMessage?: string;
  maxTokens?: number;
  // True when this message was routed through a retrieval-grounded path
  // (political research, comparison, deep research, web search). For these,
  // previous conversation turns are stripped from the model's input so stale
  // facts from prior assistant responses cannot leak into the new answer.
  grounded: boolean;
  // The user's message text after query resolution (follow-up expansion,
  // jurisdiction reply resolution). Used as the sole user message when
  // context isolation is active, so short follow-ups like "what about Harris?"
  // are expanded into a standalone question before the conversation history
  // is removed.
  resolvedUserText: string;
  // Document Intelligence Phase 3: the real pages/line-ranges actually
  // shown to the model for the attached document this turn (if any) --
  // ground truth for verifyDocumentCitations, called after generation in
  // the main POST handler. Null when no document is attached, or the
  // attached document has no real page/line data to check against (a
  // legacy pre-Phase-1 upload).
  documentCitationCheck?: DocumentCitationContext | null;
  // Document Intelligence Phase 4: the computed budget statistics actually
  // handed to the model this turn (if a budget-analysis question was asked
  // against an attached document) -- ground truth for
  // verifyBudgetObjectiveFindings, called after generation alongside the
  // Phase 3 citation check. Null unless this specific turn triggered
  // budget analysis.
  budgetAnalysis?: BudgetAnalysis | null;
}

const DEEP_RESEARCH_MAX_TOKENS = 12000;

async function routeMessage(
  text: string,
  messagesSnapshot: ChatMessage[],
  webSearchEnabled: boolean,
  deepResearchEnabled: boolean,
  onStage: (label: string) => void,
  userId: string,
  categorySlug?: string,
  documentId?: string,
  projectId?: string,
): Promise<RouteOutcome> {
  text = resolveJurisdictionReply(text, messagesSnapshot);

  // Resolve short follow-ups into standalone queries for ALL paths -- not
  // just web search. This is a no-op (no LLM call) for non-short-follow-up
  // messages, but ensures the current user message is self-contained before
  // we strip conversation history for retrieval-grounded queries (context
  // isolation). Without this, a short follow-up like "what about Harris?"
  // would be sent to the model with no conversation context to resolve it.
  const { query: resolvedText } = await resolveFollowupTopic(text, messagesSnapshot, userId);
  text = resolvedText;

  const liveDataParts: string[] = [];

  // Research-page context (Phase 13) -- tells the model which domain the
  // user is in, regardless of which branch below actually handles the
  // message. A no-op when absent (ordinary dashboard/home chat).
  const categoryContext = categorySlug ? getResearchCategory(categorySlug)?.contextHint : undefined;
  if (categoryContext) liveDataParts.push(categoryContext);

  // Uploaded-document context (Phase 15) -- same unconditional-push pattern,
  // applies regardless of which branch below handles the message. `text` is
  // already query-resolved (resolveFollowupTopic above) -- the right thing
  // to hand to document retrieval too, so a short follow-up like "what
  // about the transportation section?" retrieves against its expanded form.
  // A single explicitly-attached document takes precedence over a
  // workspace's automatic context when both are present -- attaching one
  // specific document to a message is a more deliberate signal than just
  // being inside a project generally (Document Intelligence Phase 5: when
  // no specific document is attached but this conversation is happening
  // inside a Political Workspace project, every document saved in that
  // project becomes available context automatically, retrieved the same
  // dynamic way rather than loaded wholesale).
  const documentContext = documentId
    ? await buildDocumentContext(documentId, userId, text)
    : projectId
      ? await buildWorkspaceDocumentContext(projectId, userId, text)
      : null;
  if (documentContext) liveDataParts.push(documentContext.text);

  // Document Intelligence Phase 4: a budget-statistics question against an
  // attached document gets its own supplementary context, computed in code
  // from extracted line items -- never left to the model to calculate.
  const budgetAnalysis =
    documentId && wantsBudgetAnalysis(text) ? await buildBudgetAnalysisContext(documentId, userId) : null;
  if (budgetAnalysis) liveDataParts.push(budgetAnalysis.text);

  // Political Workspace project context -- a project's description is
  // permanent background for every AI response inside that project, not
  // just a label shown in the UI. Silently omitted if the project can't be
  // found (deleted, or doesn't belong to this user).
  if (projectId) {
    const project = await getProject(projectId, userId);
    if (project?.description.trim()) {
      liveDataParts.push(
        `Project context for "${project.name}" -- treat this as standing background for every question asked ` +
          `inside this workspace, not just this one message:\n\n${project.description.trim()}`,
      );
    }
  }

  if (isFastPathMessage(text)) {
    if (isSystemTestMessage(text)) liveDataParts.push(SYSTEM_TEST_GUIDANCE);
    return {
      category: "fast_path",
      label: CATEGORY_LABELS.fast_path,
      liveDataParts,
      grounded: false,
      resolvedUserText: text,
      documentCitationCheck: documentContext?.citationCheck ?? null,
      budgetAnalysis: budgetAnalysis?.analysis ?? null,
    };
  }

  const mathResult = runMathForMessage(text);
  if (mathResult.triggered && mathResult.success && mathResult.liveData) {
    liveDataParts.push(mathResult.liveData);
    if (detectCriticism(text)) liveDataParts.push(CRITICISM_GUIDANCE);
    if (detectLearningMode(text)) liveDataParts.push(buildLearningModeGuidance(text));
    return {
      category: "math",
      label: CATEGORY_LABELS.math,
      liveDataParts,
      grounded: false,
      resolvedUserText: text,
      documentCitationCheck: documentContext?.citationCheck ?? null,
      budgetAnalysis: budgetAnalysis?.analysis ?? null,
    };
  }

  const politicalIntents = classifyPoliticalIntents(text);

  // A bare state-shaped bill number ("HB 312") with no state named is
  // genuinely ambiguous -- every state numbers its bills starting from 1.
  // Ask rather than silently defaulting to federal (detectJurisdiction's
  // default), matching this project's anti-fabrication discipline.
  if (politicalIntents.has("state_legislation") && !detectState(text)) {
    return {
      category: "state_legislation",
      label: POLITICAL_CATEGORY_LABELS.state_legislation,
      liveDataParts,
      skipModel: true,
      skipModelMessage: JURISDICTION_CLARIFICATION_MESSAGE,
      grounded: true,
      resolvedUserText: text,
      documentCitationCheck: documentContext?.citationCheck ?? null,
      budgetAnalysis: budgetAnalysis?.analysis ?? null,
    };
  }

  // A bare local-office mention ("how do I run for mayor?") with no place
  // named anywhere in this message OR the recent conversation is genuinely
  // ambiguous -- there are thousands of mayors. A prompt instruction alone
  // wasn't reliably followed here in testing (the model would answer with a
  // generic national overview instead of asking), so this is enforced the
  // same deterministic way as the state-bill-number check above.
  if (politicalIntents.has("local_government") && !hasLocalPlaceHint(text)) {
    const recentConversationText = messagesSnapshot
      .slice(-6)
      .map((m) => m.content)
      .join(" ");
    if (!hasLocalPlaceHint(recentConversationText)) {
      return {
        category: "local_government",
        label: POLITICAL_CATEGORY_LABELS.local_government,
        liveDataParts,
        skipModel: true,
        skipModelMessage: LOCAL_JURISDICTION_CLARIFICATION_MESSAGE,
        grounded: true,
        resolvedUserText: text,
        documentCitationCheck: documentContext?.citationCheck ?? null,
        budgetAnalysis: budgetAnalysis?.analysis ?? null,
      };
    }
  }

  const wantsDeepResearch = deepResearchEnabled || politicalIntents.has("deep_research");

  if (wantsDeepResearch) {
    const { jurisdiction, state } = resolveJurisdictionAndState(text, politicalIntents);
    const packet = await runDeepResearch(text, politicalIntents, jurisdiction, state, onStage, userId);

    liveDataParts.push(packet.liveData);
    if (detectCriticism(text)) liveDataParts.push(CRITICISM_GUIDANCE);
    if (detectLearningMode(text)) liveDataParts.push(buildLearningModeGuidance(text));

    return {
      category: "deep_research",
      label: POLITICAL_CATEGORY_LABELS.deep_research,
      liveDataParts,
      sources: packet.sources,
      confidence: packet.confidence,
      confidenceReason: packet.confidenceReason,
      followups: buildFollowupSuggestions(politicalIntents),
      skipModel: requiresLiveData(text) && packet.confidence === "low",
      maxTokens: DEEP_RESEARCH_MAX_TOKENS,
      grounded: true,
      resolvedUserText: text,
      documentCitationCheck: documentContext?.citationCheck ?? null,
      budgetAnalysis: budgetAnalysis?.analysis ?? null,
    };
  }

  if (!wantsDeepResearch && politicalIntents.has("comparison") && isPoliticalQuestion(politicalIntents)) {
    const targets = extractComparisonTargets(text);
    if (targets) {
      const { jurisdiction, state } = resolveJurisdictionAndState(text, politicalIntents);
      const packet = await buildComparisonPacket(targets, politicalIntents, jurisdiction, state);

      liveDataParts.push(packet.liveData);
      if (detectCriticism(text)) liveDataParts.push(CRITICISM_GUIDANCE);
      if (detectLearningMode(text)) liveDataParts.push(buildLearningModeGuidance(text));

      return {
        category: "comparison",
        label: POLITICAL_CATEGORY_LABELS.comparison,
        liveDataParts,
        sources: packet.sources,
        confidence: packet.confidence,
        confidenceReason: packet.confidenceReason,
        followups: buildFollowupSuggestions(politicalIntents),
        skipModel: requiresLiveData(text) && packet.confidence === "low",
        grounded: true,
        resolvedUserText: text,
        documentCitationCheck: documentContext?.citationCheck ?? null,
        budgetAnalysis: budgetAnalysis?.analysis ?? null,
      };
    }
  }

  if (isPoliticalQuestion(politicalIntents)) {
    const { jurisdiction, state } = resolveJurisdictionAndState(text, politicalIntents);
    // A broad question naming several independent topics at once (e.g.
    // "Illinois housing laws, Illinois housing bills, federal housing
    // programs, court decisions, housing grants, and policy analysis") gets
    // decomposed into separate research tasks retrieved independently,
    // instead of one search blurring several unrelated topics together --
    // see lib/research/planner.ts. This is NOT the Pro-gated Deep Research
    // mode (a different, much longer report format); it's available to
    // every user as a retrieval-quality improvement for ordinary questions.
    const isMultiPart = detectMultiPartResearchQuestion(text);
    const packet = isMultiPart
      ? await buildPlannedResearchPacket(text, politicalIntents, jurisdiction, state, onStage, userId)
      : await buildResearchPacket(text, politicalIntents, jurisdiction, state);

    liveDataParts.push(packet.liveData);
    if (detectCriticism(text)) liveDataParts.push(CRITICISM_GUIDANCE);
    if (detectLearningMode(text)) liveDataParts.push(buildLearningModeGuidance(text));

    const primaryIntent = pickPrimaryIntent(politicalIntents);
    const label = isMultiPart
      ? "Researching multiple topics"
      : primaryIntent === "state_legislation" && state
        ? `Searching ${state} sources`
        : POLITICAL_CATEGORY_LABELS[primaryIntent];
    return {
      category: primaryIntent,
      label,
      liveDataParts,
      sources: packet.sources,
      confidence: packet.confidence,
      confidenceReason: packet.confidenceReason,
      followups: buildFollowupSuggestions(politicalIntents),
      // Never skip generation for the multi-part path -- graceful
      // degradation means writing the sections that DO have evidence even
      // when the overall/weakest confidence is low, not refusing the whole
      // response the way a single-topic low-confidence answer would.
      skipModel: !isMultiPart && requiresLiveData(text) && packet.confidence === "low",
      grounded: true,
      resolvedUserText: text,
      documentCitationCheck: documentContext?.citationCheck ?? null,
      budgetAnalysis: budgetAnalysis?.analysis ?? null,
    };
  }

  const category = classify(text);
  let label = CATEGORY_LABELS[category];
  let sources: SearchSource[] | undefined;

  const offline = detectOfflineRequest(text);
  const explicitOverride = detectExplicitSearchOverride(text);
  const needsLiveInfo =
    !offline && (detectRecencyNeed(text) || detectHistoricalVerificationNeed(text) || detectEntityLookupNeed(text));
  // Web Search enabled means PERMISSION to search, not an instruction to
  // search every message -- forcing a search on every turn (the old
  // `webSearchEnabled || autoSearch` behavior) is what produced irrelevant
  // "generic filler" answers for messages that never needed live data in
  // the first place (e.g. "2+2" or "explain the Constitution"). An explicit
  // ask ("search the web", "look this up") always searches regardless of
  // the toggle or the heuristic.
  const shouldSearch = !offline && (explicitOverride || needsLiveInfo);

  console.log(
    `[web-search] decision for "${text.slice(0, 120)}": ${shouldSearch ? "SEARCH" : "SKIP"} ` +
      `(webSearchEnabled=${webSearchEnabled}, explicitOverride=${explicitOverride}, needsLiveInfo=${needsLiveInfo}, offline=${offline})`,
  );

  if (shouldSearch) {
    label = CATEGORY_LABELS.web_search;
    // resolveFollowupTopic was already called at the top of routeMessage
    // for all paths -- the `text` variable is already query-resolved, so
    // we use it directly here instead of calling resolveFollowupTopic again.
    console.log(`[web-search] raw query sent to search provider: "${text}"`);

    let searchResult: Awaited<ReturnType<typeof runSearchWithRetry>>;
    try {
      searchResult = await withTimeout(
        runSearchWithRetry(text, needsLiveInfo ? 10 : 6, {
          preferRecent: detectRecencyNeed(text),
          onProgress: (update) => onStage(update.label),
        }),
        SEARCH_TIMEOUT_MS,
        "search",
      );
    } catch (err) {
      // Search genuinely timed out or threw unexpectedly -- this must never
      // hang the response. Log it, then fall through exactly like a normal
      // "search failed" outcome so the model still answers from its own
      // knowledge with a plain caveat, rather than the request stalling.
      console.error(`[web-search] search phase failed/timed out for "${text.slice(0, 120)}":`, err);
      searchResult = {
        success: false,
        retried: false,
        stillWeak: true,
        note: "Live web search is temporarily unavailable right now (it took too long to respond).",
      };
    }

    if (searchResult.success && searchResult.liveData) {
      liveDataParts.push(searchResult.liveData);
      sources = searchResult.sources;
      if (searchResult.stillWeak) {
        // Retrieval WAS retried with a broadened query (see runSearchWithRetry)
        // but still turned up no authoritative source and thin corroboration
        // -- the model gets whatever was found, but must be explicit about the
        // limitation and offer the user a choice instead of quietly presenting
        // weak evidence as if it were sufficient.
        liveDataParts.push(
          "Retrieval note: an initial search was performed, evaluated as insufficient (no authoritative " +
            "government or high-authority source, and thin corroboration), and automatically retried with a " +
            "broadened query -- this already happened, do not tell the user you're about to search again. The " +
            "results above are the best available after that retry, but still fall short of a strong evidentiary " +
            "basis. State plainly what you found and that it isn't strongly corroborated, then ask the user " +
            "whether they'd like your best general-knowledge answer instead (clearly labeled as unverified) -- " +
            "don't just present the weak results as if they were sufficient.",
        );
      }
    } else {
      // Never let the model fall back to "I don't have web browsing" when
      // Web Search actually ran -- state plainly that the search itself
      // came up empty/failed instead, which is the true situation.
      liveDataParts.push(
        (searchResult.note ?? "Web search ran but returned no usable results.") +
          (searchResult.retried ? " This was already retried once with a broadened query." : "") +
          " A web search WAS attempted for this message -- do not claim you lack web browsing capability, and " +
          "do not say something like \"I will run a search\" or \"let me check\" since that search (and its " +
          "retry, if one happened) has already happened and is done. Tell the user plainly, in past tense, that " +
          "live search didn't return usable results for this specific query even after retrying, then ask " +
          "whether they'd like your best general-knowledge answer instead, clearly labeled as unverified rather " +
          "than presented as freshly confirmed.",
      );
    }
  } else if (webSearchEnabled) {
    // Search is enabled for the conversation but this specific message
    // didn't need it -- make sure the model still knows live search is
    // available so it never claims otherwise if asked directly.
    liveDataParts.push(
      "Web Search mode is enabled for this conversation. This particular message didn't need a live search " +
        "(no recent/current-events signal detected), so none was run -- but never claim you lack web browsing " +
        "capability; a search will run automatically for messages that need current information.",
    );
  }

  if (detectCriticism(text)) liveDataParts.push(CRITICISM_GUIDANCE);
  if (detectLearningMode(text)) liveDataParts.push(buildLearningModeGuidance(text));

  return {
    category: shouldSearch ? "web_search" : category,
    label,
    liveDataParts,
    sources,
    grounded: shouldSearch,
    resolvedUserText: text,
    documentCitationCheck: documentContext?.citationCheck ?? null,
    budgetAnalysis: budgetAnalysis?.analysis ?? null,
  };
}

export const POST = withAuth(async (request, _ctx, user) => {
  const {
    messages: rawMessages,
    sessionId: requestedSessionId,
    webSearchEnabled,
    deepResearchEnabled,
    category: categorySlug,
    documentId,
    projectId,
    continuation,
  } = (await request.json()) as {
    messages?: ChatMessage[];
    sessionId?: string;
    webSearchEnabled?: boolean;
    deepResearchEnabled?: boolean;
    category?: string;
    documentId?: string;
    projectId?: string;
    continuation?: boolean;
  };

  if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
    return Response.json({ error: "No messages provided." }, { status: 400 });
  }

  // Defense in depth -- never trust extra fields (id, sources, confidence,
  // etc.) a client might send alongside role/content. This is what
  // actually matters for OpenAI's Responses API, which treats a present
  // `id` field on an input item as a reference to one of ITS OWN
  // "msg_*"-prefixed items and rejects anything else -- every provider
  // gets a plain {role, content} replay of history, never our own
  // internal message ids.
  const messages: ChatMessage[] = rawMessages.map((m) => ({ role: m.role, content: m.content }));

  // requireApprovedUser() (inside withAuth) already confirmed this account
  // is authenticated and approved -- this is the separate, AI-specific
  // check: does this approved user actually have a usable model configured
  // (their own OpenAI key in production, or Ollama in dev)?
  const provider = await getProvider(user.id);
  if (!(await provider.isConfigured())) {
    const error =
      provider.name === "cloud"
        ? "No cloud AI provider is configured for this deployment."
        : "Menahem's local model isn't available right now. Make sure Ollama is running and qwen3:8b is pulled.";
    return Response.json({ error }, { status: 503 });
  }

  const sessionId =
    requestedSessionId && isValidSessionId(requestedSessionId) ? requestedSessionId : randomUUID();

  const userMessage = messages[messages.length - 1];
  const existingSession = await loadSession(sessionId, user.id);
  const hadAssistantReply = existingSession?.messages.some((m) => m.role === "assistant") ?? false;

  // "Continue Report" (a message asking the model to resume its own
  // previous, truncated reply) isn't a real new user turn -- it's a
  // mechanical instruction the client appends only to prompt the model.
  // Persisting it as a visible chat bubble would clutter the conversation
  // with a synthetic message the user never actually typed.
  if (!continuation) {
    await appendMessage(sessionId, user.id, { role: "user", content: userMessage.content }, categorySlug);
  }

  const encoder = new TextEncoder();
  let assistantText = "";
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const writeFrame = (frame: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(frame)}\n`));
      };
      // Shared progress-frame emitter -- used by both Deep Research's own
      // stage callback and plain Web Search's per-source progress below.
      // `category` isn't consumed client-side (only `label` is displayed),
      // so this is purely a server-log/debugging label, not a behavior switch.
      const onStage = (label: string) => writeFrame({ type: "status", category: "progress", label });

      try {
        // ---- Subscription limit check: message count ----
        if (!continuation) {
          const messageCheck = await checkMessageLimit(user);
          if (!messageCheck.allowed) {
            writeFrame({
              type: "error",
              message: messageCheck.reason ?? "You've reached your message limit.",
              limit: {
                type: "messages",
                current: messageCheck.current,
                max: messageCheck.max,
                plan: messageCheck.plan,
              },
            });
            return;
          }
        }

        // ---- Subscription limit check: conversation count ----
        // Only for new conversations (not existing sessions being continued).
        if (!continuation && !existingSession) {
          const convCheck = await checkConversationLimit(user);
          if (!convCheck.allowed) {
            writeFrame({
              type: "error",
              message: convCheck.reason ?? "You've reached your conversation limit.",
              limit: {
                type: "conversations",
                current: convCheck.current,
                max: convCheck.max,
                plan: convCheck.plan,
              },
            });
            return;
          }
        }

        if (continuation) {
          // Plain continuation completion -- no re-classification or
          // research retrieval. The already-written text (now in `messages`
          // as the last assistant turn) carries whatever grounding it needs;
          // this just picks up where it left off.
          const fullMessages: ChatMessage[] = [
            { role: "system", content: await buildSystemPrompt(undefined, user.id) },
            ...messages,
          ];
          const watchdog = createFirstTokenWatchdog(request.signal, FIRST_TOKEN_TIMEOUT_MS);
          let truncated: boolean;
          try {
            ({ truncated } = await provider.streamChat(
              fullMessages,
              (piece) => {
                watchdog.markFirstToken();
                assistantText += piece;
                writeFrame({ type: "token", value: piece });
              },
              { signal: watchdog.signal },
            ));
          } catch (err) {
            if (watchdog.didTimeOut()) {
              console.error(`[chat] model call timed out after ${FIRST_TOKEN_TIMEOUT_MS}ms with no token (continuation)`);
              writeFrame({
                type: "error",
                message: "I'm having trouble retrieving a response right now. Please try again in a moment.",
              });
              return;
            }
            throw err;
          } finally {
            watchdog.cleanup();
          }

          const finalText = truncated ? trimToSentenceBoundary(assistantText) : assistantText;
          if (truncated) writeFrame({ type: "truncated", content: finalText });

          await appendToLastMessage(sessionId, user.id, finalText, { truncated });
          await touchEndTime(sessionId, user.id);
          return;
        }

        const {
          category,
          label,
          liveDataParts,
          sources,
          confidence,
          confidenceReason,
          followups,
          skipModel,
          skipModelMessage,
          maxTokens,
          grounded,
          resolvedUserText,
          documentCitationCheck,
          budgetAnalysis,
        } = await routeMessage(
          userMessage.content,
          messages,
          Boolean(webSearchEnabled),
          Boolean(deepResearchEnabled),
          onStage,
          user.id,
          categorySlug,
          documentId,
          projectId,
        );

        // The actual "citation referencing the uploaded document" (Phase 15) --
        // merged in regardless of which branch handled the message. Tagged
        // "always_keep" like a gov-data-provider source: a document Q&A
        // session is inherently about that document, so it's never subject
        // to the post-generation reference-match filter below.
        const documentSource = documentId ? await getDocument(documentId, user.id) : null;
        const allSources = documentSource
          ? [
              ...(sources ?? []),
              {
                title: documentSource.filename,
                url: `/api/documents/${documentSource.id}/file`,
                provenance: "always_keep" as const,
              },
            ]
          : sources;

        // Skip for web_search -- the real-time progress checklist emitted
        // during the search itself (onStage, above) already covered this;
        // writing it again here would just append a redundant "Searching
        // the web" line after "Generating response..." already appeared.
        if (category !== "web_search") writeFrame({ type: "status", category, label });
        if (followups && followups.length > 0) writeFrame({ type: "followups", suggestions: followups });
        // Sources and confidence are NOT sent yet -- the retrieval set is not
        // the same thing as "sources that actually support this response".
        // Both are recomputed from the generated text and sent once
        // generation finishes (see the source-attribution filtering below).

        // ---- Subscription limit check: Deep Research ----
        if (deepResearchEnabled) {
          const deepResearchCheck = await checkDeepResearch(user);
          if (!deepResearchCheck.allowed) {
            writeFrame({
              type: "error",
              message: deepResearchCheck.reason ?? "Deep Research is a Pro feature.",
              limit: { type: "deep_research", plan: deepResearchCheck.plan },
            });
            return;
          }
        }

        // ---- Increment message counter (only for real model calls) ----
        if (!skipModel) {
          await incrementMessageCount(user.id);
        }

        let truncated = false;
        if (skipModel) {
          assistantText = skipModelMessage ?? VERIFICATION_FAILED_MESSAGE;
          writeFrame({ type: "token", value: assistantText });
        } else {
          const liveData = liveDataParts.length ? liveDataParts.join("\n\n---\n\n") : undefined;
          const systemPrompt = await buildSystemPrompt(liveData, user.id);

          // CONTEXT ISOLATION: for retrieval-grounded messages, the model
          // receives ONLY the system prompt (with live data) and the current
          // user message -- no previous conversation turns. This is the
          // primary fix for the grounding bug: previous assistant responses
          // (which may contain factual claims from prior retrievals) are
          // physically absent from the model's input, so they cannot leak
          // into the new answer.
          //
          // For non-grounded messages (fast path, math, casual conversation),
          // the full conversation history is preserved so the model can
          // maintain conversational context.
          const fullMessages: ChatMessage[] = buildModelMessages(
            grounded,
            systemPrompt,
            messages,
            resolvedUserText,
          );

          console.log(
            `[grounding] category="${category}" grounded=${grounded} ` +
              `messages_sent_to_model=${fullMessages.length} ` +
              `(isolated=${grounded ? "YES -- only system + current user message" : "NO -- full history"})`,
          );
          console.log(
            `[web-search] final system prompt sent to model (${systemPrompt.length} chars). Live data section:\n` +
              (liveData ?? "(none)"),
          );
          const watchdog = createFirstTokenWatchdog(request.signal, FIRST_TOKEN_TIMEOUT_MS);
          try {
            const result = await provider.streamChat(
              fullMessages,
              (piece) => {
                watchdog.markFirstToken();
                assistantText += piece;
                writeFrame({ type: "token", value: piece });
              },
              { signal: watchdog.signal, maxTokens },
            );
            truncated = result.truncated;
          } catch (err) {
            if (watchdog.didTimeOut()) {
              console.error(`[chat] model call timed out after ${FIRST_TOKEN_TIMEOUT_MS}ms with no token`);
              writeFrame({
                type: "error",
                message: "I'm having trouble retrieving a response right now. Please try again in a moment.",
              });
              return;
            }
            throw err;
          } finally {
            watchdog.cleanup();
          }
        }

        if (truncated) {
          assistantText = trimToSentenceBoundary(assistantText);
          writeFrame({ type: "truncated", content: assistantText });
        }

        // EVIDENCE VALIDATION: post-generation pass that checks the response
        // against retrieved sources. If the response makes claims without
        // any sources to back them, a grounding notice is appended.
        const liveData = liveDataParts.length ? liveDataParts.join("\n\n---\n\n") : undefined;
        const { response: validatedText, issues } = performValidationPass(
          assistantText,
          allSources ?? [],
          liveData,
        );
        if (issues.length > 0) {
          console.warn(
            `[grounding] validation issues for category="${category}": ` +
              issues.map((i) => `${i.type}: ${i.detail}`).join("; "),
          );
        }
        assistantText = validatedText;

        // DOCUMENT CITATION VERIFICATION (Phase 3): a page/line number the
        // model cites for an uploaded document must be one it could
        // actually have seen this turn -- checked mechanically against
        // documentCitationCheck's real shown-pages/shown-line-ranges
        // (built alongside the document context itself, see
        // buildDocumentContext), never trusted from the model's own
        // claim. An unverifiable citation gets an honest notice appended,
        // the same pattern as the evidence-validation pass above, rather
        // than silently left standing as if it had been confirmed.
        if (documentCitationCheck) {
          const citationIssues = verifyDocumentCitations(assistantText, documentCitationCheck);
          if (citationIssues.length > 0) {
            console.warn(
              `[document-citations] unverified citations for "${documentCitationCheck.filename}": ` +
                citationIssues.map((i) => `${i.type}: ${i.detail}`).join("; "),
            );
            const hasPageIssue = citationIssues.some((i) => i.type === "unverified_page");
            const hasLineIssue = citationIssues.some((i) => i.type === "unverified_line");
            const locatorWord = hasPageIssue && hasLineIssue ? "page or line" : hasPageIssue ? "page" : "line";
            const notice =
              `\n\nNote: this response cited a ${locatorWord} number for "${documentCitationCheck.filename}" ` +
              "that could not be mechanically verified against what was actually retrieved for this question -- " +
              "treat that specific citation with caution.";
            if (!assistantText.includes(notice.trim())) {
              assistantText = assistantText.trimEnd() + notice;
            }
          }
        }

        // BUDGET ANALYSIS VERIFICATION (Phase 4): any number the model
        // wrote in the "Objective Findings" section must match one it was
        // actually given (computed in code from verified line items, see
        // buildBudgetAnalysisContext) -- never something the model
        // calculated or misremembered itself. Same mechanical-check-not-
        // just-a-prompt pattern as Phase 3.
        if (budgetAnalysis) {
          const budgetIssues = verifyBudgetObjectiveFindings(assistantText, budgetAnalysis);
          if (budgetIssues.length > 0) {
            console.warn(
              `[budget-verification] unverified objective figures: ` +
                budgetIssues.map((i) => `${i.type}: ${i.detail}`).join("; "),
            );
            const notice =
              "\n\nNote: this response's Objective Findings included a number that could not be mechanically " +
              "verified against the figures actually computed from this document -- treat that specific figure " +
              "with caution.";
            if (!assistantText.includes(notice.trim())) {
              assistantText = assistantText.trimEnd() + notice;
            }
          }
        }

        // SOURCE ATTRIBUTION: Sources, Evidence Strength, and inline
        // citations must all reference the same, generation-validated set --
        // never the raw retrieval set, which routinely includes tangentially
        // related pages the model never actually drew on. A source is kept
        // only if it's "always_keep" (a gov-data-provider record or the
        // uploaded document -- known to have informed the response
        // regardless of whether it's named in prose) or if the final text
        // actually references it (by URL, hostname, or title).
        const usedSources = filterUsedSources(assistantText, allSources ?? []);

        // Confidence was computed against the full retrieval set before
        // generation; recompute it against what was actually used so the
        // Evidence Strength panel can never claim stronger backing than the
        // Sources list it's displayed alongside. Only applies to the
        // packet-based paths (political/deep-research/comparison) that set
        // `confidence` in the first place -- plain web search never did.
        let finalConfidence = confidence;
        let finalConfidenceReason = confidenceReason;
        if (confidence) {
          const usedTiered = usedSources as TieredSource[];
          const directGovHit = usedTiered.some((s) => s.provenance === "always_keep" && s.tier === "government");
          finalConfidence = computeConfidence(usedTiered, directGovHit);
          finalConfidenceReason = buildConfidenceReason(finalConfidence, usedTiered, directGovHit);
        }

        if (usedSources.length > 0) writeFrame({ type: "sources", sources: usedSources });
        if (finalConfidence) writeFrame({ type: "confidence", level: finalConfidence, reason: finalConfidenceReason });

        await appendMessage(sessionId, user.id, {
          role: "assistant",
          content: assistantText,
          sources: usedSources,
          confidence: finalConfidence,
          confidenceReason: finalConfidenceReason,
          truncated,
        });
        await touchEndTime(sessionId, user.id);

        if (!hadAssistantReply) {
          after(async () => {
            const session = await loadSession(sessionId, user.id);
            if (!session) return;
            const title = await generateTitle(session.messages, user.id);
            await renameSession(sessionId, user.id, title);
          });
        }
      } catch (err) {
        writeFrame({
          type: "error",
          message: err instanceof Error ? err.message : "Something went wrong.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "X-Session-Id": sessionId,
    },
  });
});
