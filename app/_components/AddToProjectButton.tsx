"use client";

import { useState } from "react";
import type { ResearchProject } from "@/lib/notebook/types";

export default function AddToProjectButton({ entityId }: { entityId: string }) {
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<ResearchProject[] | null>(null);
  const [picked, setPicked] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");

  async function handleOpen() {
    setOpen(true);
    if (projects) return;
    const response = await fetch("/api/notebook/projects");
    const data = (await response.json()) as { projects: ResearchProject[] };
    setProjects(data.projects);
  }

  async function handleAdd() {
    if (!picked) return;
    setStatus("saving");
    await fetch(`/api/notebook/projects/${picked}/entities`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entityId }),
    });
    setStatus("saved");
  }

  if (!open) {
    return (
      <button
        onClick={handleOpen}
        className="hover:border-burgundy/40 hover:text-burgundy rounded-xl border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 transition-colors dark:border-neutral-800 dark:text-neutral-300"
      >
        Add to project
      </button>
    );
  }

  if (status === "saved") {
    return <p className="text-xs text-neutral-500 dark:text-neutral-400">Added to project.</p>;
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={picked}
        onChange={(event) => setPicked(event.target.value)}
        className="focus:border-burgundy/40 rounded-xl border border-neutral-200 bg-white px-3 py-1.5 text-xs text-neutral-700 focus:outline-none dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200"
      >
        <option value="">
          {projects === null ? "Loading..." : projects.length === 0 ? "No projects yet" : "Choose a project..."}
        </option>
        {projects?.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name}
          </option>
        ))}
      </select>
      <button
        onClick={handleAdd}
        disabled={!picked || status === "saving"}
        className="bg-burgundy hover:bg-burgundy-dark rounded-xl px-3 py-1.5 text-xs font-medium text-white transition-colors duration-150 disabled:pointer-events-none disabled:opacity-40"
      >
        Add
      </button>
    </div>
  );
}
