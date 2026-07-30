import { withAuth } from "@/lib/auth/with-auth";
import { removeEntityFromProject } from "@/lib/notebook/store";

export const dynamic = "force-dynamic";

export const DELETE = withAuth(
  async (_request: Request, { params }: { params: Promise<{ id: string; entityId: string }> }, user) => {
    const { id, entityId } = await params;
    await removeEntityFromProject(id, user.id, decodeURIComponent(entityId));
    return Response.json({ ok: true });
  },
);
