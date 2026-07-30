import { randomUUID } from "node:crypto";
import path from "node:path";
import { DATA_DIR, readJsonFile, writeJsonFileAtomic } from "@/lib/storage/json-file";
import type { Citation, ResearchNote, ResearchProject } from "./types";

const PROJECTS_PATH = path.join(DATA_DIR, "notebook", "projects.json");

async function loadProjects(): Promise<ResearchProject[]> {
  return readJsonFile<ResearchProject[]>(PROJECTS_PATH, []);
}

async function saveProjects(projects: ResearchProject[]): Promise<void> {
  await writeJsonFileAtomic(PROJECTS_PATH, projects);
}

export async function listProjects(): Promise<ResearchProject[]> {
  const projects = await loadProjects();
  return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getProject(id: string): Promise<ResearchProject | null> {
  const projects = await loadProjects();
  return projects.find((p) => p.id === id) ?? null;
}

export async function createProject(name: string, description: string): Promise<ResearchProject> {
  const projects = await loadProjects();
  const now = new Date().toISOString();
  const project: ResearchProject = {
    id: randomUUID(),
    name,
    description,
    createdAt: now,
    updatedAt: now,
    entityIds: [],
    conversationIds: [],
    notes: [],
    citations: [],
  };
  projects.push(project);
  await saveProjects(projects);
  return project;
}

// Applies `mutate` to the one matching project and persists the whole list --
// every write goes through here so `updatedAt` always reflects the last real
// change, not just the last touch.
async function updateProject(
  id: string,
  mutate: (project: ResearchProject) => void,
): Promise<ResearchProject | null> {
  const projects = await loadProjects();
  const project = projects.find((p) => p.id === id);
  if (!project) return null;
  mutate(project);
  project.updatedAt = new Date().toISOString();
  await saveProjects(projects);
  return project;
}

export async function renameProject(
  id: string,
  fields: { name?: string; description?: string },
): Promise<ResearchProject | null> {
  return updateProject(id, (project) => {
    if (fields.name !== undefined) project.name = fields.name;
    if (fields.description !== undefined) project.description = fields.description;
  });
}

export async function deleteProject(id: string): Promise<void> {
  const projects = await loadProjects();
  await saveProjects(projects.filter((p) => p.id !== id));
}

export async function addNote(id: string, text: string): Promise<ResearchNote | null> {
  const note: ResearchNote = { id: randomUUID(), text, createdAt: new Date().toISOString() };
  const project = await updateProject(id, (p) => p.notes.push(note));
  return project ? note : null;
}

export async function deleteNote(id: string, noteId: string): Promise<void> {
  await updateProject(id, (p) => {
    p.notes = p.notes.filter((n) => n.id !== noteId);
  });
}

export async function addCitation(id: string, title: string, url: string): Promise<Citation | null> {
  const citation: Citation = { id: randomUUID(), title, url, addedAt: new Date().toISOString() };
  const project = await updateProject(id, (p) => p.citations.push(citation));
  return project ? citation : null;
}

export async function deleteCitation(id: string, citationId: string): Promise<void> {
  await updateProject(id, (p) => {
    p.citations = p.citations.filter((c) => c.id !== citationId);
  });
}

export async function addEntityToProject(id: string, entityId: string): Promise<void> {
  await updateProject(id, (p) => {
    if (!p.entityIds.includes(entityId)) p.entityIds.push(entityId);
  });
}

export async function removeEntityFromProject(id: string, entityId: string): Promise<void> {
  await updateProject(id, (p) => {
    p.entityIds = p.entityIds.filter((e) => e !== entityId);
  });
}

export async function addConversationToProject(id: string, sessionId: string): Promise<void> {
  await updateProject(id, (p) => {
    if (!p.conversationIds.includes(sessionId)) p.conversationIds.push(sessionId);
  });
}

export async function removeConversationFromProject(id: string, sessionId: string): Promise<void> {
  await updateProject(id, (p) => {
    p.conversationIds = p.conversationIds.filter((c) => c !== sessionId);
  });
}
