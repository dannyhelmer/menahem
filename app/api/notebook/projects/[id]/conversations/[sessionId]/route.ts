import { removeConversationFromProject } from "@/lib/notebook/store";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; sessionId: string }> },
) {
  const { id, sessionId } = await params;
  await removeConversationFromProject(id, sessionId);
  return Response.json({ ok: true });
}
