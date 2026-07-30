"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ResearchProject } from "@/lib/notebook/types";
import ConfirmDialog from "./ConfirmDialog";
import { TrashIcon } from "./icons";

export default function ProjectListItem({ project }: { project: ResearchProject }) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function confirmDelete() {
    setConfirmOpen(false);
    await fetch(`/api/notebook/projects/${project.id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <li className="group relative">
      <Link
        href={`/workspace/projects/${project.id}`}
        className="hover:border-burgundy/40 hover:shadow-sm block rounded-2xl border border-neutral-200 bg-white px-5 py-4 transition-all duration-150 dark:border-neutral-800 dark:bg-neutral-900"
      >
        <h2 className="pr-8 text-base font-semibold text-neutral-900 dark:text-neutral-100">{project.name}</h2>
        {project.description && (
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{project.description}</p>
        )}
        <p className="mt-2 text-xs text-neutral-400 dark:text-neutral-500">
          {project.notes.length} note{project.notes.length === 1 ? "" : "s"} ·{" "}
          {project.citations.length} citation{project.citations.length === 1 ? "" : "s"} ·{" "}
          {project.entityIds.length} saved entit{project.entityIds.length === 1 ? "y" : "ies"} ·{" "}
          {project.conversationIds.length} conversation{project.conversationIds.length === 1 ? "" : "s"}
        </p>
      </Link>
      <button
        onClick={() => setConfirmOpen(true)}
        aria-label="Delete project"
        className="absolute top-4 right-4 hidden rounded p-1 text-neutral-400 hover:text-red-600 group-hover:block"
      >
        <TrashIcon />
      </button>
      <ConfirmDialog
        open={confirmOpen}
        title="Delete project?"
        message={`Delete "${project.name}"? This removes its notes, citations, and links -- but not the underlying conversations, documents, or entities. This can't be undone.`}
        onConfirm={confirmDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </li>
  );
}
