import type { Metadata } from "next";
import ChatView from "@/app/_components/ChatView";
import { needsApiKeySetup } from "@/lib/ai/get-provider";
import { requireApprovedPageUser } from "@/lib/auth/session";
import { listAllEntities } from "@/lib/graph/store";
import type { EntityType } from "@/lib/graph/types";

// Plain "Menahem" during normal app usage -- the fuller SEO title/description
// (see lib/seo/constants.ts) is what search engines see via the root
// layout's default metadata for public, indexable pages, not this one
// (this page is noindexed anyway -- see (app)/layout.tsx).
export const metadata: Metadata = {
  title: { absolute: "Menahem" },
};

const RECENT_RESEARCH_TYPES = new Set<EntityType>(["bill", "representative", "candidate"]);
const RECENT_RESEARCH_LIMIT = 6;

export default async function Home() {
  const user = await requireApprovedPageUser();
  const [entities, needsApiKey] = await Promise.all([listAllEntities(), needsApiKeySetup()]);

  const recentEntities = entities
    .filter((entity) => RECENT_RESEARCH_TYPES.has(entity.type))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, RECENT_RESEARCH_LIMIT);

  return <ChatView recentEntities={recentEntities} needsApiKey={needsApiKey} />;
}
