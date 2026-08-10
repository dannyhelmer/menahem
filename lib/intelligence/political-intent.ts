// Multi-label political/government intent classification -- deterministic
// regex, no LLM call, matching this project's established routing
// philosophy (see task-classifier.ts/fast-path.ts/web-search-intent.ts).
// A question can match several intents at once (e.g. "Explain Illinois HB
// 4217 and compare it to federal law" matches both state_legislation and
// federal_legislation) -- callers get the full matched set, not one label.
import { detectHistoricalVerificationNeed } from "./web-search-intent";
import { detectState, LOCAL_LEVEL_RE } from "./jurisdiction";
import { LEARNING_MODE_RE } from "./learning-mode";

export type PoliticalIntent =
  | "political"
  | "federal_legislation"
  | "state_legislation"
  | "elections"
  | "campaign_finance"
  | "supreme_court"
  | "state_courts"
  | "constitution"
  | "budget"
  | "executive_branch"
  | "congress"
  | "governor"
  | "local_government"
  | "regulations"
  | "history"
  | "learning_mode"
  | "deep_research"
  | "comparison";

const FEDERAL_BILL_RE = /\b(h\.?\s?r\.?|h\.?\s?res\.?|h\.?\s?j\.?\s?res\.?|h\.?\s?con\.?\s?res\.?|s\.?\s?res\.?|s\.?\s?j\.?\s?res\.?|s\.?\s?con\.?\s?res\.?|s\.?)\s*\d+\b/i;
const STATE_BILL_RE = /\b(?:[hs]\.?\s?b\.?\s?\d+|house bill \d+|senate bill \d+)\b/i;

const FEDERAL_LEGISLATION_RE = /\bfederal (law|legislation|bill|statute)\b|\bact of congress\b|\bcongress passed\b/i;
const STATE_LEGISLATION_RE = /\bstate (law|legislation|bill|statute)\b|\bstate legislature\b/i;

// Confirmed gap: a bare statute citation ("740 ILCS 14", "18 U.S.C. 1030",
// "45 CFR 164.502") names a specific legal document but uses none of the
// literal words this classifier otherwise keys on ("law," "statute,"
// "bill," "act"). "What does 740 ILCS 14 require of private entities
// collecting biometric data?" matched NO intent at all, so the question
// never reached the government-research pipeline -- not a citation-
// attachment or rendering failure, but a routing failure: retrieval,
// ranking, and citation-attachment never ran, so there was nothing to
// attach. The model answered from its own training knowledge with zero
// sourcing, zero citation, zero confidence rating. ILCS is Illinois-
// specific (state); U.S.C./CFR are federal. Same pattern already used by
// lib/search/canonical-source.ts's STATUTE_CITATION_RE for a different
// purpose (identifying the canonical document to retrieve) -- duplicated
// here as a self-contained local constant rather than imported, matching
// this file's existing convention of not depending on lib/search from
// lib/intelligence (intent classification runs before any search does).
const STATE_STATUTE_CITATION_RE = /\b\d+\s*ILCS\s*(?:[§#]|sec\.?)?\s*\d+(?:[.\-]\d+)*\b/i;
const FEDERAL_STATUTE_CITATION_RE = /\b\d+\s*(?:U\.?S\.?C\.?|CFR)\s*(?:[§#]|sec\.?)?\s*\d+(?:[.\-]\d+)*\b/i;

// Catches a specific law referenced by its common capitalized name (e.g.
// "the Live Local Act", "the Inflation Reduction Act", "the Affordable Care
// Act") -- a huge share of real questions name a law this way rather than
// citing a bill number or using the literal phrase "state law"/"federal
// law". Without this, such a question falls through to the generic
// web-search path and skips the whole legislative-response pipeline
// (structured header, source hierarchy, Verification, Research Confidence,
// gov-data-provider retrieval) entirely, even though it's squarely a
// legislation question.
const NAMED_ACT_RE = /\b(?:[A-Z][a-zA-Z'.]*\s+){1,6}Act\b/;
const ELECTIONS_RE = /\belections?\b|\brunning for\b|\bcandidates?\b|\bballots?\b|\bprimary election\b|\bpolling\b|\bvoters?\b/i;
const CAMPAIGN_FINANCE_RE =
  /\b(campaign finance|campaign contribution\w*|donor\w*|donat\w*|cash on hand|money raised|total raised|fundrais\w*|pac (money|contribution\w*|donation\w*|support)|independent expenditure\w*|who('?s| is) funding|financial disclosure\w*)\b/i;
const SUPREME_COURT_RE = /\bsupreme court\b|\bscotus\b|\b\d+\s+u\.?s\.?\s+\d+\b/i;
const STATE_COURTS_RE = /\bstate supreme court\b|\bcourt of appeals\b|\bappellate court\b|\bstate court\w*\b/i;
const CONSTITUTION_RE =
  /\bconstitution\w*\b|\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|\d+(st|nd|rd|th))\s+amendment\b|\bbill of rights\b|\barticle (i|ii|iii|iv|v|vi|vii)\b/i;
const BUDGET_RE = /\bbudget\w*\b|\bappropriations?\b|\bspending bill\b|\bdeficit\w*\b/i;
const EXECUTIVE_BRANCH_RE = /\bpresident\w*\b|\bexecutive order\w*\b|\badministration\b|\bcabinet\b|\bwhite house\b/i;
const CONGRESS_RE = /\bcongress\w*\b|\bsenate\b|\bsenators?\b|\bhouse of representatives\b|\brepresentatives?\b|\blegislat\w*\b/i;
const GOVERNOR_RE = /\bgovernors?\b/i;
const REGULATIONS_RE = /\bregulations?\b|\brule[- ]?making\b|\bfederal register\b|\bagency rule\w*\b|\badministrative rule\w*\b/i;
const DEEP_RESEARCH_RE = /\bdeep research\b|\bthorough research\b|\bcomprehensive report\b|\bin-?depth analysis\b|\bfull briefing\b|\bdossier\b/i;
const COMPARISON_RE =
  /\bcompar(?:e|ing|ison)\b|\bversus\b|\bvs\.?\b|\bdifference between\b|\bwhich (?:one )?is (?:better|worse|stronger|more)\b/i;

// Confirmed gap: "Compare the five strongest state consumer privacy laws"
// matched NONE of the phrases below -- "law(s)"/"statute(s)" bare were
// missing entirely (every other legal-record word here already has some
// form: bills?, legislat\w*, and REGULATIONS_RE/STATE_LEGISLATION_RE cover
// "regulations"/"state law" elsewhere, but nothing covered a bare "laws"
// with no "state"/"federal" qualifier immediately in front of it), so the
// whole question fell through `isPoliticalQuestion` as non-political and
// never reached the government-research pipeline (or the new research
// planning stage) at all. Added with one exclusion for the common
// non-legal idiom "laws of physics/nature/motion/thermodynamics/gravity/
// attraction" -- everywhere else, "law(s)" on an app whose entire purpose
// is government/legal research is exactly what this classifier exists to
// catch, not a word to keep excluded by omission.
const POLITICAL_RE =
  /\b(congress(?:man|woman|person)?(?:s)?|senate|senators?|represent(?:ative)?s?|governors?|mayors?|president(?:ial)?|elections?|campaigns?|ballot(?:s|ing)?|primary election|bills?\b|legislat\w*|voting record|voted on|roll[- ]call vote|political part(?:y|ies)|democrats?|republicans?|bipartisan|public official\w*|government agenc\w*|federal agenc\w*|public policy|policy(?:making)?|city council|county (?:commissioner|clerk)|school board|attorney general|state house|state senate|house of representatives|running (?:for|against)|running mate|opponent|incumbent|re-?election|challenger|primary race|general race|who(?:'s|\s+is)\s+\w[\w\s.]{0,40}\s+running|laws?(?!\s+of\s+(?:physics|nature|motion|thermodynamics|gravity|attraction))|statutes?)\b/i;

export function classifyPoliticalIntents(text: string): Set<PoliticalIntent> {
  const intents = new Set<PoliticalIntent>();

  const add = (condition: boolean, intent: PoliticalIntent) => {
    if (condition) intents.add(intent);
  };

  const namedAct = NAMED_ACT_RE.test(text);
  const namedState = detectState(text);

  add(POLITICAL_RE.test(text) || namedAct, "political");
  add(
    FEDERAL_BILL_RE.test(text) || FEDERAL_LEGISLATION_RE.test(text) || FEDERAL_STATUTE_CITATION_RE.test(text) || (namedAct && !namedState),
    "federal_legislation",
  );
  add(
    STATE_BILL_RE.test(text) || STATE_LEGISLATION_RE.test(text) || STATE_STATUTE_CITATION_RE.test(text) || (namedAct && Boolean(namedState)),
    "state_legislation",
  );
  add(ELECTIONS_RE.test(text), "elections");
  add(CAMPAIGN_FINANCE_RE.test(text), "campaign_finance");
  add(SUPREME_COURT_RE.test(text), "supreme_court");
  add(STATE_COURTS_RE.test(text), "state_courts");
  add(CONSTITUTION_RE.test(text), "constitution");
  add(BUDGET_RE.test(text), "budget");
  add(EXECUTIVE_BRANCH_RE.test(text), "executive_branch");
  add(CONGRESS_RE.test(text), "congress");
  add(GOVERNOR_RE.test(text), "governor");
  add(LOCAL_LEVEL_RE.test(text), "local_government");
  add(REGULATIONS_RE.test(text), "regulations");
  add(detectHistoricalVerificationNeed(text), "history");
  add(LEARNING_MODE_RE.test(text), "learning_mode");
  add(DEEP_RESEARCH_RE.test(text), "deep_research");
  add(COMPARISON_RE.test(text), "comparison");

  return intents;
}

const MODIFIER_ONLY_INTENTS = new Set<PoliticalIntent>(["learning_mode", "deep_research", "comparison"]);

export function isPoliticalQuestion(intents: Set<PoliticalIntent>): boolean {
  // learning_mode/deep_research/comparison alone don't imply a political
  // topic -- they're modifiers on top of one (e.g. "teach me algebra" or
  // "compare apples and oranges" shouldn't route through the government
  // pipeline just because of that word).
  for (const intent of intents) {
    if (!MODIFIER_ONLY_INTENTS.has(intent)) return true;
  }
  return false;
}
