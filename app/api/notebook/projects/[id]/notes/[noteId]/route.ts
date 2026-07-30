import { deleteNote } from "@/lib/notebook/store";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; noteId: string }> },
) {
  const { id, noteId } = await params;
  await deleteNote(id, noteId);
  return Response.json({ ok: true });
}
