import { withAuth } from "@/lib/auth/with-auth";
import { removeConversationFromProject } from "@/lib/notebook/store";

export const dynamic = "force-dynamic";

export const DELETE = withAuth(
  async (_request: Request, { params }: { params: Promise<{ id: string; sessionId: string }> }) => {
    const { id, sessionId } = await params;
    await removeConversationFromProject(id, sessionId);
    return Response.json({ ok: true });
  },
);
