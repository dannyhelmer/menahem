"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";

export default function DocumentUpload({ projectId }: { projectId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"idle" | "uploading">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setStatus("uploading");
    setError(null);
    try {
      const formData = new FormData();
      formData.append("projectId", projectId);
      formData.append("file", file);
      const response = await fetch("/api/documents", { method: "POST", body: formData });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setError(data?.error ?? "Upload failed.");
        return;
      }
      router.refresh();
    } finally {
      setStatus("idle");
    }
  }

  return (
    <div className="space-y-2">
      <button
        onClick={() => inputRef.current?.click()}
        disabled={status === "uploading"}
        className="hover:border-burgundy/40 hover:text-burgundy flex items-center gap-2 rounded-xl border border-neutral-200 px-4 py-2.5 text-sm font-medium text-neutral-600 transition-colors disabled:pointer-events-none disabled:opacity-50 dark:border-neutral-800 dark:text-neutral-300"
      >
        <Upload className="h-4 w-4" aria-hidden="true" />
        {status === "uploading" ? "Uploading..." : "Upload PDF"}
      </button>
      <input ref={inputRef} type="file" accept="application/pdf" onChange={handleFileChange} className="hidden" />
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
