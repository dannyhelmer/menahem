// Mechanical enforcement against fabricated attributed claims -- confirmed
// live: for Illinois HB4809 (103rd GA), with retrieval so thin that the
// response opened with "Official legislative source could not be
// retrieved." and cited only procedural bill-status/listing pages (no
// debate coverage, no advocacy statements, no news analysis), the model
// still wrote a "Supporters Argue"/"Critics Argue" section with plausible-
// sounding but entirely invented positions -- zero attribution to any
// actual person, organization, or venue ("Supporters argued that the bill
// would enhance consumer privacy..."). The prompt already forbids this in
// detail (see LEGISLATIVE_SUMMARY_INSTRUCTIONS in packet.ts -- "never
// invent a position nobody has actually taken"), but prompt compliance
// alone wasn't reliable here, the same class of gap that motivated
// enforceLegislativeStatusLanguage's mechanical tense correction. This is
// the analogous mechanical safeguard for attribution instead of tense.
//
// Deliberately narrow and field-scoped, matching this codebase's existing
// mechanical-correction modules: it only ever touches the three specific
// fields this exact prompt template produces (Supporters Argue, Critics
// Argue, Potential Impact), never free-floating prose elsewhere in the
// response, so it can't misfire on unrelated text.

// A curated set of concrete attribution signals -- an explicit reporting
// phrase, a named research/oversight body, or a parenthetical citation
// matching this prompt's own established inline-citation style (e.g.
// "(Congress.gov Summary)"). Deliberately NOT a generic "two capitalized
// words" heuristic: a bill's own subject matter routinely mentions
// capitalized government-office names ("the Attorney General", "the
// General Assembly") that are not evidence anyone actually argued
// anything -- a looser heuristic would treat those as attribution and
// silently let a fabricated claim through unlabeled, which is the failure
// direction this check exists to avoid.
const ATTRIBUTION_SIGNAL_RE =
  /\baccording to\b|\bstated (?:that|in)\b|\bin a statement\b|\btestified\b|\bpress release\b|\bpublic statement\b|\bcongressional record\b|\bcommittee report\b|\bsponsor statement\b|\bfloor debate\b|\bcommittee hearing\b|\bpublic hearing\b|\bnews coverage\b|\b(?:CBO|GAO|FTC|EFF|ACLU|IAPP)\b|\bCongressional Budget Office\b|\bGovernment Accountability Office\b|\b(?:Rep\.|Sen\.|Gov\.|Governor|Senator|Representative)\s+[A-Z][a-zA-Z'-]+\b|\([A-Z][^)]{2,80}\)/i;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Boundaries where a field's own content ends -- the next known field
// label this template produces, a "---" divider, a "##" heading (the
// multi-part per-entity boundary), or end of the section.
const KNOWN_FIELD_LABELS = [
  "Supporters Argue",
  "Critics Argue",
  "Who Is Affected",
  "Potential Impact",
  "Why It Matters",
  "Verification",
  "Research Confidence",
  "Legislative History",
  "Documented Legislative Changes",
];
const NEXT_BOUNDARY_RE = new RegExp(
  `\\n\\s*(?:\\*\\*(?:${KNOWN_FIELD_LABELS.map(escapeRegex).join("|")}):?\\*\\*|-{3,}\\s*$|##\\s)`,
  "m",
);

interface FieldSpan {
  content: string;
  start: number;
  end: number;
}

function extractField(sectionText: string, label: string): FieldSpan | null {
  // Consumes trailing spaces/tabs and at most ONE newline after the header
  // -- not a greedy `\s*`, which would swallow every blank line up to the
  // next "---" divider when a field is empty, eating the very newline the
  // boundary regex below needs to detect that divider, and silently
  // absorbing the divider itself into "content".
  const headerMatch = sectionText.match(new RegExp(`\\*\\*${escapeRegex(label)}:?\\*\\*[ \\t]*\\n?`, "i"));
  if (!headerMatch || headerMatch.index === undefined) return null;
  const contentStart = headerMatch.index + headerMatch[0].length;
  const rest = sectionText.slice(contentStart);
  const boundaryMatch = rest.match(NEXT_BOUNDARY_RE);
  const contentEnd = boundaryMatch && boundaryMatch.index !== undefined ? contentStart + boundaryMatch.index : sectionText.length;
  return { content: sectionText.slice(contentStart, contentEnd).trim(), start: contentStart, end: contentEnd };
}

function hasAttribution(content: string): boolean {
  return ATTRIBUTION_SIGNAL_RE.test(content);
}

export interface UnsupportedClaimCorrection {
  section: string;
  field: string;
  action: "replaced" | "labeled";
}

const NO_STATEMENTS_FOUND = (role: string) => `No ${role} statements for this bill were found in retrieved sources.`;
const POLICY_ANALYSIS_LABEL =
  "**Policy Analysis (inference from the bill's own provisions -- not a reported or projected impact from a retrieved source):** ";

function correctSection(sectionText: string): { text: string; corrections: Omit<UnsupportedClaimCorrection, "section">[] } {
  const corrections: Omit<UnsupportedClaimCorrection, "section">[] = [];
  let result = sectionText;

  // Process fields in REVERSE position order so earlier offsets stay valid
  // as later ones are rewritten -- same convention as
  // enforceLegislativeStatusLanguage's span processing.
  const targets: { label: string; field: "Supporters Argue" | "Critics Argue" | "Potential Impact" }[] = [
    { label: "Supporters Argue", field: "Supporters Argue" },
    { label: "Critics Argue", field: "Critics Argue" },
    { label: "Potential Impact", field: "Potential Impact" },
  ];
  const spans = targets
    .map((t) => ({ ...t, span: extractField(result, t.label) }))
    .filter((t): t is (typeof targets)[number] & { span: FieldSpan } => t.span !== null)
    .sort((a, b) => b.span.start - a.span.start);

  for (const { field, span } of spans) {
    if (!span.content || hasAttribution(span.content)) continue;

    if (field === "Supporters Argue" || field === "Critics Argue") {
      const replacement = NO_STATEMENTS_FOUND(field === "Supporters Argue" ? "supporter" : "critic");
      result = result.slice(0, span.start) + replacement + result.slice(span.end);
      corrections.unshift({ field, action: "replaced" });
    } else {
      result = result.slice(0, span.start) + POLICY_ANALYSIS_LABEL + span.content + result.slice(span.end);
      corrections.unshift({ field, action: "labeled" });
    }
  }

  return { text: result, corrections };
}

const HEADING_RE = /^##\s+(.+)$/gm;

// Splits on the same "## <heading>" boundaries enforceLegislativeStatusLanguage
// uses, so each entity's own fields in a multi-part comparison are checked
// independently -- a single-bill response with no "##" headings is treated
// as one section spanning the whole text.
export function enforceAttributedClaims(text: string): { text: string; corrections: UnsupportedClaimCorrection[] } {
  const headingMatches = [...text.matchAll(HEADING_RE)];
  const spans =
    headingMatches.length > 0
      ? headingMatches.map((m, i) => ({
          key: m[1].trim(),
          start: m.index + m[0].length,
          end: i + 1 < headingMatches.length ? headingMatches[i + 1].index! : text.length,
        }))
      : [{ key: "(single section)", start: 0, end: text.length }];

  const corrections: UnsupportedClaimCorrection[] = [];
  let result = text;
  // Sections are processed in reverse (so earlier spans' offsets stay valid
  // as later ones are rewritten), but a single section can contribute
  // MULTIPLE corrections that are already in left-to-right order among
  // themselves (correctSection's own unshift) -- prepending each section's
  // whole batch (not pushing individual entries followed by one final
  // reverse) keeps that internal order intact instead of flipping it.
  for (let i = spans.length - 1; i >= 0; i--) {
    const { key, start, end } = spans[i];
    const sectionText = result.slice(start, end);
    const { text: correctedSection, corrections: sectionCorrections } = correctSection(sectionText);
    if (sectionCorrections.length > 0) {
      result = result.slice(0, start) + correctedSection + result.slice(end);
      corrections.unshift(...sectionCorrections.map((c) => ({ section: key, ...c })));
    }
  }
  return { text: result, corrections };
}
