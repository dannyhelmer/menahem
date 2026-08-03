import path from "node:path";
import { pathToFileURL } from "node:url";
import mammoth from "mammoth";
import "@/lib/documents/pdf-polyfills";
import { PDFParse } from "pdf-parse";
import { generateDocumentSummary } from "@/lib/documents/summarize";
import { listDocuments, saveDocument } from "@/lib/documents/store";
import type { DocumentPage } from "@/lib/documents/types";
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

interface ExtractedDocument {
  pages: DocumentPage[];
  // True only for PDF -- pages[].pageNumber is a REAL page number in that
  // case (pdf-parse's getText() already computes per-page text internally;
  // this reads that instead of only the flattened whole-document string it
  // also returns). DOCX/TXT/MD have no real page concept, so they come back
  // as a single page (pageNumber 1) and `paginated: false` -- callers must
  // never present a page-number citation for those, only a document/line
  // reference.
  paginated: boolean;
}

async function extractDocument(file: File, buffer: Buffer): Promise<ExtractedDocument> {
  const name = file.name.toLowerCase();

  if (file.type === "application/pdf" || name.endsWith(".pdf")) {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return {
        paginated: true,
        pages: result.pages.map((page) => ({ pageNumber: page.num, text: page.text })),
      };
    } finally {
      await parser.destroy();
    }
  }

  if (
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    name.endsWith(".docx")
  ) {
    const { value } = await mammoth.extractRawText({ buffer });
    return { paginated: false, pages: [{ pageNumber: 1, text: value }] };
  }

  if (name.endsWith(".txt") || name.endsWith(".md") || file.type === "text/plain" || file.type === "text/markdown") {
    return { paginated: false, pages: [{ pageNumber: 1, text: buffer.toString("utf-8") }] };
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
  // projectId is optional -- a document attached directly in the chat
  // composer isn't part of any Political Workspace project (that's a
  // separate, Pro-only feature). Only the project Document Panel sends a
  // real projectId here.
  const projectIdField = formData.get("projectId");
  const projectId = typeof projectIdField === "string" && projectIdField ? projectIdField : null;
  const file = formData.get("file");

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

  let extracted: ExtractedDocument;
  try {
    extracted = await extractDocument(file, buffer);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? `Couldn't read that file: ${err.message}` : "Couldn't read that file." },
      { status: 400 },
    );
  }

  if (extracted.pages.every((page) => !page.text.trim())) {
    return Response.json({ error: "That file doesn't appear to contain any readable text." }, { status: 400 });
  }

  const fullText = extracted.pages.map((page) => page.text).join("\n\n");
  const summary = await generateDocumentSummary(fullText, user.id);
  const document = await saveDocument(
    user.id,
    { projectId, filename: file.name, summary },
    buffer,
    extracted.pages,
    extracted.paginated,
  );

  // Record the upload event and increment the counter
  await recordUploadEvent(user.id, document.id, file.name, file.size);
  await incrementUploadCount(user.id);

  return Response.json(document);
});
