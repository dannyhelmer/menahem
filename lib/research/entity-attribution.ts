// Mechanical correction for a confirmed, recurring entity/provision
// misattribution: California's CCPA/CPRA (a broader general consumer-
// privacy law, AB 375/2018 as amended by the CPRA/Prop 24/2020, Cal. Civ.
// Code SS1798.100 et seq.) does NOT itself contain data-broker registration
// or the DROP centralized-deletion-platform provisions -- those belong to
// California's separate, dedicated data-broker regime: the Data Broker
// Registration Law (AB 1202/2019), as amended by the Delete Act (SB
// 362/2023), Cal. Civ. Code SS1798.99.80 et seq. Confirmed live: a "data
// broker laws" comparison wrote up California under a "## California
// Consumer Privacy Act (CCPA)" heading, then attributed "[r]egistering
// with the California Privacy Protection Agency" and "[a]dopting... DROP"
// directly to the CCPA -- provisions that are actually the Delete Act's.
// research-plan.ts's correctKnownEntitySubstitutions fixes this at the
// entity-selection stage (so the section is planned under the right name
// to begin with); this is the content-level backstop for whatever slips
// through that -- a response that reaches this stage by a path with no
// entity plan at all (e.g. a regex-extracted comparison target, or a
// single-question answer that mentions the CCPA in passing while actually
// describing the Delete Act's own provisions).

// A section framed as being about the CCPA/CPRA specifically -- not one
// that already names the Delete Act/SB 362/AB 1202 in its own title, which
// means it's already correctly scoped and left alone. Deliberately does
// NOT also treat "data broker regist..." as an own-scope signal here, even
// though that phrase IS one of the Delete Act's real provisions (see
// DELETE_ACT_SIGNAL_RE below) -- checking for it in the exclusion would be
// self-defeating: the confirmed misattributed text contains exactly that
// phrase, so treating its presence as "already correctly scoped" would
// silently skip the one case this whole check exists to catch.
const CCPA_HEADING_RE = /\b(?:CCPA|California Consumer Privacy Act|CPRA|California Privacy Rights Act)\b/i;
const CALIFORNIA_DATA_BROKER_TITLE_RE = /\bDelete Act\b|\bSB\s?362\b|\bAB\s?1202\b/i;

// DROP / "Delete Request and Opt-Out Platform" are unambiguous, standalone
// proper nouns unique to the Delete Act -- checked per line below along
// with the registration signal, not matched inline via a global regex,
// so a line naming both the full name and its "(DROP)" abbreviation
// together gets ONE annotation, not two redundant ones.
const DROP_SIGNAL_RE = /\bDROP\b|\bDelete Request and Opt-?Out Platform\b/i;

// "Registration" is only a Delete-Act-specific signal when it's actually
// about DATA BROKER registration with the (Cal)PPA -- but real generated
// text rarely places "data broker" directly next to "regist*" in the same
// clause; the confirmed live text reads "Data brokers must register
// annually with the California Privacy Protection Agency (CalPPA)" as one
// bullet, with "data brokers" as the established subject and "register"
// several words later. Checked as two separate signals that must BOTH
// appear somewhere in the same LINE (this template's per-provision content
// is consistently one bullet/line per claim) rather than as one rigid
// contiguous phrase.
const REGISTRATION_WORD_RE = /\bregist(?:er|ration|ry|ered)\w*\b/i;
const REGISTRATION_CONTEXT_RE = /\b(?:CPPA|CalPPA|California Privacy Protection Agency|data broker)\w*/i;

const MISATTRIBUTION_NOTE =
  " (this is a provision of California's Delete Act, SB 362 -- not the CCPA/CPRA)";

// Line-granular rather than whole-body regex substitution -- this
// template's per-provision content is consistently one bullet/line per
// claim (see the confirmed live example above), and annotating at the end
// of the flagged line avoids guessing exactly where mid-sentence to insert
// a note.
function annotateSection(sectionBody: string): { text: string; count: number } {
  let count = 0;
  const text = sectionBody
    .split("\n")
    .map((line) => {
      const flagged = DROP_SIGNAL_RE.test(line) || (REGISTRATION_WORD_RE.test(line) && REGISTRATION_CONTEXT_RE.test(line));
      if (!flagged) return line;
      count++;
      return `${line}${MISATTRIBUTION_NOTE}`;
    })
    .join("\n");
  return { text, count };
}

const HEADING_RE = /^##\s+(.+)$/gm;

export interface EntityAttributionCorrection {
  section: string;
  kind: "ccpa-delete-act-misattribution" | "cpp-agency-name";
  count: number;
}

// CPPA is the agency's own, official abbreviation (established by the
// CPRA/Prop 24) -- "CalPPA" is not a real variant, just a plausible-
// sounding one the model sometimes produces. Corrected globally, not
// scoped to CCPA-headed sections, since it's a plain name error wherever
// it appears.
function correctAgencyName(text: string): { text: string; count: number } {
  let count = 0;
  const corrected = text.replace(/\bCalPPA\b/g, () => {
    count++;
    return "CPPA";
  });
  return { text: corrected, count };
}

// Splits on the same "## <heading>" boundaries the sibling mechanical
// checks (legislative-status.ts, unsupported-claims.ts) use, so a
// multi-part comparison's California section is checked independently of
// any other state's -- a single-topic response with no "##" headings is
// treated as one section spanning the whole text.
export function enforceCaliforniaDataBrokerAttribution(text: string): { text: string; corrections: EntityAttributionCorrection[] } {
  const headingMatches = [...text.matchAll(HEADING_RE)];
  const spans =
    headingMatches.length > 0
      ? headingMatches.map((m, i) => ({
          key: m[1].trim(),
          start: m.index + m[0].length,
          end: i + 1 < headingMatches.length ? headingMatches[i + 1].index! : text.length,
        }))
      : [{ key: "(single section)", start: 0, end: text.length }];

  // What counts as the section's "title" for the CCPA/own-scope gate --
  // the "## <heading>" line itself for a multi-part section, or (with no
  // such heading) the section's own leading snippet, which is where a
  // single-question answer's "Official Title:"/opening sentence naming the
  // law actually lives. Checking the narrow title snippet rather than the
  // whole section body is what keeps the own-scope exclusion from being
  // defeatable by the misattributed content itself (see the comment on
  // CALIFORNIA_DATA_BROKER_TITLE_RE above).
  const TITLE_SNIPPET_CHARS = 300;

  const corrections: EntityAttributionCorrection[] = [];
  let result = text;
  for (let i = spans.length - 1; i >= 0; i--) {
    const { key, start, end } = spans[i];
    const sectionText = result.slice(start, end);
    const titleSnippet = headingMatches.length > 0 ? key : sectionText.slice(0, TITLE_SNIPPET_CHARS);
    if (!CCPA_HEADING_RE.test(titleSnippet) || CALIFORNIA_DATA_BROKER_TITLE_RE.test(titleSnippet)) continue;

    const { text: correctedSection, count } = annotateSection(sectionText);
    if (count > 0) {
      result = result.slice(0, start) + correctedSection + result.slice(end);
      corrections.unshift({ section: key, kind: "ccpa-delete-act-misattribution", count });
    }
  }

  const { text: agencyCorrected, count: agencyCount } = correctAgencyName(result);
  if (agencyCount > 0) {
    corrections.push({ section: "(whole response)", kind: "cpp-agency-name", count: agencyCount });
  }

  return { text: agencyCorrected, corrections };
}
