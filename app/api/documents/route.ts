import path from "node:path";
import { pathToFileURL } from "node:url";
import { PDFParse } from "pdf-parse";
import { generateDocumentSummary } from "@/lib/documents/summarize";
import { listDocuments, saveDocument } from "@/lib/documents/store";
import { withAuth } from "@/lib/auth/with-auth";

export const dynamic = "force-dynamic";

// pdfjs-dist (which pdf-parse wraps) tries to dynamically import its worker
// script relative to its own bundled location -- under Next.js/Turbopack
// that path doesn't exist in the compiled output. Pointing it at the real
// file in node_modules directly sidesteps the broken bundled path (as a
// proper file:// URL -- Node's ESM loader rejects a raw Windows path). A
// single short-lived parse per request doesn't need true multi-threading.
PDFParse.setWorker(
  pathToFileURL(
    path.join(process.cwd(), "node_modules", "pdfjs-dist", "legacy", "build", "pdf.worker.mjs"),
  ).href,
);

export const GET = withAuth(async (request: Request) => {
  const projectId = new URL(request.url).searchParams.get("projectId");
  if (!projectId) return Response.json({ error: "projectId is required." }, { status: 400 });

  const documents = await listDocuments(projectId);
  return Response.json({ documents });
});

export const POST = withAuth(async (request: Request, _ctx, user) => {
  const formData = await request.formData();
  const projectId = formData.get("projectId");
  const file = formData.get("file");

  if (typeof projectId !== "string" || !projectId) {
    return Response.json({ error: "projectId is required." }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return Response.json({ error: "A file is required." }, { status: 400 });
  }
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return Response.json({ error: "Only PDF files are supported." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let text: string;
  try {
    const parser = new PDFParse({ data: buffer });
    try {
      const parsed = await parser.getText();
      text = parsed.text;
    } finally {
      await parser.destroy();
    }
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? `Couldn't read that PDF: ${err.message}` : "Couldn't read that PDF." },
      { status: 400 },
    );
  }

  const summary = await generateDocumentSummary(text, user.id);
  const document = await saveDocument({ projectId, filename: file.name, summary }, buffer, text);

  return Response.json(document);
});
