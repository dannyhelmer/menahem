import { deleteSession, isValidSessionId, loadSession, renameSession, setPinned } from "@/lib/memory/store";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  if (!isValidSessionId(sessionId)) return Response.json({ error: "Not found." }, { status: 404 });

  const session = await loadSession(sessionId);
  if (!session) return Response.json({ error: "Not found." }, { status: 404 });
  return Response.json(session);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  if (!isValidSessionId(sessionId)) return Response.json({ error: "Not found." }, { status: 404 });

  const body = (await request.json()) as { pinned?: boolean; title?: string };
  if (typeof body.pinned === "boolean") await setPinned(sessionId, body.pinned);
  if (typeof body.title === "string" && body.title.trim()) await renameSession(sessionId, body.title.trim());

  return Response.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  if (!isValidSessionId(sessionId)) return Response.json({ error: "Not found." }, { status: 404 });

  await deleteSession(sessionId);
  return Response.json({ ok: true });
}
