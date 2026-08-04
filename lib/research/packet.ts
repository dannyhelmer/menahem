import type { Jurisdiction } from "@/lib/intelligence/jurisdiction";
import type { PoliticalIntent } from "@/lib/intelligence/political-intent";
import { GOV_DATA_PROVIDERS } from "@/lib/gov-data/registry";
import type { GovDataProvider } from "@/lib/gov-data/types";
import { getConnectedEntities } from "@/lib/graph/store";
import { getTimeline } from "@/lib/timeline/store";
import { runSearchWithRetry } from "@/lib/search/orchestrate";
import { isSpecificRoute, selectOfficialDomains } from "@/lib/search/source-router";
import { detectRecencyNeed } from "@/lib/intelligence/web-search-intent";
import { dedupeByUrl, sortByAuthority, sourceTier, type SourceTier } from "./source-tier";

const LEGISLATIVE_SUMMARY_INTENTS: PoliticalIntent[] = [
  "federal_legislation",
  "state_legislation",
  "budget",
  "regulations",
];

// Neutral, structured legislative/policy summary format -- only applies to
// the intents where it actually makes sense (a bill, budget, or regulation
// with real stakeholders on multiple sides), not every political question.
// Folded into buildResearchPacket's instructions so it automatically
// reaches Deep Research and Comparison too, since both build on top of
// this same function per sub-question/side.
const LEGISLATIVE_SUMMARY_INSTRUCTIONS =
  "This question concerns legislation, a budget, or a regulation. Write like a Congressional Research Service " +
  "analyst, not a chatbot and not a journalist -- CRS answers what changed, when it changed, where it's " +
  "documented, who supported it, who opposed it, and what the law actually says. It does not speculate about " +
  "Congress's motivation. Every sentence you write should be traceable to an identifiable source; if a " +
  "statement can't be traced to one, rewrite it to say only what the evidence actually supports, or remove it. " +
  "Factual accuracy matters more than completeness -- it is better to state fewer verified facts than to pad " +
  "the answer out with more unverified ones; when genuinely in doubt about a specific claim, cut it rather than " +
  "keep it. Before writing the header below, confirm that a bill was actually found on an official legislative " +
  "source (Congress.gov, the state legislature's own site, or an equivalent official record). If no official " +
  "legislative source could be retrieved for this bill at all, do not build a header out of secondary sources " +
  "as if it were the official record -- open the response with exactly this line: \"Official legislative " +
  "source could not be retrieved.\", then continue only with whatever can be honestly supported by whatever " +
  "secondary sources exist, clearly marked as secondary throughout and never presented as a substitute for the " +
  "missing official record. If NOTHING retrieved -- official or secondary -- actually describes this specific " +
  "bill (for example, the bill name or number doesn't match anything in the retrieved data at all), do not " +
  "write an Overview, Legislative History, or any other section describing what the bill supposedly does based " +
  "only on its title or number -- that is inventing legislative content, not reporting it. Instead, state " +
  "plainly that no information about this specific bill could be found in retrieved sources, and stop there " +
  "(you may still fill in header fields you can genuinely confirm, such as the bill number and jurisdiction " +
  "exactly as the user stated them, using the standard \"Official records reviewed did not provide this " +
  "information.\" line -- never \"N/A\" -- for everything else). Structure the answer neutrally as a " +
  "standardized bill header followed by a fixed set of sections.\n\n" +
  "Standardized header, as its own labeled lines at the top, one per line, every time a specific bill is being " +
  "discussed, in this exact order every time -- a reader should be able to find the same fact in the same place " +
  "across different answers: \"**Official Title:**\" (the formal legal text), \"**Common Name:**\" (only if a " +
  "real, distinct public name actually exists -- don't invent one), \"**Bill Number:**\", \"**Congress/Session:" +
  "**\" (the Congress number federally, or the state legislative session), \"**Sponsor(s):**\" (the lead " +
  "sponsor by name; note cosponsor count if known), \"**Date Introduced:**\", \"**Committee(s) of Referral:**" +
  "\", \"**Major Committee Actions:**\" (a short chronological list, not a repeat of the full history section " +
  "below), \"**Chamber Vote Totals:**\" (House/Senate or equivalent, e.g. \"Passed House 220-213\"), " +
  "\"**Governor/President Signature Date:**\", \"**Effective Date:**\" (only include this line at all if it's " +
  "actually documented as different from the signature date), \"**Current Status:**\", \"**Policy Area:**\". " +
  "For any of these fields you retrieved and confirmed, always include the line -- do not skip a field just " +
  "because it makes the header longer. For a field that genuinely was not found in the retrieved official " +
  "records after retrieval (not just unmentioned in a secondary source), write the line anyway with exactly " +
  "this value: \"Official records reviewed did not provide this information.\" -- never omit the line silently, " +
  "never fill it with an inferred, estimated, or plausible-sounding value, and never substitute a generic " +
  "placeholder like \"N/A\", \"Unknown\", or \"TBD\" for the exact required sentence above; those placeholders " +
  "read as \"this field doesn't apply\" rather than \"this was actually searched for and not found,\" which is " +
  "a different and more honest claim. Never invent or infer missing " +
  "legislative metadata under any circumstance -- a missing field stated honestly is correct; a guessed one is " +
  "not, no matter how standard or predictable that kind of bill's process usually is.\n\n" +
  "When assembling the legislative history behind these header fields, prefer the official legislature's own " +
  "site (Congress.gov federally; the state legislature's own bill-tracking site for state bills) over all other " +
  "sources for committee referrals, actions, and vote totals -- a news article's summary of \"what happened to " +
  "the bill\" is never a substitute for the legislature's own record when that record is available. Present " +
  "milestones (introduction, committee referral, amendments, chamber votes, signature) in chronological order, " +
  "earliest first, matching the order things actually happened rather than the order sources happened to " +
  "mention them. Include committee referrals and major amendments whenever the retrieved data shows them, and " +
  "include final vote totals whenever they were retrieved. Keep documented legislative history (what an " +
  "official record states actually happened, with its date) visibly distinct from explanatory analysis (a " +
  "secondary source's characterization or explanation of that history) -- never blend the two into one " +
  "undifferentiated narrative; attribute analysis to whoever produced it, the same way sourced arguments are " +
  "attributed elsewhere in this response.\n\n" +
  "Then: (1) a concise factual overview of what the bill actually does, citing specific provisions inline as " +
  "you describe them rather than making the reader hunt through a Sources list -- e.g. \"SNAP work requirements " +
  "were expanded (Congress.gov Summary)\" or \"the bill raises the Child Tax Credit to $2,200 (H.R. 1, Sec. " +
  "10001)\", a short parenthetical naming the specific source right next to the specific claim it backs; " +
  "(2) a section headed exactly \"Legislative History\" -- a chronological, dated list (earliest first) of the " +
  "bill's actual procedural milestones, covering whichever of these are documented in the retrieved data: " +
  "introduction date, committee progression (referral, hearings, reporting), major amendments, floor votes in " +
  "each chamber, final passage, signature into law (or veto), and effective date. Each line names its date and " +
  "its source (e.g. \"July 1, 2025 -- Passed Senate 51-50 (Congress.gov actions record)\"); skip a milestone " +
  "entirely if it wasn't retrieved rather than guessing a plausible-sounding date -- a shorter, honest timeline " +
  "beats a complete-looking fabricated one. This section is the full chronological record; the header's Major " +
  "Committee Actions line is only a short summary and should not be treated as a substitute for it. " +
  "(3) a section headed exactly \"Supporters Argue\" covering the strongest arguments for it (stated goals and " +
  "expected benefits, attributed to who's actually making them); (4) a section headed exactly \"Critics Argue\" " +
  "covering the strongest arguments against it (concerns and projected consequences, attributed the same way). " +
  "Banned verbs in both sections, with no exceptions: \"believe,\" \"contend,\" \"feel,\" \"think.\" These " +
  "verbs describe an ongoing mental state you're reporting on someone's behalf, which is a claim you can't " +
  "actually verify. Use \"argued\" (past tense) every time instead -- \"Supporters argued during House debate " +
  "that...\" or, when you don't know the specific venue, simply \"Supporters argued that...\" / \"Critics " +
  "argued that...\". Name the actual venue when you know it (Congressional Record, committee report, sponsor " +
  "statement, a named organization's public statement, a CBO or GAO analysis) -- but never invent one that " +
  "wasn't actually in the sources you were given; attributing to a specific-sounding but unverified occasion is " +
  "its own form of fabrication, so \"argued that...\" with no venue is correct and preferred over guessing one; " +
  "(5) \"Why It Matters\", structured as two short parts -- do not summarize the bill again here, only answer " +
  "these two questions: \"Who Is Affected\": a short bulleted list of the actual stakeholder categories this " +
  "bill concretely affects (drawn from real categories like taxpayers, state governments, healthcare providers, " +
  "Medicaid/benefit recipients, businesses, local governments -- only the ones genuinely relevant here, never a " +
  "rote copy of every possible category), and \"Potential Impact\": 2-4 concise, plain-English sentences " +
  "answering what practical effect this legislation could have -- factual and analytical, no opinion. Within " +
  "Potential Impact, keep three kinds of claim visibly distinct rather than blending them into one flat voice: " +
  "a DOCUMENTED impact (something an official source has already reported as having happened -- \"According to " +
  "CMS...\"), a PROJECTED impact (a forward-looking estimate from a named body -- \"According to the " +
  "Congressional Budget Office...\", \"Independent policy organizations estimate...\"), and your own synthesis " +
  "connecting the two (clearly framed as your own reading of the evidence, not attributed to a source that " +
  "didn't say it). Never state a prediction with no attribution at all, as if it were simply true; then " +
  "(6) the Verification section and (7) the Research Confidence box, both described below. Always include Why " +
  "It Matters and both of these closing sections -- don't drop them even though this is a more specific template " +
  "than the general response shape described elsewhere. After Research Confidence, stop -- do not add a closing " +
  "paragraph like \"For more specific details...\" or \"Additional sources may be referenced...\"; these add no " +
  "information and the interface already shows Sources and Suggested Questions on its own, so there is nothing " +
  "left to gesture at. End the response the moment Research Confidence is written.\n\n" +
  "This is the single highest-priority rule in this whole instruction set: never invent legislative intent. Do " +
  "not write \"aimed to...\", \"intended to...\", \"reflected concerns...\", \"necessary...\"/\"was necessary\", " +
  "\"designed to...\", \"sought to...\", or \"in response to...\" unless an official source explicitly states " +
  "that -- these phrases assert a motivation as fact, and a plausible-sounding motivation is still speculation " +
  "if nothing actually documents it. Delete this language entirely unless you are directly quoting or citing a " +
  "source that says it. Instead of explaining WHY, identify WHERE an explanation (if any) actually comes from, " +
  "and say so explicitly: \"Bill text\" (\"The bill expands Medicaid work requirements.\"), \"Committee Report\" (\"The " +
  "committee report states that...\"), \"Sponsor Statement\" (\"The sponsor stated...\"), or \"Congressional " +
  "Record\" (\"During floor debate...\"). If no official rationale exists in the sources you were given, display " +
  "exactly: \"Official legislative rationale was not identified in available sources.\" -- do not invent one to " +
  "fill the gap.\n\n" +
  "Rather than trying to explain Congressional motivation at all, use a section headed exactly \"Documented " +
  "Legislative Changes\" instead. For each major change, cover only: what changed, where it changed (the bill " +
  "section or statutory citation, when known), and what official document describes it (bill text, committee " +
  "report, Congressional Record, CBO estimate, etc.) -- never why it changed unless an official source " +
  "explicitly explains why, in which case attribute that explanation to its actual source exactly as described " +
  "above rather than stating it as your own narration.\n\n" +
  "When a bill has become law and enough time has passed that the response also touches on how it has actually " +
  "played out in practice (not just what it was projected to do), keep three evidentiary levels visibly " +
  "distinct rather than describing implementation results as settled fact by default: a DOCUMENTED outcome (an " +
  "official government implementation report, agency data release, or audit has actually measured and reported " +
  "this -- name that report), PRELIMINARY evidence (early, incomplete, or non-official data exists and is " +
  "explicitly caveated as preliminary, e.g. \"early state-level enrollment data suggests..., though this is " +
  "preliminary and covers only partial implementation\"), or UNKNOWN/INSUFFICIENT evidence (nothing retrieved " +
  "actually measures this yet -- say so plainly, using exactly this phrase: \"Long-term implementation data is " +
  "currently limited.\"). Never write an estimate or an effectiveness claim about a measurable outcome unless a " +
  "specific source is cited for it -- if no source supports the number or claim, use the sentence above instead " +
  "of stating or implying a result that hasn't actually been measured. Never write as though an outcome has " +
  "been observed when only a projection or a bare expectation exists -- a projection stays a projection, " +
  "however long ago the bill passed, until an official source actually reports the measured result.\n\n" +
  "If the response touches on whether this law has faced legal or court challenges, apply the same discipline: " +
  "state only challenges actually documented in retrieved sources, naming the case, the court, and its status " +
  "(filed, pending, ruled on, appealed) with the specific source that reports it. Never infer that a challenge " +
  "exists, is likely, or guess at its probable outcome. If nothing retrieved documents a legal challenge, don't " +
  "raise the possibility of one just to hedge on it -- simply omit any mention of litigation rather than " +
  "speculating that one might exist.\n\n" +
  "Throughout the response, keep three source categories visibly distinct and never blend them into one " +
  "undifferentiated voice: OFFICIAL LEGISLATIVE SOURCES (the bill text, the legislature's own site, committee " +
  "reports, floor votes, the Congressional Record or a state equivalent -- what the law actually says and what " +
  "the legislative record actually documents), GOVERNMENT IMPLEMENTATION GUIDANCE (an executive agency's or " +
  "local government's own material on how the law is being applied or administered -- distinct from what the " +
  "law itself says), and INDEPENDENT ANALYSIS (academic research, nonprofit policy organizations, or news " +
  "coverage characterizing or evaluating the law). Make which category a given claim comes from clear from its " +
  "attribution (name the legislature, the agency, or the analyzing organization) rather than presenting all " +
  "three in the same unattributed tone. When an official legislature page is present anywhere in the retrieved " +
  "sources, cite it directly at least once in the response -- never let the response rely entirely on " +
  "implementation pages, analysis, or news coverage while leaving the legislature's own record uncited.\n\n" +
  "Avoid language that implies a policy choice was objectively necessary or self-evidently correct -- that's a " +
  "value judgment dressed as fact. Instead of \"The emphasis on rural healthcare was necessary,\" write " +
  "something like \"The legislation added incentives for rural healthcare. Supporters argued this would improve " +
  "access, while critics questioned its effectiveness.\" Always attribute an opinion to whoever actually holds " +
  "it, and keep it visibly separate from the facts around it.\n\n" +
  "Summarize each side fairly from real, sourced material -- never invent a position nobody has actually taken, " +
  "and never present either side's argument as objective fact rather than an attributed position. Do not add an " +
  "\"Areas of Agreement\" or consensus section -- that framing implies a political consensus exists, which isn't " +
  "something to assert. Keep fact, projection, and opinion visibly distinct -- never blend them into one " +
  "sentence. Any estimate (spending, coverage, economic effects) must name who produced it (e.g. the " +
  "Congressional Budget Office, the White House, an advocacy group, a think tank) and note that it depends on " +
  "stated assumptions, not just report a bare number. Never attribute a factual claim, statistic, projection, " +
  "fiscal estimate, or measurable outcome to a vague, unnamed source -- phrases like \"early reports,\" " +
  "\"studies show,\" \"experts say,\" \"reports indicate,\" or \"data suggests\" with no named source attached " +
  "are banned with no exceptions; identify the actual study, agency, or organization every time, or remove the " +
  "claim if you can't. Prefer primary sources (the bill text itself, official " +
  "government analyses, nonpartisan agencies) over advocacy-organization framing; if advocacy sources are used, " +
  "include organizations representing more than one perspective, and say so explicitly if the available sources " +
  "lean one direction. Avoid emotionally loaded language (\"devastating,\" \"radical,\" \"massive,\" " +
  "\"disastrous\") unless directly quoting a named source, clearly marked as a quote. Also avoid generic " +
  "AI-sounding filler that asserts significance without evidence -- \"reflects concerns,\" \"intended to,\" " +
  "\"aimed to,\" \"significant shift,\" \"notable legislation,\" \"this demonstrates\" -- write a direct, " +
  "evidence-based description instead (what specifically changed, per which source) rather than a label that " +
  "just tells the reader how to feel about it. For individual checkable " +
  "claims within the answer (a specific figure, date, projection, or attributed position) -- not ordinary " +
  "connecting prose -- tag the claim's evidentiary status inline as **Fact:**, **Projection:**, or " +
  "**Opinion:**, each followed by a confidence note (High/Medium/Low for facts and projections, \"Opinion " +
  "(attributed claim)\" for opinions). For example: \"**Fact:** The bill raises the Child Tax Credit from " +
  "$2,000 to $2,200. (Confidence: High.)\" / \"**Projection:** The Congressional Budget Office estimates " +
  "approximately 17 million people could lose coverage under this bill. (Confidence: Medium -- a modeled " +
  "estimate, not a certainty.)\" / \"**Opinion:** Critics argue the bill will substantially harm rural " +
  "hospitals. (Confidence: Opinion -- an attributed position, not a verified fact.)\" In addition to Fact/" +
  "Projection/Opinion, tag anything you're inferring or unsure of as **Speculation:**, with confidence noted as " +
  "\"Speculation (unverified)\" -- never present a guess as if it were a fact.\n\n" +
  "When tracking how a bill's provisions changed across versions in a table, use exactly these columns: " +
  "\"Policy Change\", \"Introduced\", \"House Version\", \"Final Law\", \"Evidence\" -- never a \"Reason for " +
  "Change\" column; evidence is more valuable than speculation about motive. The Evidence column must name the " +
  "SPECIFIC source that supports the claim -- how it was verified, not who analyzed it. Write \"Congress.gov " +
  "Bill Summary\", \"Bill Text (Section 10001)\", \"House Amendment 47\", \"Congressional Record\", \"CBO Cost " +
  "Estimate\", or \"House Rules Committee Report\" -- never a vague pointer like \"Analyzed by CBO\" or \"Health " +
  "Provisions Summary\" that names a topic or actor instead of an actual, checkable document. For any other " +
  "table comparing bills or provisions, still include an \"Evidence\" (or \"Source\") column held to this same " +
  "standard, so every row is individually traceable, not just the answer as a whole. Never include a table " +
  "column at all (a \"Section\" column especially) unless you can actually fill it with real values for every " +
  "row -- never display a placeholder like \"TBD\", \"N/A\", or \"unknown\" in a table cell. If exact statutory " +
  "sections can't be identified for the rows in a table, omit the Section column entirely rather than showing " +
  "incomplete data; the same rule applies to any other column you can't actually populate.\n\n" +
  "Bill numbers restart every new Congress -- the same number (e.g. H.R. 1) can refer to a completely " +
  "different bill in a different Congress. Before answering, explicitly determine and state: (1) which " +
  "Congress the bill belongs to (e.g. 116th, 117th, 118th, 119th), (2) its official title, (3) whether it " +
  "became law, and (4) that every provision you describe actually belongs to that specific bill in that " +
  "specific Congress -- never blend in provisions, outcomes, or figures from a different bill that happens to " +
  "share the same number. If the retrieved data or your own knowledge suggests two different bills share this " +
  "number, stop and say plainly: \"Possible bill-number collision detected. H.R. numbers restart every " +
  "Congress. These appear to be different bills.\" and address them separately rather than merging them.\n\n" +
  "Before finalizing, compare every factual claim you've written against the retrieved sources one more time: " +
  "remove any statement that isn't actually supported, or that a source contradicts. When two retrieved sources " +
  "disagree on a specific fact (a vote total, an effective date, a fiscal estimate, the bill's current status), " +
  "do not silently pick one and present it as settled -- name both sources and their differing claims, and say " +
  "plainly that they disagree (e.g. \"Congress.gov lists the vote as 220-213, while [source] reports 218-215; " +
  "retrieved sources do not agree on this figure.\") rather than choosing whichever number seems more " +
  "authoritative without saying so.\n\n" +
  "Second-to-last, a section headed exactly \"Verification\" listing, as checkmarked lines, ONLY the specific " +
  "items you can actually confirm from the data you were given -- the possible items are: bill number, " +
  "Congress/session, official title, bill status, policy area, latest legislative action, public law number " +
  "(only if it became law), sponsor, committee(s) of referral, chamber vote totals, signature date, and " +
  "official government source used, but this is not a fixed template to fill in regardless of what you actually " +
  "have. Omit any line you cannot genuinely verify -- never display a checkmark for something you didn't " +
  "actually confirm, and never claim a verification step happened if it didn't. A shorter, honest list is " +
  "correct; a complete-looking but partly fabricated one is not. Format each confirmed line as, for example, " +
  "\"✓ Bill number verified\" / \"✓ Official title verified\" / \"✓ Bill status verified\" / \"✓ Policy area " +
  "verified\" / \"✓ Latest legislative action verified\" / \"✓ Public law number verified\" / \"✓ Sponsor " +
  "verified\" / \"✓ Committee referral verified\" / \"✓ Chamber vote totals verified\" / \"✓ Signature date " +
  "verified\" / \"✓ Official government source used.\" If you cannot verify any of " +
  "these items at all, omit the Verification section entirely rather than showing an empty or fabricated one.\n\n" +
  "Finally, a section headed exactly \"Research Confidence\" -- distinct from Verification (which checks facts " +
  "about the bill) and from the separate Evidence Strength indicator the interface shows (which is computed " +
  "from retrieved source counts, not something you write) -- this is your own honest self-assessment of how " +
  "reliable THIS PARTICULAR ANSWER is as a whole. State an overall level (\"Research Confidence: High/Medium/" +
  "Low\") followed by a short checklist of the specific reasons, mixing confirmations (✓) and real caveats (⚠) " +
  "as actually applicable -- for example: \"✓ Bill retrieved directly from Congress.gov\", \"✓ Current status " +
  "verified\", \"✓ Multiple independent sources agree\". Each caveat must say specifically what's uncertain and " +
  "why, not a vague gesture at imperfection -- write something like \"⚠ Some secondary analyses were published " +
  "before the enacted version of the bill; official bill text and Congress.gov were prioritized whenever " +
  "available\" or \"⚠ CBO cost estimate reflects the House-passed version, not the final enacted text\" rather " +
  "than a generic line like \"Some provisions were analyzed before final amendments.\" Every line must reflect " +
  "something actually true about this response -- never pad it with confirmations that didn't happen or omit a " +
  "real caveat to look more confident than the underlying evidence supports.";

// Best-effort: a bill's real, sourced action history gives the model
// ordered ground truth instead of asking it to infer sequence from a
// single latestAction string. Silently omitted if no timeline exists yet
// (e.g. gov keys unconfigured) -- never fabricates a history that isn't
// actually on file.
async function buildTimelineNote(entityId: string | undefined): Promise<string | null> {
  if (!entityId) return null;
  try {
    const timeline = await getTimeline(entityId);
    if (!timeline || timeline.events.length === 0) return null;
    const lines = timeline.events.map((e) => `${e.date}: ${e.label} -- ${e.description}`);
    return `Real, sourced action history for this bill (chronological, earliest first):\n${lines.join("\n")}`;
  } catch {
    return null;
  }
}

// Best-effort: checks whether the knowledge graph already has other bills
// connected to this representative (from earlier lookups) and, if so,
// surfaces that as a short note -- the first real demonstration of the
// graph being *read*, not just written to. Never throws; a graph miss or
// read failure just means no note gets added.
async function buildRelatedEntitiesNote(
  representativeId: string | undefined,
  currentEntityId: string | undefined,
): Promise<string | null> {
  if (!representativeId) return null;
  try {
    const connected = await getConnectedEntities(representativeId, { relationship: "sponsored" });
    const otherBills = connected.filter((c) => c.entity.id !== currentEntityId);
    if (otherBills.length === 0) return null;
    const titles = otherBills.map((c) => `- ${c.entity.label}`).join("\n");
    return (
      `Menahem has previously looked up ${otherBills.length} other bill(s) sponsored by this representative:\n${titles}`
    );
  } catch {
    return null;
  }
}

export interface TieredSource {
  title: string;
  url: string;
  tier: SourceTier;
  // See lib/research/source-attribution.ts -- "always_keep" sources are
  // ones already known to have informed the response (a gov-data-provider
  // record used to build the header) regardless of whether the model names
  // them in prose; ordinary web-search sources are only kept if referenced.
  provenance?: "always_keep" | "web_search";
}

export interface ResearchPacket {
  intents: PoliticalIntent[];
  jurisdiction: Jurisdiction;
  state: string | null;
  sources: TieredSource[];
  liveData: string;
  confidence: "high" | "medium" | "low";
  confidenceReason: string;
}

// Deterministic, mechanical explanation of a confidence rating -- source
// counts and composition only, never an editorial claim about the topic
// itself (that would require judgment this function doesn't have grounds
// to make). Shared by the plain packet, Deep Research, and Comparison so
// "why is this Medium?" always has a real, honest answer behind it.
// Extracted so the same rule can be re-applied post-generation against a
// filtered (actually-used) source set, not just the raw retrieval set --
// see filterUsedSources in source-attribution.ts.
export function computeConfidence(sources: TieredSource[], directGovHit: boolean): ResearchPacket["confidence"] {
  const governmentSourceCount = sources.filter((s) => s.tier === "government").length;
  if (directGovHit || (governmentSourceCount >= 1 && sources.length >= 2)) return "high";
  if (sources.length >= 1) return "medium";
  return "low";
}

export function buildConfidenceReason(
  confidence: ResearchPacket["confidence"],
  sources: TieredSource[],
  directGovHit: boolean,
): string {
  const counts: Record<SourceTier, number> = { government: 0, news: 0, reference: 0, general: 0 };
  for (const s of sources) counts[s.tier]++;

  // A checkmark-style breakdown reads as an actual evidence inventory
  // rather than a vague "based on some sources" sentence -- lets a reader
  // see at a glance whether a rating is backed by official records, wire
  // reporting, or just a couple of general pages.
  const lines: string[] = [];
  if (counts.government > 0) lines.push(`✓ ${counts.government} official government source${counts.government === 1 ? "" : "s"}`);
  if (counts.news > 0) lines.push(`✓ ${counts.news} news organization${counts.news === 1 ? "" : "s"}`);
  if (counts.reference > 0) lines.push(`✓ ${counts.reference} academic/reference source${counts.reference === 1 ? "" : "s"}`);
  if (counts.general > 0) lines.push(`✓ ${counts.general} other source${counts.general === 1 ? "" : "s"}`);

  const basis = lines.length > 0 ? `Based on:\n${lines.join("\n")}` : "No sources were retrieved for this question.";

  if (confidence === "low") return `${basis}\nNot enough was found to verify specific details with confidence.`;
  if (confidence === "medium") {
    return `${basis}\nAt least one source was found, but not enough official corroboration to rate this higher.`;
  }
  return directGovHit
    ? `${basis}\nRetrieved directly from an authoritative government data source.`
    : `${basis}\nCorroborated by an official government source alongside others.`;
}

function selectGovProviders(intents: Set<PoliticalIntent>, jurisdiction: Jurisdiction): GovDataProvider[] {
  if (jurisdiction !== "federal") return [];
  const providers: GovDataProvider[] = [];
  const congress = GOV_DATA_PROVIDERS.find((p) => p.id === "congress");
  const fec = GOV_DATA_PROVIDERS.find((p) => p.id === "fec");

  if (congress && (intents.has("federal_legislation") || intents.has("congress") || intents.has("executive_branch"))) {
    providers.push(congress);
  }
  if (fec && intents.has("campaign_finance")) providers.push(fec);

  return providers;
}

export async function buildResearchPacket(
  question: string,
  intents: Set<PoliticalIntent>,
  jurisdiction: Jurisdiction,
  state: string | null,
  options?: { maxSearchResults?: number; onStage?: (label: string) => void },
): Promise<ResearchPacket> {
  const maxSearchResults = options?.maxSearchResults ?? 10;
  const onStage = options?.onStage;
  onStage?.("Planning research");

  // jurisdiction/state are already resolved by the caller (see
  // resolveJurisdictionAndState in app/api/chat/route.ts) before this
  // function is ever called -- this stage is presented from the user's
  // point of view (a real step in the pipeline they should see happened),
  // not a marker of work this function itself performs.
  onStage?.("✓ Determining jurisdiction");

  const providers = selectGovProviders(intents, jurisdiction);
  const officialRoute = selectOfficialDomains(intents, jurisdiction, state, question);
  onStage?.("✓ Identifying official sources");

  const liveDataParts: string[] = [];
  const sources: TieredSource[] = [];
  let directGovHit = false;

  for (const provider of providers) {
    if (!(await provider.isConfigured())) continue;
    const result = await provider.retrieve(question);
    if (result.success && result.liveData) {
      liveDataParts.push(result.liveData);
      directGovHit = true;
      onStage?.(`✓ Searching ${provider.label}`);
      for (const s of result.sources ?? []) sources.push({ ...s, tier: sourceTier(s.url, s.title), provenance: "always_keep" });

      const relatedNote = await buildRelatedEntitiesNote(result.graph?.representativeId, result.graph?.entityId);
      if (relatedNote) liveDataParts.push(relatedNote);

      const timelineNote = await buildTimelineNote(result.graph?.entityId);
      if (timelineNote) liveDataParts.push(timelineNote);
    } else if (result.note) {
      liveDataParts.push(result.note);
      // A "not configured" note isn't a retrieval failure worth flagging in
      // the checklist -- only surface the warning when the provider was
      // actually reachable and came up empty/errored.
      onStage?.(result.note.includes("isn't configured") ? `Skipped ${provider.label} (not configured)` : `⚠ ${provider.label} unavailable`);
    }
  }

  // For legislation/budget/regulation questions, bias the search query
  // toward the official legislative record from the first attempt --
  // otherwise a query naming a law by its common name (e.g. "Florida's Live
  // Local Act") routinely surfaces local-government implementation pages
  // and nonprofit explainers ahead of the state legislature's own site in
  // organic search ranking, and by the time re-ranking (sortByAuthority)
  // runs, the legislature's page may never have been in the fetched
  // candidate set at all.
  const isLegislative = LEGISLATIVE_SUMMARY_INTENTS.some((intent) => intents.has(intent));
  const searchQuery = isLegislative ? `${question} official legislature bill text status` : question;
  // A wider raw candidate pool gives sortByAuthority (in orchestrate.ts,
  // applied before the top MAX_PAGES_TO_FETCH are actually fetched) more to
  // work with -- the official legislature's page is often organically
  // outranked by implementation pages and explainers, so if only the
  // default 10 raw results are requested, it may never be in the candidate
  // set at all for the authority sort to promote.
  const searchResult = await runSearchWithRetry(searchQuery, isLegislative ? Math.max(maxSearchResults, 15) : maxSearchResults, {
    preferRecent: detectRecencyNeed(question),
    // buildResearchPacket only runs for queries already classified as
    // government/political intents (see politicalIntents gating in
    // app/api/chat/route.ts) -- always search official domains first here,
    // per the requested retrieval pipeline ("search official domains first
    // ... only if insufficient, search secondary sources"), targeting the
    // specific official sites the source router identified above rather
    // than a generic .gov/.mil bias.
    preferOfficial: officialRoute,
    onProgress: onStage ? (update) => onStage(update.label) : undefined,
  });
  if (searchResult.success && searchResult.liveData) {
    liveDataParts.push(searchResult.liveData);
    for (const s of searchResult.sources ?? []) sources.push({ ...s, tier: sourceTier(s.url, s.title), provenance: "web_search" });
    // Only flag this to the model when nothing else in the packet already
    // confirms the answer -- a direct government-data-provider hit means
    // overall confidence is fine even if this supplementary web search
    // separately came up weak after its own automatic retry.
    if (searchResult.stillWeak && !directGovHit) {
      liveDataParts.push(
        "Retrieval note: search was automatically retried with a broadened query after the first pass was " +
          "evaluated as insufficient (no authoritative source, thin corroboration) -- this already happened, " +
          "don't tell the user you're about to search again. The results above are the best available after " +
          "that retry but still fall short of strong evidence. State plainly what was found and that it isn't " +
          "strongly corroborated, then ask whether the user would like your best general-knowledge answer " +
          "instead, clearly labeled as unverified.",
      );
    }
  } else if (searchResult.note) {
    liveDataParts.push(searchResult.note + (searchResult.retried ? " (already retried once with a broadened query)" : ""));
  }

  // Named-source transparency: when phase 1 targeted a SPECIFIC official
  // route (not just the generic .gov/.mil floor) and still came up short,
  // say plainly which official source(s) failed, per the retrieval
  // pipeline's failure-handling requirement -- distinct from the stillWeak
  // note above, which only fires if secondary sources ALSO came up thin;
  // this one fires whenever the official leg of the search failed, even if
  // secondary sources then filled the gap.
  if (searchResult.retried && isSpecificRoute(officialRoute)) {
    liveDataParts.push(
      `Unable to retrieve sufficient results from ${officialRoute.labels.join(", ")} for this query -- ` +
        "secondary sources were used instead where available. If you rely on secondary sources for any fact " +
        "here, say plainly that the official source(s) above could not be retrieved for it.",
    );
  }

  const confidence = computeConfidence(sources, directGovHit);
  onStage?.("✓ Verifying retrieved information");

  const instructions = [
    "Cite every source you use by its URL. Never invent a source, figure, or detail not present below. Only " +
      "name/cite a source you actually drew on -- if you don't name it (its title, publication, or domain) " +
      "somewhere near the claim it supports, it will not be shown to the user as a source for this response, so " +
      "silently relying on a source without naming it defeats the purpose of citing at all.",
    "For legislation, ALWAYS search for and prefer official government sources first, in this exact priority " +
      "order. Federally: (1) Congress.gov, (2) House.gov, (3) Senate.gov, (4) the Federal Register, " +
      "(5) govinfo.gov, (6) other federal agency (.gov) sites, (7) SupremeCourt.gov and other federal court " +
      "opinions. For a state bill: (1) the official state legislature/General Assembly site (e.g. the Florida " +
      "Senate or Florida House for a Florida bill), (2) the official state bill-status page, (3) the official " +
      "state statutes/code, (4) the Governor's official site, (5) official state agency (.gov) sites, " +
      "(6) official state courts. For a local ordinance: (1) the county government site, (2) the municipal " +
      "government site. Only AFTER exhausting official government sources for a given fact should you use: " +
      "the CBO/CRS/GAO or equivalent government reports (official and nonpartisan, but they analyze legislation " +
      "rather than being the legislative record itself -- never let a CBO/CRS/GAO estimate replace the bill's " +
      "own official record of what it says or where it stands procedurally), then public universities and " +
      "government-funded research organizations, then Ballotpedia, other nonprofit policy organizations, news " +
      "organizations, or other private websites. Wikipedia is background/supporting context only, below all of " +
      "the above.\n\n" +
      "When multiple sources describe the same bill, always prefer: the official bill page, the official bill " +
      "text, official legislative history, official vote records, official committee reports, and official " +
      "fiscal notes, over any third party's summary of them -- a summary (news article, advocacy post, blog, or " +
      "even a nonprofit's otherwise-reputable explainer) must never replace an official record that says the " +
      "same thing, no matter how much clearer or more detailed the summary reads. Never let a lower-authority " +
      "source outrank a higher one that says the same thing -- a city or county implementation page must never " +
      "replace the state legislature's own record as the source for what a state law actually says or how it " +
      "moved through the legislature, even when the local page is more detailed, easier to read, or more " +
      "directly about the user's own city. Do not let an advocacy organization become the primary source for a " +
      "fact when an official legislative source for that same fact exists in the retrieved data, even if the " +
      "advocacy source is more detailed or easier to quote.\n\n" +
      "If no official legislative source could be found for a specific piece of information after retrieval " +
      "(including the automatic broadened retry), do not silently substitute a private, advocacy, or news " +
      "source as if it were equivalent -- say so explicitly, using exactly this sentence right before you " +
      "present what secondary sources did find: \"No official legislative source could be located for this " +
      "information. The following secondary sources were used instead.\"",
  ];
  if (LEGISLATIVE_SUMMARY_INTENTS.some((intent) => intents.has(intent))) {
    instructions.push(LEGISLATIVE_SUMMARY_INSTRUCTIONS);
  }
  if (confidence === "low") {
    instructions.push(
      "No official government source or web search result was retrieved for this question -- nothing below " +
        "verifies specific facts (bill numbers, sponsors, vote counts, candidate names, dates, figures). If you " +
        "still answer from your own general knowledge, you MUST say explicitly that this is unverified/from " +
        "training data and may be outdated or wrong -- do not state specific details as if they were just " +
        "confirmed. If you aren't confident, say plainly that you don't have verified information rather than " +
        "describing a plausible-sounding bill, race, or figure as fact.",
    );
  }

  const liveData = [
    `Government/political research packet for: ${question}`,
    `Jurisdiction: ${jurisdiction}${state ? ` (${state})` : ""}.`,
    ...instructions,
    ...liveDataParts,
  ].join("\n\n---\n\n");

  // De-duplicate by URL before sorting/returning -- gov-data-provider
  // sources are pushed before web-search sources, so when both surface the
  // same URL (e.g. a search result landing on the same Congress.gov page a
  // provider already retrieved), the earlier, "always_keep"-tagged entry is
  // the one kept.
  const sortedSources = sortByAuthority(dedupeByUrl(sources));
  return {
    intents: Array.from(intents),
    jurisdiction,
    state,
    sources: sortedSources,
    liveData,
    confidence,
    confidenceReason: buildConfidenceReason(confidence, sortedSources, directGovHit),
  };
}
