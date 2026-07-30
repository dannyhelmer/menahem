import { withAuth } from "@/lib/auth/with-auth";
import { getDocument, getDocumentFile } from "@/lib/documents/store";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const [document, file] = await Promise.all([getDocument(id), getDocumentFile(id)]);
  if (!document || !file) return Response.json({ error: "Not found." }, { status: 404 });

  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${document.filename.replace(/"/g, "")}"`,
    },
  });
});
