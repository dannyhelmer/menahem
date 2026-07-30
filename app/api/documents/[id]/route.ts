import { withAuth } from "@/lib/auth/with-auth";
import { deleteDocument, getDocument, getDocumentText } from "@/lib/documents/store";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const document = await getDocument(id);
  if (!document) return Response.json({ error: "Not found." }, { status: 404 });

  const text = await getDocumentText(id);
  return Response.json({ document, text });
});

export const DELETE = withAuth(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  await deleteDocument(id);
  return Response.json({ ok: true });
});
