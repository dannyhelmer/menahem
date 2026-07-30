import { withAuth } from "@/lib/auth/with-auth";
import { deleteSession, isValidSessionId, loadSession, renameSession, setPinned } from "@/lib/memory/store";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (_request: Request, { params }: { params: Promise<{ sessionId: string }> }, user) => {
  const { sessionId } = await params;
  if (!isValidSessionId(sessionId)) return Response.json({ error: "Not found." }, { status: 404 });

  const session = await loadSession(sessionId, user.id);
  if (!session) return Response.json({ error: "Not found." }, { status: 404 });
  return Response.json(session);
});

export const PATCH = withAuth(async (request: Request, { params }: { params: Promise<{ sessionId: string }> }, user) => {
  const { sessionId } = await params;
  if (!isValidSessionId(sessionId)) return Response.json({ error: "Not found." }, { status: 404 });

  const body = (await request.json()) as { pinned?: boolean; title?: string };
  if (typeof body.pinned === "boolean") await setPinned(sessionId, user.id, body.pinned);
  if (typeof body.title === "string" && body.title.trim()) await renameSession(sessionId, user.id, body.title.trim());

  return Response.json({ ok: true });
});

export const DELETE = withAuth(async (_request: Request, { params }: { params: Promise<{ sessionId: string }> }, user) => {
  const { sessionId } = await params;
  if (!isValidSessionId(sessionId)) return Response.json({ error: "Not found." }, { status: 404 });

  await deleteSession(sessionId, user.id);
  return Response.json({ ok: true });
});
