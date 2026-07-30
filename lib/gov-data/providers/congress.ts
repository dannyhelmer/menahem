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
        latestAction?: { actionDate?: string; text?: string };
        introducedDate?: string;
        policyArea?: { name?: string };
      };
    };
    const bill = detail.bill;
    if (!bill) {
      return { success: false, note: `Congress.gov had no record of ${displayNumber} in the ${congress}th Congress.` };
    }

    const lines = [
      `Congress.gov record for ${displayNumber} (${congress}th Congress). Use ONLY this content -- do not invent sponsors, actions, or status not shown here.`,
      `Title: ${bill.title ?? "(untitled)"}`,
    ];
    const sponsor = bill.sponsors?.[0];
    if (sponsor) {
      lines.push(`Sponsor: ${sponsor.fullName ?? "unknown"} (${sponsor.party ?? "?"}-${sponsor.state ?? "?"})`);
    }
    if (bill.introducedDate) lines.push(`Introduced: ${bill.introducedDate}`);
    if (bill.policyArea?.name) lines.push(`Policy area: ${bill.policyArea.name}`);
    if (bill.latestAction) lines.push(`Latest action (${bill.latestAction.actionDate ?? "?"}): ${bill.latestAction.text ?? ""}`);

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

    await safeUpsertGraph(async () => {
      const actionsData = (await callCongress(`/bill/${congress}/${billType}/${billNumber}/actions`, apiKey)) as {
        actions?: { actionDate?: string; text?: string }[];
      };
      const events: TimelineEvent[] = (actionsData.actions ?? [])
        .filter((a) => a.actionDate && a.text)
        .map((a) => {
          const stage = classifyBillStage(a.text!);
          return { date: a.actionDate!, label: stageLabel(stage), description: a.text!, stage };
        })
        .reverse(); // Congress.gov returns newest-first; timelines read chronologically
      if (events.length > 0) await upsertTimeline(billEntityId, events);
    });

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
