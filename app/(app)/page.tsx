import ChatView from "@/app/_components/ChatView";
import { listAllEntities } from "@/lib/graph/store";
import type { EntityType } from "@/lib/graph/types";

const RECENT_RESEARCH_TYPES = new Set<EntityType>(["bill", "representative", "candidate"]);
const RECENT_RESEARCH_LIMIT = 6;

export default async function Home() {
  const entities = await listAllEntities();

  const recentEntities = entities
    .filter((entity) => RECENT_RESEARCH_TYPES.has(entity.type))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, RECENT_RESEARCH_LIMIT);

  return <ChatView recentEntities={recentEntities} />;
}
