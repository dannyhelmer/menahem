import { getEntity } from "@/lib/graph/store";
import { getSummaries } from "@/lib/memory/store";
import { deleteProject, getProject, renameProject } from "@/lib/notebook/store";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return Response.json({ error: "Not found." }, { status: 404 });

  const [entities, conversations] = await Promise.all([
    Promise.all(project.entityIds.map((entityId) => getEntity(entityId))),
    getSummaries(project.conversationIds),
  ]);

  return Response.json({
    project,
    entities: entities.filter((e) => e !== null),
    conversations,
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json()) as { name?: string; description?: string };
  const project = await renameProject(id, body);
  if (!project) return Response.json({ error: "Not found." }, { status: 404 });
  return Response.json(project);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await deleteProject(id);
  return Response.json({ ok: true });
}
