import type { Metadata } from "next";
import Link from "next/link";
import { requireApprovedPageUser } from "@/lib/auth/session";
import { listProjects } from "@/lib/notebook/store";
import CreateProjectForm from "@/app/_components/CreateProjectForm";
import ProjectListItem from "@/app/_components/ProjectListItem";

export const metadata: Metadata = {
  title: "Political Workspace",
};

export default async function WorkspacePage() {
  await requireApprovedPageUser();
  const projects = await listProjects();

  return (
    <main className="flex-1 overflow-y-auto px-6 py-10">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/"
          className="hover:text-burgundy mb-8 inline-block text-sm text-neutral-500 dark:text-neutral-400"
        >
          ← Back to chat
        </Link>

        <div className="mb-2 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
              Political Workspace
            </h1>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              A persistent notebook for ongoing government research -- projects that hold notes, citations,
              saved entities, and linked conversations over time.
            </p>
          </div>
        </div>

        <div className="mb-8">
          <CreateProjectForm />
        </div>

        {projects.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-neutral-200 px-6 py-8 text-center text-sm text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
            No research projects yet. Create one above to start collecting notes, citations, and entities for an
            ongoing investigation.
          </p>
        ) : (
          <ul className="mb-10 space-y-2">
            {projects.map((project) => (
              <ProjectListItem key={project.id} project={project} />
            ))}
          </ul>
        )}

        <Link
          href="/workspace/entities"
          className="hover:border-burgundy/40 hover:shadow-sm group flex items-center justify-between rounded-2xl border border-neutral-200 bg-white px-6 py-5 transition-all duration-150 dark:border-neutral-800 dark:bg-neutral-900"
        >
          <div>
            <h3 className="group-hover:text-burgundy text-base font-semibold text-neutral-900 dark:text-neutral-100">
              Browse All Entities
            </h3>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Every bill, representative, and candidate Menahem has looked up, grouped by type.
            </p>
          </div>
          <span className="text-neutral-300 transition-transform duration-150 group-hover:translate-x-1 dark:text-neutral-600">
            →
          </span>
        </Link>
      </div>
    </main>
  );
}
