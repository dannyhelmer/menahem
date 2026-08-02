import { upsertEdge, upsertEntity } from "@/lib/graph/store";
import { cleanProviderError } from "@/lib/search/clean-error";
import { getApiKey, isApiKeyConfigured } from "@/lib/settings/api-keys";
import { classifyBillStage, stageLabel } from "@/lib/timeline/classify";
import { upsertTimeline } from "@/lib/timeline/store";
import type { TimelineEvent } from "@/lib/timeline/types";
import type { GovDataProvider, GovRetrievalResult } from "../types";

const BASE_URL = "https://api.congress.gov/v3";

const VALID_BILL_TYPES = new Set(["hr", "s", "hres", "sres", "hjres", "sjres", "hconres", "sconres"]);
const BILL_IDENTIFIER_RE =
  /\b(h\.?\s?r\.?|h\.?\s?res\.?|h\.?\s?j\.?\s?res\.?|h\.?\s?con\.?\s?res\.?|s\.?\s?res\.?|s\.?\s?j\.?\s?res\.?|s\.?\s?con\.?\s?res\.?|s\.?)\s*(\d+)\b/i;

const BILL_TYPE_DISPLAY: Record<string, string> = {
  hr: "H.R.", s: "S.", hres: "H.Res.", sres: "S.Res.",
  hjres: "H.J.Res.", sjres: "S.J.Res.", hconres: "H.Con.Res.", sconres: "S.Con.Res.",
};

const NAME_HINT_RE = /\b[A-Z][A-Za-z]*\s+[A-Z][a-zA-Z]*\b/;

function currentCongressNumber(): number {
  return Math.floor((new Date().getFullYear() - 1789) / 2) + 1;
}

function parseBillIdentifier(text: string): { billType: string; billNumber: string } | null {
  const match = text.match(BILL_IDENTIFIER_RE);
  if (!match) return null;
  const rawType = match[1].replace(/[.\s]/g, "").toLowerCase();
  if (!VALID_BILL_TYPES.has(rawType)) return null;
  return { billType: rawType, billNumber: match[2] };
}

// A graph-store failure should never break the actual chat response -- the
// graph is additive infrastructure, not something the chat path depends on.
async function safeUpsertGraph(work: () => Promise<void>): Promise<void> {
  try {
    await work();
  } catch {
    // best-effort only
  }
}

async function callCongress(path: string, apiKey: string): Promise<unknown> {
  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("format", "json");
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw cleanProviderError("Congress.gov", response.status);
  return response.json();
}

// Congress.gov action text is natural-language and already contains vote
// tallies when a chamber vote happened, e.g. "On passage Passed by the Yeas
// and Nays: 220 - 213 (Roll no. 123)." or "Passed Senate without amendment
// by Yea-Nay Vote. 68 - 29." -- extracted here instead of re-deriving vote
// counts from a separate endpoint, since the action feed already states them
// verbatim.
const VOTE_TALLY_RE = /(\d+)\s*[-–]\s*(\d+)/;

function isChamberPassageAction(text: string): boolean {
  return /\bpassed\b|\bon passage\b|\bagreed to\b/i.test(text) && !/\breferred\b|\breport\b/i.test(text);
}

async function retrieveBill(query: string, apiKey: string): Promise<GovRetrievalResult> {
  const parsed = parseBillIdentifier(query);
  if (!parsed) return { success: false };

  const congress = currentCongressNumber();
  const { billType, billNumber } = parsed;
  const displayNumber = `${BILL_TYPE_DISPLAY[billType] ?? billType.toUpperCase()} ${billNumber}`;

  try {
    const detail = (await callCongress(`/bill/${congress}/${billType}/${billNumber}`, apiKey)) as {
      bill?: {
        title?: string;
        sponsors?: { fullName?: string; party?: string; state?: string; bioguideId?: string }[];
        cosponsors?: { count?: number };
        latestAction?: { actionDate?: string; text?: string };
        introducedDate?: string;
        policyArea?: { name?: string };
        laws?: { type?: string; number?: string }[];
      };
    };
    const bill = detail.bill;
    if (!bill) {
      return { success: false, note: `Congress.gov had no record of ${displayNumber} in the ${congress}th Congress.` };
    }

    const lines = [
      `Congress.gov record for ${displayNumber} (${congress}th Congress). Use ONLY this content -- do not invent sponsors, committees, actions, votes, or status not shown here. If a field below is absent, it was not found in this record -- say so explicitly rather than guessing.`,
      `Official Title: ${bill.title ?? "(untitled)"}`,
      `Bill Number: ${displayNumber}`,
      `Congress: ${congress}th Congress`,
    ];
    const sponsor = bill.sponsors?.[0];
    if (sponsor) {
      const cosponsorCount = bill.cosponsors?.count;
      lines.push(
        `Sponsor: ${sponsor.fullName ?? "unknown"} (${sponsor.party ?? "?"}-${sponsor.state ?? "?"})` +
          (typeof cosponsorCount === "number" ? `. Cosponsors: ${cosponsorCount}.` : ""),
      );
    }
    if (bill.introducedDate) lines.push(`Date Introduced: ${bill.introducedDate}`);
    if (bill.policyArea?.name) lines.push(`Policy Area: ${bill.policyArea.name}`);
    if (bill.latestAction) lines.push(`Current Status (latest action, ${bill.latestAction.actionDate ?? "?"}): ${bill.latestAction.text ?? ""}`);

    const law = bill.laws?.[0];
    if (law) lines.push(`Became law: ${law.type ?? "Public Law"} No. ${law.number ?? "(number not shown)"}.`);

    // Committees of referral -- a dedicated endpoint rather than parsing
    // "Referred to the Committee on..." out of the actions feed, since it
    // gives structured committee names directly.
    try {
      const committeesData = (await callCongress(`/bill/${congress}/${billType}/${billNumber}/committees`, apiKey)) as {
        committees?: { name?: string; chamber?: string }[];
      };
      const committees = committeesData.committees ?? [];
      if (committees.length > 0) {
        lines.push(
          `Committee(s) of Referral: ${committees.map((c) => `${c.name ?? "unknown committee"}${c.chamber ? ` (${c.chamber})` : ""}`).join("; ")}`,
        );
      }
    } catch {
      // Committee data is best-effort -- its absence doesn't invalidate the rest of the record.
    }

    const url = `https://www.congress.gov/bill/${congress}th-congress/${billType === "hr" ? "house-bill" : billType === "s" ? "senate-bill" : billType}/${billNumber}`;

    const billEntityId = `congress:bill:${congress}-${billType}-${billNumber}`;
    const sponsorId = sponsor
      ? sponsor.bioguideId
        ? `congress:member:${sponsor.bioguideId}`
        : `congress:member:name:${(sponsor.fullName ?? "unknown").toLowerCase().replace(/\s+/g, "-")}`
      : undefined;

    await safeUpsertGraph(async () => {
      await upsertEntity({
        id: billEntityId,
        type: "bill",
        label: `${displayNumber} -- ${bill.title ?? "(untitled)"}`,
        data: { congress, billType, billNumber, title: bill.title, policyArea: bill.policyArea?.name },
        source: "congress",
      });
      if (sponsor && sponsorId) {
        await upsertEntity({
          id: sponsorId,
          type: "representative",
          label: sponsor.fullName ?? "Unknown",
          data: { party: sponsor.party, state: sponsor.state },
          source: "congress",
        });
        await upsertEdge({ from: sponsorId, to: billEntityId, relationship: "sponsored" });
      }
    });

    // Actions feed drives both the graph timeline (existing behavior) and,
    // new here, the major-action/chamber-vote/signature lines surfaced
    // directly into liveData -- fetched once and reused for both rather than
    // making two separate calls for the same data.
    try {
      const actionsData = (await callCongress(`/bill/${congress}/${billType}/${billNumber}/actions`, apiKey)) as {
        actions?: { actionDate?: string; text?: string }[];
      };
      const actions = (actionsData.actions ?? []).filter((a) => a.actionDate && a.text);
      const chronological = [...actions].reverse(); // Congress.gov returns newest-first

      await safeUpsertGraph(async () => {
        const events: TimelineEvent[] = chronological.map((a) => {
          const stage = classifyBillStage(a.text!);
          return { date: a.actionDate!, label: stageLabel(stage), description: a.text!, stage };
        });
        if (events.length > 0) await upsertTimeline(billEntityId, events);
      });

      // Chamber vote totals -- lines whose text reads as a passage/agreement
      // action AND actually contains a numeric tally, so procedural motions
      // and voice votes (no numbers) are left out rather than misreported.
      const voteLines = chronological
        .filter((a) => isChamberPassageAction(a.text!) && VOTE_TALLY_RE.test(a.text!))
        .map((a) => `${a.actionDate}: ${a.text}`);
      if (voteLines.length > 0) {
        lines.push(`Chamber Vote Totals (as recorded in the actions feed):\n${voteLines.map((l) => `- ${l}`).join("\n")}`);
      }

      // Presidential signature -- the actions feed records this as a
      // dedicated action rather than a separate field on the bill object.
      const signAction = chronological.find((a) => /\bsigned by (the )?president\b/i.test(a.text!));
      if (signAction) lines.push(`Presidential Signature Date: ${signAction.actionDate}`);

      // A trimmed chronological list of the major actions (committee
      // referral, reporting, passage, signature) so the model has real
      // ordered milestones instead of only the single latest-action line.
      const majorStages = new Set(["introduced", "committee", "passed_chamber", "resolving_differences", "to_president", "signed", "vetoed"]);
      const majorActions = chronological.filter((a) => majorStages.has(classifyBillStage(a.text!)));
      if (majorActions.length > 0) {
        lines.push(
          `Major Committee Actions and Milestones (chronological):\n${majorActions
            .map((a) => `- ${a.actionDate}: ${a.text}`)
            .join("\n")}`,
        );
      }
    } catch {
      // Actions feed is best-effort -- its absence doesn't invalidate the rest of the record.
    }

    return {
      success: true,
      liveData: lines.join("\n"),
      sources: [{ title: `Congress.gov -- ${displayNumber}`, url }],
      graph: { entityId: billEntityId, representativeId: sponsorId },
    };
  } catch (err) {
    return { success: false, note: err instanceof Error ? err.message : "Congress.gov lookup failed." };
  }
}

async function retrieveMember(query: string, apiKey: string): Promise<GovRetrievalResult> {
  const nameMatch = query.match(NAME_HINT_RE);
  if (!nameMatch) return { success: false };
  const name = nameMatch[0];

  try {
    const congress = currentCongressNumber();
    const list = (await callCongress(`/member/congress/${congress}?limit=250`, apiKey)) as {
      members?: { name?: string; partyName?: string; state?: string; bioguideId?: string }[];
    };
    const members = list.members ?? [];
    const haystackMatch = members.find((m) => (m.name ?? "").toLowerCase().includes(name.toLowerCase()));
    if (!haystackMatch) {
      return { success: false, note: `Congress.gov: no current member matching "${name}" was found.` };
    }

    const lines = [
      `Congress.gov record for ${haystackMatch.name} -- use ONLY this content, do not invent committee assignments or votes not shown here.`,
      `Party: ${haystackMatch.partyName ?? "unknown"}`,
      `State: ${haystackMatch.state ?? "unknown"}`,
      "Note: Congress.gov's API has no per-bill roll-call vote endpoint -- if asked how this member voted on a specific bill, say plainly that vote-level data isn't available from this source rather than guessing.",
    ];

    const memberEntityId = haystackMatch.bioguideId ? `congress:member:${haystackMatch.bioguideId}` : undefined;
    if (memberEntityId) {
      await safeUpsertGraph(async () => {
        await upsertEntity({
          id: memberEntityId,
          type: "representative",
          label: haystackMatch.name ?? "Unknown",
          data: { party: haystackMatch.partyName, state: haystackMatch.state },
          source: "congress",
        });
      });
    }

    return {
      success: true,
      liveData: lines.join("\n"),
      sources: haystackMatch.bioguideId
        ? [{ title: `Congress.gov -- ${haystackMatch.name}`, url: `https://bioguide.congress.gov/search/bio/${haystackMatch.bioguideId}` }]
        : [],
      graph: memberEntityId ? { entityId: memberEntityId, representativeId: memberEntityId } : undefined,
    };
  } catch (err) {
    return { success: false, note: err instanceof Error ? err.message : "Congress.gov lookup failed." };
  }
}

export const congressProvider: GovDataProvider = {
  id: "congress",
  label: "Congress.gov",
  jurisdiction: "federal",

  async isConfigured() {
    return isApiKeyConfigured("congress");
  },

  async retrieve(query) {
    const apiKey = await getApiKey("congress");
    if (!apiKey) return { success: false, note: "Congress.gov isn't configured (Settings > Government Sources)." };

    const billResult = await retrieveBill(query, apiKey);
    if (billResult.success || billResult.note) return billResult;

    return retrieveMember(query, apiKey);
  },
};
