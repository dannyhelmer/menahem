import { withAuth } from "@/lib/auth/with-auth";
import { removeEntityFromProject } from "@/lib/notebook/store";

export const dynamic = "force-dynamic";

export const DELETE = withAuth(
  async (_request: Request, { params }: { params: Promise<{ id: string; entityId: string }> }) => {
    const { id, entityId } = await params;
    await removeEntityFromProject(id, decodeURIComponent(entityId));
    return Response.json({ ok: true });
  },
);
