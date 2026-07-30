"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FileText, X } from "lucide-react";
import type { StoredDocument } from "@/lib/documents/types";
import ConfirmDialog from "./ConfirmDialog";
import DocumentQnA from "./DocumentQnA";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentPanel({ document }: { document: StoredDocument }) {
  const router = useRouter();
  const [askOpen, setAskOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  function handleDelete() {
    setConfirmOpen(true);
  }

  async function confirmDelete() {
    setConfirmOpen(false);
    setDeleting(true);
    await fetch(`/api/documents/${document.id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-neutral-200 px-4 py-3 dark:border-neutral-800">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" aria-hidden="true" />
          <div className="min-w-0">
            <a
              href={`/api/documents/${document.id}/file`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-burgundy truncate text-sm font-medium text-neutral-800 dark:text-neutral-100"
            >
              {document.filename}
            </a>
            <p className="text-xs text-neutral-400 dark:text-neutral-500">
              {formatSize(document.sizeBytes)} · Uploaded {new Date(document.uploadedAt).toLocaleDateString()}
            </p>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">{document.summary}</p>
          </div>
        </div>
        <button
          onClick={handleDelete}
          disabled={deleting}
          aria-label="Delete document"
          className="rounded p-1 text-neutral-400 hover:text-red-600 disabled:opacity-50"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      <button
        onClick={() => setAskOpen((prev) => !prev)}
        className="hover:text-burgundy mt-3 text-xs font-medium text-neutral-500 dark:text-neutral-400"
      >
        {askOpen ? "Hide" : "Ask about this document"}
      </button>
      {askOpen && (
        <div className="mt-3">
          <DocumentQnA documentId={document.id} />
        </div>
      )}
      <ConfirmDialog
        open={confirmOpen}
        title="Delete document?"
        message={`Delete "${document.filename}"? This can't be undone.`}
        onConfirm={confirmDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
