import { addEntityToProject } from "@/lib/notebook/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json()) as { entityId?: string };
  if (!body.entityId) return Response.json({ error: "An entityId is required." }, { status: 400 });

  await addEntityToProject(id, body.entityId);
  return Response.json({ ok: true });
}
