import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { getProvider } from "@/lib/ai/get-provider";
import { buildSystemPrompt } from "@/lib/ai/system-prompt";
import type { ChatMessage } from "@/lib/ai/types";
import { withAuth } from "@/lib/auth/with-auth";
import { resolveFollowupTopic } from "@/lib/intelligence/conversation-manager";
import { CRITICISM_GUIDANCE, detectCriticism } from "@/lib/intelligence/criticism";
import { isFastPathMessage, isSystemTestMessage, SYSTEM_TEST_GUIDANCE } from "@/lib/intelligence/fast-path";
import {
  detectJurisdiction,
  detectState,
  JURISDICTION_CLARIFICATION_MESSAGE,
  type Jurisdiction,
} from "@/lib/intelligence/jurisdiction";
import { runMathForMessage } from "@/lib/intelligence/math-tool";
import { extractComparisonTargets } from "@/lib/intelligence/comparison-targets";
import { buildLearningModeGuidance, detectLearningMode } from "@/lib/intelligence/learning-mode";
import { classifyPoliticalIntents, isPoliticalQuestion, type PoliticalIntent } from "@/lib/intelligence/political-intent";
import { requiresLiveData, VERIFICATION_FAILED_MESSAGE } from "@/lib/intelligence/requires-live-data";
import { CATEGORY_LABELS, classify } from "@/lib/intelligence/task-classifier";
import { getDocument, getDocumentText } from "@/lib/documents/store";
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

const MAX_DOCUMENT_CONTEXT_LENGTH = 12_000;

// Phase 15: folds an uploaded document's real, extracted text into liveData
// -- capped so a long PDF can't crowd out the rest of the context window.
// Never pretends to have read more than what's actually shown.
async function buildDocumentContext(documentId: string, userId: string): Promise<string | null> {
  const [document, text] = await Promise.all([getDocument(documentId, userId), getDocumentText(documentId, userId)]);
  if (!document || !text) return null;

  const excerpt = text.slice(0, MAX_DOCUMENT_CONTEXT_LENGTH);
  const truncated = excerpt.length < text.length;
  return [
    `Uploaded document "${document.filename}" -- use ONLY this content to answer questions about it, cite it by ` +
      "filename, and say plainly if it doesn't contain the answer rather than guessing." +
      (truncated ? " Only the first portion of this document is shown below." : ""),
    excerpt,
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

function resolveJurisdictionReply(text: string, messagesSnapshot: ChatMessage[]): string {
  const priorAssistant = messagesSnapshot[messagesSnapshot.length - 2];
  const originalQuestion = messagesSnapshot[messagesSnapshot.length - 3];
  if (
    priorAssistant?.role === "assistant" &&
    priorAssistant.content.trim() === JURISDICTION_CLARIFICATION_MESSAGE &&
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
}

const DEEP_RESEARCH_MAX_TOKENS = 6000;

async function routeMessage(
  text: string,
  messagesSnapshot: ChatMessage[],
  webSearchEnabled: boolean,
  deepResearchEnabled: boolean,
  onStage: (label: string) => void,
  userId: string,
  categorySlug?: string,
  documentId?: string,
): Promise<RouteOutcome> {
  text = resolveJurisdictionReply(text, messagesSnapshot);
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

  if (isFastPathMessage(text)) {
    if (isSystemTestMessage(text)) liveDataParts.push(SYSTEM_TEST_GUIDANCE);
    return { category: "fast_path", label: CATEGORY_LABELS.fast_path, liveDataParts };
  }

  const mathResult = runMathForMessage(text);
  if (mathResult.triggered && mathResult.success && mathResult.liveData) {
    liveDataParts.push(mathResult.liveData);
    if (detectCriticism(text)) liveDataParts.push(CRITICISM_GUIDANCE);
    if (detectLearningMode(text)) liveDataParts.push(buildLearningModeGuidance(text));
    return { category: "math", label: CATEGORY_LABELS.math, liveDataParts };
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
    };
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
    // resolveFollowupTopic no-ops internally (no LLM call) unless the
    // message actually looks like a short follow-up or a reply to a
    // clarifying question -- always safe to call.
    const { query } = await resolveFollowupTopic(text, messagesSnapshot, userId);
    console.log(`[web-search] raw query sent to search provider: "${query}"`);

    const searchResult = await runSearchForMessage(query, needsLiveInfo ? 10 : 6, {
      preferRecent: detectRecencyNeed(text),
    });
    if (searchResult.success && searchResult.liveData) {
      liveDataParts.push(searchResult.liveData);
      sources = searchResult.sources;
    } else {
      // Never let the model fall back to "I don't have web browsing" when
      // Web Search actually ran -- state plainly that the search itself
      // came up empty/failed instead, which is the true situation.
      liveDataParts.push(
        (searchResult.note ?? "Web search ran but returned no usable results.") +
          " A web search WAS attempted for this message -- do not claim you lack web browsing capability. " +
          "Instead, tell the user plainly that the search didn't return relevant current results for this " +
          "specific query, and answer from general knowledge only if you clearly label it as such.",
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

  return { category: shouldSearch ? "web_search" : category, label, liveDataParts, sources };
}

export const POST = withAuth(async (request, _ctx, user) => {
  const {
    messages: rawMessages,
    sessionId: requestedSessionId,
    webSearchEnabled,
    deepResearchEnabled,
    category: categorySlug,
    documentId,
    continuation,
  } = (await request.json()) as {
    messages?: ChatMessage[];
    sessionId?: string;
    webSearchEnabled?: boolean;
    deepResearchEnabled?: boolean;
    category?: string;
    documentId?: string;
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
      const onStage = (label: string) => writeFrame({ type: "status", category: "deep_research", label });

      try {
        if (continuation) {
          // Plain continuation completion -- no re-classification or
          // research retrieval. The already-written text (now in `messages`
          // as the last assistant turn) carries whatever grounding it needs;
          // this just picks up where it left off.
          const fullMessages: ChatMessage[] = [
            { role: "system", content: await buildSystemPrompt(undefined, user.id) },
            ...messages,
          ];
          const { truncated } = await provider.streamChat(
            fullMessages,
            (piece) => {
              assistantText += piece;
              writeFrame({ type: "token", value: piece });
            },
            { signal: request.signal },
          );

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
        } = await routeMessage(
          userMessage.content,
          messages,
          Boolean(webSearchEnabled),
          Boolean(deepResearchEnabled),
          onStage,
          user.id,
          categorySlug,
          documentId,
        );

        // The actual "citation referencing the uploaded document" (Phase 15) --
        // merged in regardless of which branch handled the message.
        const documentSource = documentId ? await getDocument(documentId, user.id) : null;
        const allSources = documentSource
          ? [...(sources ?? []), { title: documentSource.filename, url: `/api/documents/${documentSource.id}/file` }]
          : sources;

        writeFrame({ type: "status", category, label });
        if (allSources && allSources.length > 0) writeFrame({ type: "sources", sources: allSources });
        if (confidence) writeFrame({ type: "confidence", level: confidence, reason: confidenceReason });
        if (followups && followups.length > 0) writeFrame({ type: "followups", suggestions: followups });

        let truncated = false;
        if (skipModel) {
          assistantText = skipModelMessage ?? VERIFICATION_FAILED_MESSAGE;
          writeFrame({ type: "token", value: assistantText });
        } else {
          const liveData = liveDataParts.length ? liveDataParts.join("\n\n---\n\n") : undefined;
          const systemPrompt = await buildSystemPrompt(liveData, user.id);
          const fullMessages: ChatMessage[] = [{ role: "system", content: systemPrompt }, ...messages];
          console.log(
            `[web-search] final system prompt sent to model (${systemPrompt.length} chars). Live data section:\n` +
              (liveData ?? "(none)"),
          );
          const result = await provider.streamChat(
            fullMessages,
            (piece) => {
              assistantText += piece;
              writeFrame({ type: "token", value: piece });
            },
            { signal: request.signal, maxTokens },
          );
          truncated = result.truncated;
        }

        if (truncated) {
          assistantText = trimToSentenceBoundary(assistantText);
          writeFrame({ type: "truncated", content: assistantText });
        }

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
