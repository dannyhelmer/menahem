"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { X } from "lucide-react";
import ConfirmDialog from "./ConfirmDialog";
import DocumentPanel from "./DocumentPanel";
import DocumentUpload from "./DocumentUpload";
import ProjectChat from "./ProjectChat";
import type { StoredDocument } from "@/lib/documents/types";
import type { GraphEntity } from "@/lib/graph/types";
import { humanize } from "@/lib/graph/humanize";
import type { ConversationSummary } from "@/lib/memory/types";
import type { ResearchProject } from "@/lib/notebook/types";

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 text-sm font-medium tracking-wide text-neutral-400 uppercase dark:text-neutral-500">
      {children}
    </h2>
  );
}

function RemoveButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="rounded p-1 text-neutral-400 hover:text-red-600"
    >
      <X className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  );
}

export default function ProjectWorkspace({
  project,
  entities,
  conversations,
  linkableConversations,
  documents,
}: {
  project: ResearchProject;
  entities: GraphEntity[];
  conversations: ConversationSummary[];
  linkableConversations: ConversationSummary[];
  documents: StoredDocument[];
}) {
  const router = useRouter();
  const [noteDraft, setNoteDraft] = useState("");
  const [citationTitle, setCitationTitle] = useState("");
  const [citationUrl, setCitationUrl] = useState("");
  const [pickedConversation, setPickedConversation] = useState("");
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const base = `/api/notebook/projects/${project.id}`;

  async function refresh() {
    router.refresh();
  }

  async function confirmDeleteProject() {
    setConfirmDeleteOpen(false);
    await fetch(base, { method: "DELETE" });
    router.push("/workspace");
  }

  async function addNote() {
    const text = noteDraft.trim();
    if (!text) return;
    setNoteDraft("");
    await fetch(`${base}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    refresh();
  }

  async function deleteNote(noteId: string) {
    await fetch(`${base}/notes/${noteId}`, { method: "DELETE" });
    refresh();
  }

  async function addCitation() {
    const title = citationTitle.trim();
    const url = citationUrl.trim();
    if (!title || !url) return;
    setCitationTitle("");
    setCitationUrl("");
    await fetch(`${base}/citations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, url }),
    });
    refresh();
  }

  async function deleteCitation(citationId: string) {
    await fetch(`${base}/citations/${citationId}`, { method: "DELETE" });
    refresh();
  }

  async function removeEntity(entityId: string) {
    await fetch(`${base}/entities/${encodeURIComponent(entityId)}`, { method: "DELETE" });
    refresh();
  }

  async function linkConversation() {
    if (!pickedConversation) return;
    await fetch(`${base}/conversations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: pickedConversation }),
    });
    setPickedConversation("");
    refresh();
  }

  async function unlinkConversation(sessionId: string) {
    await fetch(`${base}/conversations/${sessionId}`, { method: "DELETE" });
    refresh();
  }

  return (
    <main className="flex-1 overflow-y-auto px-6 py-10">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/workspace"
          className="hover:text-burgundy mb-8 inline-block text-sm text-neutral-500 dark:text-neutral-400"
        >
          ← Back to workspace
        </Link>

        <div className="mb-1 flex items-start justify-between gap-4">
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">{project.name}</h1>
          <button
            onClick={() => setConfirmDeleteOpen(true)}
            className="shrink-0 rounded-lg px-3 py-1.5 text-sm text-neutral-500 hover:bg-red-50 hover:text-red-600 dark:text-neutral-400 dark:hover:bg-red-950/40 dark:hover:text-red-400"
          >
            Delete Project
          </button>
        </div>
        {project.description && (
          <p className="mb-8 text-sm text-neutral-500 dark:text-neutral-400">{project.description}</p>
        )}
        <ConfirmDialog
          open={confirmDeleteOpen}
          title="Delete project?"
          message={`Delete "${project.name}"? This removes its notes, citations, and links -- but not the underlying conversations, documents, or entities. This can't be undone.`}
          onConfirm={confirmDeleteProject}
          onCancel={() => setConfirmDeleteOpen(false)}
        />

        <section className="mb-10">
          <SectionHeading>Notes</SectionHeading>
          <div className="mb-3 flex gap-2">
            <textarea
              value={noteDraft}
              onChange={(event) => setNoteDraft(event.target.value)}
              placeholder="Add a note..."
              rows={2}
              className="focus:border-burgundy/40 w-full resize-none rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 focus:outline-none dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100"
            />
            <button
              onClick={addNote}
              disabled={!noteDraft.trim()}
              className="bg-burgundy hover:bg-burgundy-dark shrink-0 self-start rounded-xl px-4 py-2 text-sm font-medium text-white transition-colors duration-150 disabled:pointer-events-none disabled:opacity-40"
            >
              Add
            </button>
          </div>
          {project.notes.length === 0 ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">No notes yet.</p>
          ) : (
            <ul className="space-y-2">
              {project.notes.map((note) => (
                <li
                  key={note.id}
                  className="flex items-start justify-between gap-3 rounded-xl border border-neutral-200 px-4 py-3 text-sm text-neutral-700 dark:border-neutral-800 dark:text-neutral-200"
                >
                  <span className="whitespace-pre-wrap">{note.text}</span>
                  <RemoveButton onClick={() => deleteNote(note.id)} label="Delete note" />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mb-10">
          <SectionHeading>Citations</SectionHeading>
          <div className="mb-3 flex flex-col gap-2 sm:flex-row">
            <input
              value={citationTitle}
              onChange={(event) => setCitationTitle(event.target.value)}
              placeholder="Title"
              className="focus:border-burgundy/40 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 focus:outline-none dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100"
            />
            <input
              value={citationUrl}
              onChange={(event) => setCitationUrl(event.target.value)}
              placeholder="URL"
              className="focus:border-burgundy/40 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 focus:outline-none dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100"
            />
            <button
              onClick={addCitation}
              disabled={!citationTitle.trim() || !citationUrl.trim()}
              className="bg-burgundy hover:bg-burgundy-dark shrink-0 rounded-xl px-4 py-2 text-sm font-medium text-white transition-colors duration-150 disabled:pointer-events-none disabled:opacity-40"
            >
              Add
            </button>
          </div>
          {project.citations.length === 0 ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">No citations yet.</p>
          ) : (
            <ul className="space-y-2">
              {project.citations.map((citation) => (
                <li
                  key={citation.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 px-4 py-3 text-sm dark:border-neutral-800"
                >
                  <a
                    href={citation.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-burgundy min-w-0 flex-1 truncate text-neutral-700 dark:text-neutral-200"
                  >
                    {citation.title}
                  </a>
                  <RemoveButton onClick={() => deleteCitation(citation.id)} label="Delete citation" />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mb-10">
          <SectionHeading>Documents</SectionHeading>
          <div className="mb-3">
            <DocumentUpload projectId={project.id} />
          </div>
          {documents.length === 0 ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              No documents uploaded yet. Upload a PDF, DOCX, TXT, or Markdown file to get an AI summary and ask
              questions about it.
            </p>
          ) : (
            <div className="space-y-3">
              {documents.map((document) => (
                <DocumentPanel key={document.id} document={document} />
              ))}
            </div>
          )}
        </section>

        <section className="mb-10">
          <SectionHeading>Chat with this Workspace</SectionHeading>
          <p className="mb-3 text-sm text-neutral-500 dark:text-neutral-400">
            Ask a question and Menahem automatically searches every document saved in this workspace -- no need
            to attach or re-upload anything individually.
          </p>
          <ProjectChat projectId={project.id} />
        </section>

        <section className="mb-10">
          <SectionHeading>Saved Entities</SectionHeading>
          {entities.length === 0 ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              No entities saved yet -- use "Add to project" from a bill, representative, or candidate page.
            </p>
          ) : (
            <ul className="space-y-2">
              {entities.map((entity) => (
                <li
                  key={entity.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 px-4 py-3 text-sm dark:border-neutral-800"
                >
                  <Link
                    href={`/workspace/${encodeURIComponent(entity.id)}`}
                    className="hover:text-burgundy min-w-0 flex-1 truncate text-neutral-700 dark:text-neutral-200"
                  >
                    {entity.label}
                    <span className="ml-2 text-xs text-neutral-400 dark:text-neutral-500">
                      ({humanize(entity.type)})
                    </span>
                  </Link>
                  <RemoveButton onClick={() => removeEntity(entity.id)} label="Remove entity" />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <SectionHeading>Linked Conversations</SectionHeading>
          {linkableConversations.length > 0 && (
            <div className="mb-3 flex gap-2">
              <select
                value={pickedConversation}
                onChange={(event) => setPickedConversation(event.target.value)}
                className="focus:border-burgundy/40 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 focus:outline-none dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100"
              >
                <option value="">Link an existing conversation...</option>
                {linkableConversations.map((conversation) => (
                  <option key={conversation.sessionId} value={conversation.sessionId}>
                    {conversation.title}
                  </option>
                ))}
              </select>
              <button
                onClick={linkConversation}
                disabled={!pickedConversation}
                className="bg-burgundy hover:bg-burgundy-dark shrink-0 rounded-xl px-4 py-2 text-sm font-medium text-white transition-colors duration-150 disabled:pointer-events-none disabled:opacity-40"
              >
                Link
              </button>
            </div>
          )}
          {conversations.length === 0 ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">No conversations linked yet.</p>
          ) : (
            <ul className="space-y-2">
              {conversations.map((conversation) => (
                <li
                  key={conversation.sessionId}
                  className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 px-4 py-3 text-sm dark:border-neutral-800"
                >
                  <Link
                    href={`/c/${conversation.sessionId}`}
                    className="hover:text-burgundy min-w-0 flex-1 truncate text-neutral-700 dark:text-neutral-200"
                  >
                    {conversation.title}
                  </Link>
                  <RemoveButton
                    onClick={() => unlinkConversation(conversation.sessionId)}
                    label="Unlink conversation"
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
