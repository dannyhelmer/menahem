import { removeEntityFromProject } from "@/lib/notebook/store";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; entityId: string }> },
) {
  const { id, entityId } = await params;
  await removeEntityFromProject(id, decodeURIComponent(entityId));
  return Response.json({ ok: true });
}
