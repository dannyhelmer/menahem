import { withAuth } from "@/lib/auth/with-auth";
import { deleteCitation } from "@/lib/notebook/store";

export const dynamic = "force-dynamic";

export const DELETE = withAuth(
  async (_request: Request, { params }: { params: Promise<{ id: string; citationId: string }> }, user) => {
    const { id, citationId } = await params;
    await deleteCitation(id, user.id, citationId);
    return Response.json({ ok: true });
  },
);
