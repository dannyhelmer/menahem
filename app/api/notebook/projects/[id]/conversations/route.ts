import { withAuth } from "@/lib/auth/with-auth";
import { isValidSessionId } from "@/lib/memory/store";
import { addConversationToProject } from "@/lib/notebook/store";

export const dynamic = "force-dynamic";

export const POST = withAuth(async (request: Request, { params }: { params: Promise<{ id: string }> }, user) => {
  const { id } = await params;
  const body = (await request.json()) as { sessionId?: string };
  if (!body.sessionId || !isValidSessionId(body.sessionId)) {
    return Response.json({ error: "A valid sessionId is required." }, { status: 400 });
  }

  await addConversationToProject(id, user.id, body.sessionId);
  return Response.json({ ok: true });
});
