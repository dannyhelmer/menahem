import { withAuth } from "@/lib/auth/with-auth";
import {
  deleteSession,
  deleteSessionPermanently,
  isValidSessionId,
  loadSession,
  renameSession,
  restoreSession,
  setPinned,
} from "@/lib/memory/store";

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

  const body = (await request.json()) as { pinned?: boolean; title?: string; restore?: boolean };
  if (typeof body.pinned === "boolean") await setPinned(sessionId, user.id, body.pinned);
  if (typeof body.title === "string" && body.title.trim()) await renameSession(sessionId, user.id, body.title.trim());
  if (body.restore === true) await restoreSession(sessionId, user.id);

  return Response.json({ ok: true });
});

export const DELETE = withAuth(async (request: Request, { params }: { params: Promise<{ sessionId: string }> }, user) => {
  const { sessionId } = await params;
  if (!isValidSessionId(sessionId)) return Response.json({ error: "Not found." }, { status: 404 });

  // Check for ?permanent=true query param to distinguish soft delete
  // (move to trash) from permanent delete.
  const url = new URL(request.url);
  const permanent = url.searchParams.get("permanent") === "true";

  if (permanent) {
    await deleteSessionPermanently(sessionId, user.id);
  } else {
    await deleteSession(sessionId, user.id);
  }
  return Response.json({ ok: true });
});
