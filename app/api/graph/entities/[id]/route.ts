import { getConnectedEntities, getEntity } from "@/lib/graph/store";
import { getTimeline } from "@/lib/timeline/store";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const entityId = decodeURIComponent(id);

  const entity = await getEntity(entityId);
  if (!entity) return Response.json({ error: "Not found." }, { status: 404 });

  const connected = await getConnectedEntities(entityId);
  const timeline = await getTimeline(entityId);
  return Response.json({ entity, connected, timeline });
}
