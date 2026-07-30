import { withAuth } from "@/lib/auth/with-auth";
import { deleteNote } from "@/lib/notebook/store";

export const dynamic = "force-dynamic";

export const DELETE = withAuth(
  async (_request: Request, { params }: { params: Promise<{ id: string; noteId: string }> }, user) => {
    const { id, noteId } = await params;
    await deleteNote(id, user.id, noteId);
    return Response.json({ ok: true });
  },
);
