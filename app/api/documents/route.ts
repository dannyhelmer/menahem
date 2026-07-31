import path from "node:path";
import { pathToFileURL } from "node:url";
import mammoth from "mammoth";
import "@/lib/documents/pdf-polyfills";
import { PDFParse } from "pdf-parse";
import { generateDocumentSummary } from "@/lib/documents/summarize";
import { listDocuments, saveDocument } from "@/lib/documents/store";
import { withAuth } from "@/lib/auth/with-auth";
import { checkUploadLimit, checkFileSize } from "@/lib/subscription/guards";
import { incrementUploadCount, recordUploadEvent } from "@/lib/subscription/store";

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

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

async function extractText(file: File, buffer: Buffer): Promise<string> {
  const name = file.name.toLowerCase();

  if (file.type === "application/pdf" || name.endsWith(".pdf")) {
    const parser = new PDFParse({ data: buffer });
    try {
      return (await parser.getText()).text;
    } finally {
      await parser.destroy();
    }
  }

  if (
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    name.endsWith(".docx")
  ) {
    const { value } = await mammoth.extractRawText({ buffer });
    return value;
  }

  if (name.endsWith(".txt") || name.endsWith(".md") || file.type === "text/plain" || file.type === "text/markdown") {
    return buffer.toString("utf-8");
  }

  throw new Error("Unsupported file type. Menahem accepts PDF, DOCX, TXT, and Markdown files.");
}

export const GET = withAuth(async (request: Request, _ctx, user) => {
  const projectId = new URL(request.url).searchParams.get("projectId");
  if (!projectId) return Response.json({ error: "projectId is required." }, { status: 400 });

  const documents = await listDocuments(projectId, user.id);
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
  if (file.size === 0) {
    return Response.json({ error: "That file is empty." }, { status: 400 });
  }

  // ---- Subscription limit check: file size ----
  const sizeCheck = await checkFileSize(user, file.size);
  if (!sizeCheck.allowed) {
    return Response.json(
      {
        error: sizeCheck.reason ?? "File too large.",
        limit: { type: "file_size", current: sizeCheck.current, max: sizeCheck.max, plan: sizeCheck.plan },
      },
      { status: 403 },
    );
  }

  // ---- Subscription limit check: upload count ----
  const uploadCheck = await checkUploadLimit(user);
  if (!uploadCheck.allowed) {
    return Response.json(
      {
        error: uploadCheck.reason ?? "Upload limit reached.",
        limit: {
          type: "uploads",
          current: uploadCheck.current,
          max: uploadCheck.max,
          plan: uploadCheck.plan,
          nextAvailableAt: uploadCheck.nextAvailableAt,
        },
      },
      { status: 403 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let text: string;
  try {
    text = await extractText(file, buffer);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? `Couldn't read that file: ${err.message}` : "Couldn't read that file." },
      { status: 400 },
    );
  }

  if (!text.trim()) {
    return Response.json({ error: "That file doesn't appear to contain any readable text." }, { status: 400 });
  }

  const summary = await generateDocumentSummary(text, user.id);
  const document = await saveDocument(user.id, { projectId, filename: file.name, summary }, buffer, text);

  // Record the upload event and increment the counter
  await recordUploadEvent(user.id, document.id, file.name, file.size);
  await incrementUploadCount(user.id);

  return Response.json(document);
});
