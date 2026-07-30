"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";

const ACCEPTED_EXTENSIONS = [".pdf", ".docx", ".txt", ".md"];

export default function DocumentUpload({ projectId }: { projectId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"idle" | "uploading">("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const extension = `.${file.name.split(".").pop()?.toLowerCase()}`;
    if (!ACCEPTED_EXTENSIONS.includes(extension)) {
      setError("Unsupported file type. Menahem accepts PDF, DOCX, TXT, and Markdown files.");
      return;
    }

    setStatus("uploading");
    setProgress(0);
    setError(null);

    const formData = new FormData();
    formData.append("projectId", projectId);
    formData.append("file", file);

    // XHR (not fetch) so upload progress is observable -- fetch has no
    // upload-progress event for request bodies.
    await new Promise<void>((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/documents");
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          router.refresh();
        } else {
          const data = (() => {
            try {
              return JSON.parse(xhr.responseText) as { error?: string };
            } catch {
              return null;
            }
          })();
          setError(data?.error ?? "Upload failed. Try again.");
        }
        resolve();
      };
      xhr.onerror = () => {
        setError("Upload failed -- lost connection to Menahem.");
        resolve();
      };
      xhr.send(formData);
    });

    setStatus("idle");
    setProgress(0);
  }

  return (
    <div className="space-y-2">
      <button
        onClick={() => inputRef.current?.click()}
        disabled={status === "uploading"}
        className="hover:border-burgundy/40 hover:text-burgundy flex items-center gap-2 rounded-xl border border-neutral-200 px-4 py-2.5 text-sm font-medium text-neutral-600 transition-colors disabled:pointer-events-none disabled:opacity-50 dark:border-neutral-800 dark:text-neutral-300"
      >
        <Upload className="h-4 w-4" aria-hidden="true" />
        {status === "uploading" ? `Uploading... ${progress}%` : "Upload Document"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS.join(",")}
        onChange={handleFileChange}
        className="hidden"
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
