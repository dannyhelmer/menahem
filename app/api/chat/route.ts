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
import { getDocument, getDocumentText } from "@/lib/documents/store";
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
import { buildResearchPacket, type TieredSource } from "@/lib/research/packet";
import { runSearchForMessage, type SearchSource } from "@/lib/search/orchestrate";

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

// The search phase (provider query + page fetches) must never be allowed to
// hang the response -- previously there was no ceiling at all beyond each
// individual fetch's own timeout, and those ran sequentially, so a slow
// provider or a handful of slow pages could stall the entire reply for a
// minute or more with the user seeing nothing but bouncing dots. 18s leaves
// headroom under the requested 20-30s total budget for the model's own
// generation to still start in time.
const SEARCH_TIMEOUT_MS = 18_000;
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

// Phase 15: folds an uploaded document's real, extracted text into liveData
// -- capped so a long PDF can't crowd out the rest of the context window.
// Never pretends to have read more than what's actually shown.
// For large documents (100+ pages), the text is chunked with page markers
// so citations can reference the correct section, and the model is told
// the total document length so it knows how much was omitted.
async function buildDocumentContext(documentId: string, userId: string): Promise<string | null> {
  const [document, text] = await Promise.all([getDocument(documentId, userId), getDocumentText(documentId, userId)]);
  if (!document || !text) return null;

  const totalLength = text.length;
  const excerpt = text.slice(0, MAX_DOCUMENT_CONTEXT_LENGTH);
  const truncated = excerpt.length < totalLength;

  // Insert page markers every ~3000 characters (roughly one page of text)
  // so the model can reference approximate page locations in citations.
  // [\s\S] (not a bare `.`) is required -- `.` doesn't match newlines, so
  // this would never actually fire on real extracted PDF text (which is
  // full of line breaks), silently disabling page markers entirely.
  const chunked = excerpt.replace(/([\s\S]{3000})/g, "$1\n[--- page break ---]\n");

  return [
    `Uploaded document "${document.filename}" -- use ONLY this content to answer questions about it, cite it by ` +
      "filename, and say plainly if it doesn't contain the answer rather than guessing." +
      (truncated
        ? ` This document is ${totalLength.toLocaleString()} characters total; only the first ${excerpt.length.toLocaleString()} characters are shown below. If the user asks about content that might be in the omitted portion, say plainly that you can only see the first portion of the document.`
        : " The complete document is shown below."),
    "Page breaks are marked with [--- page break ---] -- use these to reference approximate locations when citing.",
    chunked,
  ].join("\n\n");
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
  // applies regardless of which branch below handles the message.
  const documentContext = documentId ? await buildDocumentContext(documentId, userId) : null;
  if (documentContext) liveDataParts.push(documentContext);

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
      };
    }
  }

  if (isPoliticalQuestion(politicalIntents)) {
    const { jurisdiction, state } = resolveJurisdictionAndState(text, politicalIntents);
    const packet = await buildResearchPacket(text, politicalIntents, jurisdiction, state);

    liveDataParts.push(packet.liveData);
    if (detectCriticism(text)) liveDataParts.push(CRITICISM_GUIDANCE);
    if (detectLearningMode(text)) liveDataParts.push(buildLearningModeGuidance(text));

    const primaryIntent = pickPrimaryIntent(politicalIntents);
    const label =
      primaryIntent === "state_legislation" && state
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
      skipModel: requiresLiveData(text) && packet.confidence === "low",
      grounded: true,
      resolvedUserText: text,
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

    let searchResult: Awaited<ReturnType<typeof runSearchForMessage>>;
    try {
      searchResult = await withTimeout(
        runSearchForMessage(text, needsLiveInfo ? 10 : 6, {
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
        note: "Live web search is temporarily unavailable right now (it took too long to respond).",
      };
    }

    if (searchResult.success && searchResult.liveData) {
      liveDataParts.push(searchResult.liveData);
      sources = searchResult.sources;
    } else {
      // Never let the model fall back to "I don't have web browsing" when
      // Web Search actually ran -- state plainly that the search itself
      // came up empty/failed instead, which is the true situation.
      liveDataParts.push(
        (searchResult.note ?? "Web search ran but returned no usable results.") +
          " A web search WAS attempted for this message -- do not claim you lack web browsing capability, and " +
          "do not say something like \"I will run a search\" or \"let me check\" since that search has already " +
          "happened and is done. Tell the user plainly, in past tense, that live search is temporarily " +
          "unavailable or didn't return relevant results for this specific query, then answer from your " +
          "existing knowledge, clearly labeled as such rather than presented as freshly verified.",
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
        // merged in regardless of which branch handled the message.
        const documentSource = documentId ? await getDocument(documentId, user.id) : null;
        const allSources = documentSource
          ? [...(sources ?? []), { title: documentSource.filename, url: `/api/documents/${documentSource.id}/file` }]
          : sources;

        // Skip for web_search -- the real-time progress checklist emitted
        // during the search itself (onStage, above) already covered this;
        // writing it again here would just append a redundant "Searching
        // the web" line after "Generating response..." already appeared.
        if (category !== "web_search") writeFrame({ type: "status", category, label });
        if (allSources && allSources.length > 0) writeFrame({ type: "sources", sources: allSources });
        if (confidence) writeFrame({ type: "confidence", level: confidence, reason: confidenceReason });
        if (followups && followups.length > 0) writeFrame({ type: "followups", suggestions: followups });

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

        await appendMessage(sessionId, user.id, {
          role: "assistant",
          content: assistantText,
          sources: allSources,
          confidence,
          confidenceReason,
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
