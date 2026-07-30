import { deleteCitation } from "@/lib/notebook/store";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; citationId: string }> },
) {
  const { id, citationId } = await params;
  await deleteCitation(id, citationId);
  return Response.json({ ok: true });
}
