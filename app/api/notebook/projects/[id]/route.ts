import { withAuth } from "@/lib/auth/with-auth";
import { getEntity } from "@/lib/graph/store";
import { getSummaries } from "@/lib/memory/store";
import { deleteProject, getProject, renameProject } from "@/lib/notebook/store";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (_request: Request, { params }: { params: Promise<{ id: string }> }, user) => {
  const { id } = await params;
  const project = await getProject(id, user.id);
  if (!project) return Response.json({ error: "Not found." }, { status: 404 });

  const [entities, conversations] = await Promise.all([
    Promise.all(project.entityIds.map((entityId) => getEntity(entityId))),
    getSummaries(user.id, project.conversationIds),
  ]);

  return Response.json({
    project,
    entities: entities.filter((e) => e !== null),
    conversations,
  });
});

export const PATCH = withAuth(async (request: Request, { params }: { params: Promise<{ id: string }> }, user) => {
  const { id } = await params;
  const body = (await request.json()) as { name?: string; description?: string };
  const project = await renameProject(id, user.id, body);
  if (!project) return Response.json({ error: "Not found." }, { status: 404 });
  return Response.json(project);
});

export const DELETE = withAuth(async (_request: Request, { params }: { params: Promise<{ id: string }> }, user) => {
  const { id } = await params;
  await deleteProject(id, user.id);
  return Response.json({ ok: true });
});
