import { upsertEdge, upsertEntity } from "@/lib/graph/store";
import { cleanProviderError } from "@/lib/search/clean-error";
import { getApiKey, isApiKeyConfigured } from "@/lib/settings/api-keys";
import type { GovDataProvider, GovRetrievalResult } from "../types";

// A graph-store failure should never break the actual chat response -- the
// graph is additive infrastructure, not something the chat path depends on.
async function safeUpsertGraph(work: () => Promise<void>): Promise<void> {
  try {
    await work();
  } catch {
    // best-effort only
  }
}

const BASE_URL = "https://api.open.fec.gov/v1";

const NAME_HINT_RE = /\b[A-Z][A-Za-z]*(?:\s+[A-Z][A-Za-z]*){1,3}\b/;
const TITLE_PREFIX_RE = /^(governor|senator|representative|congressman|congresswoman|president|mayor)\s+/i;

function extractCandidateName(text: string): string | null {
  const match = text.match(NAME_HINT_RE);
  if (!match) return null;
  return match[0].replace(TITLE_PREFIX_RE, "").trim();
}

function formatMoney(value: number | null | undefined): string | null {
  return typeof value === "number" ? `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : null;
}

async function callFec(path: string, params: Record<string, string>, apiKey: string): Promise<{ results?: unknown[] }> {
  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set("api_key", apiKey);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw cleanProviderError("FEC", response.status);
  return response.json();
}

export const fecProvider: GovDataProvider = {
  id: "fec",
  label: "OpenFEC",
  jurisdiction: "federal",

  async isConfigured() {
    return isApiKeyConfigured("fec");
  },

  async retrieve(query): Promise<GovRetrievalResult> {
    const apiKey = await getApiKey("fec");
    if (!apiKey) return { success: false, note: "FEC isn't configured (Settings > Government Sources)." };

    const name = extractCandidateName(query);
    if (!name) return { success: false, note: "Couldn't determine which candidate this question is about." };

    try {
      const search = await callFec("/candidates/search/", { q: name, per_page: "1" }, apiKey);
      const candidate = (search.results as { candidate_id?: string; name?: string; party_full?: string; office_full?: string }[])?.[0];
      if (!candidate?.candidate_id) {
        return { success: false, note: `FEC has no record matching "${name}".` };
      }

      const lines = [
        `OpenFEC record for ${candidate.name} (${candidate.party_full ?? "party unknown"}, ${candidate.office_full ?? "office unknown"}). Use ONLY this content -- never state a specific dollar figure not shown here.`,
      ];

      const candidateEntityId = `fec:candidate:${candidate.candidate_id}`;
      await safeUpsertGraph(async () => {
        await upsertEntity({
          id: candidateEntityId,
          type: "candidate",
          label: candidate.name ?? "Unknown",
          data: { party: candidate.party_full, office: candidate.office_full },
          source: "fec",
        });
      });

      const totalsData = await callFec(`/candidate/${candidate.candidate_id}/totals/`, { sort: "-cycle", per_page: "1" }, apiKey);
      const totals = (totalsData.results as {
        receipts?: number; disbursements?: number; cash_on_hand_end_period?: number; cycle?: number;
      }[])?.[0];
      if (totals) {
        lines.push(`Cycle: ${totals.cycle ?? "?"}`);
        const receipts = formatMoney(totals.receipts);
        const disbursements = formatMoney(totals.disbursements);
        const cashOnHand = formatMoney(totals.cash_on_hand_end_period);
        if (receipts) lines.push(`Total receipts: ${receipts}`);
        if (disbursements) lines.push(`Total disbursements: ${disbursements}`);
        if (cashOnHand) lines.push(`Cash on hand: ${cashOnHand}`);
      } else {
        lines.push("No financial totals were available for this candidate.");
      }

      const committees = await callFec(`/candidate/${candidate.candidate_id}/committees/`, { per_page: "1" }, apiKey);
      const committee = (committees.results as { committee_id?: string; designation?: string; name?: string }[])?.find(
        (c) => c.designation === "P",
      ) ?? (committees.results as { committee_id?: string; name?: string }[])?.[0];

      if (committee?.committee_id) {
        await safeUpsertGraph(async () => {
          const committeeEntityId = `fec:committee:${committee.committee_id}`;
          await upsertEntity({
            id: committeeEntityId,
            type: "committee",
            label: committee.name ?? committee.committee_id!,
            data: {},
            source: "fec",
          });
          await upsertEdge({ from: candidateEntityId, to: committeeEntityId, relationship: "has_committee" });
        });
        const contributions = await callFec(
          "/schedules/schedule_a/",
          { committee_id: committee.committee_id, sort: "-contribution_receipt_amount", per_page: "5" },
          apiKey,
        );
        const top = contributions.results as { contributor_name?: string; contribution_receipt_amount?: number }[];
        if (top?.length) {
          lines.push(
            "Largest individual itemized contributions on file (a sample, not a comprehensive donor breakdown -- OpenFEC has no such aggregate endpoint):",
          );
          for (const c of top) {
            const amount = formatMoney(c.contribution_receipt_amount);
            if (c.contributor_name && amount) lines.push(`- ${c.contributor_name}: ${amount}`);
          }
        }
      }

      return {
        success: true,
        liveData: lines.join("\n"),
        sources: [{ title: `OpenFEC -- ${candidate.name}`, url: `https://www.fec.gov/data/candidate/${candidate.candidate_id}/` }],
      };
    } catch (err) {
      return { success: false, note: err instanceof Error ? err.message : "FEC lookup failed." };
    }
  },
};
