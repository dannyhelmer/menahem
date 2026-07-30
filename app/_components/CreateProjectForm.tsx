"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus } from "lucide-react";
import type { ResearchProject } from "@/lib/notebook/types";

export default function CreateProjectForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || submitting) return;

    setSubmitting(true);
    try {
      const response = await fetch("/api/notebook/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, description: description.trim() }),
      });
      const project = (await response.json()) as ResearchProject;
      router.push(`/workspace/projects/${project.id}`);
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="bg-burgundy hover:bg-burgundy-dark flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-white transition-colors duration-150"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        New Project
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
    >
      <input
        autoFocus
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Project name"
        className="focus:border-burgundy/40 w-full rounded-lg border border-neutral-200 bg-transparent px-3 py-2 text-sm text-neutral-800 focus:outline-none dark:border-neutral-700 dark:text-neutral-100"
      />
      <textarea
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        placeholder="What is this project about? (optional)"
        rows={2}
        className="focus:border-burgundy/40 w-full resize-none rounded-lg border border-neutral-200 bg-transparent px-3 py-2 text-sm text-neutral-800 focus:outline-none dark:border-neutral-700 dark:text-neutral-100"
      />
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={!name.trim() || submitting}
          className="bg-burgundy hover:bg-burgundy-dark rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors duration-150 disabled:pointer-events-none disabled:opacity-40"
        >
          Create
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg px-4 py-2 text-sm font-medium text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
