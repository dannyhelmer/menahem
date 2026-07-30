import { randomUUID } from "node:crypto";
import { ensureSchema } from "@/lib/db/schema";
import { sql } from "@/lib/db/client";
import type { Citation, ResearchNote, ResearchProject } from "./types";

interface ProjectRow {
  id: string;
  name: string;
  description: string;
  entity_ids: string[];
  conversation_ids: string[];
  notes: ResearchNote[];
  citations: Citation[];
  created_at: string;
  updated_at: string;
}

function toProject(row: ProjectRow): ResearchProject {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    entityIds: row.entity_ids,
    conversationIds: row.conversation_ids,
    notes: row.notes,
    citations: row.citations,
  };
}

export async function listProjects(userId: string): Promise<ResearchProject[]> {
  await ensureSchema();
  const rows = (await sql`
    SELECT * FROM notebook_projects WHERE user_id = ${userId} ORDER BY updated_at DESC
  `) as ProjectRow[];
  return rows.map(toProject);
}

export async function getProject(id: string, userId: string): Promise<ResearchProject | null> {
  await ensureSchema();
  const rows = (await sql`
    SELECT * FROM notebook_projects WHERE id = ${id} AND user_id = ${userId}
  `) as ProjectRow[];
  return rows[0] ? toProject(rows[0]) : null;
}

export async function createProject(userId: string, name: string, description: string): Promise<ResearchProject> {
  await ensureSchema();
  const rows = (await sql`
    INSERT INTO notebook_projects (id, user_id, name, description)
    VALUES (${randomUUID()}, ${userId}, ${name}, ${description})
    RETURNING *
  `) as ProjectRow[];
  return toProject(rows[0]);
}

// Applies `mutate` to the one matching project and persists the whole row --
// every write goes through here so `updated_at` always reflects the last
// real change, not just the last touch.
async function updateProject(
  id: string,
  userId: string,
  mutate: (project: ResearchProject) => void,
): Promise<ResearchProject | null> {
  const project = await getProject(id, userId);
  if (!project) return null;
  mutate(project);
  const rows = (await sql`
    UPDATE notebook_projects SET
      name = ${project.name},
      description = ${project.description},
      entity_ids = ${JSON.stringify(project.entityIds)},
      conversation_ids = ${JSON.stringify(project.conversationIds)},
      notes = ${JSON.stringify(project.notes)},
      citations = ${JSON.stringify(project.citations)},
      updated_at = now()
    WHERE id = ${id} AND user_id = ${userId}
    RETURNING *
  `) as ProjectRow[];
  return rows[0] ? toProject(rows[0]) : null;
}

export async function renameProject(
  id: string,
  userId: string,
  fields: { name?: string; description?: string },
): Promise<ResearchProject | null> {
  return updateProject(id, userId, (project) => {
    if (fields.name !== undefined) project.name = fields.name;
    if (fields.description !== undefined) project.description = fields.description;
  });
}

export async function deleteProject(id: string, userId: string): Promise<void> {
  await ensureSchema();
  await sql`DELETE FROM notebook_projects WHERE id = ${id} AND user_id = ${userId}`;
}

export async function addNote(id: string, userId: string, text: string): Promise<ResearchNote | null> {
  const note: ResearchNote = { id: randomUUID(), text, createdAt: new Date().toISOString() };
  const project = await updateProject(id, userId, (p) => p.notes.push(note));
  return project ? note : null;
}

export async function deleteNote(id: string, userId: string, noteId: string): Promise<void> {
  await updateProject(id, userId, (p) => {
    p.notes = p.notes.filter((n) => n.id !== noteId);
  });
}

export async function addCitation(id: string, userId: string, title: string, url: string): Promise<Citation | null> {
  const citation: Citation = { id: randomUUID(), title, url, addedAt: new Date().toISOString() };
  const project = await updateProject(id, userId, (p) => p.citations.push(citation));
  return project ? citation : null;
}

export async function deleteCitation(id: string, userId: string, citationId: string): Promise<void> {
  await updateProject(id, userId, (p) => {
    p.citations = p.citations.filter((c) => c.id !== citationId);
  });
}

export async function addEntityToProject(id: string, userId: string, entityId: string): Promise<void> {
  await updateProject(id, userId, (p) => {
    if (!p.entityIds.includes(entityId)) p.entityIds.push(entityId);
  });
}

export async function removeEntityFromProject(id: string, userId: string, entityId: string): Promise<void> {
  await updateProject(id, userId, (p) => {
    p.entityIds = p.entityIds.filter((e) => e !== entityId);
  });
}

export async function addConversationToProject(id: string, userId: string, sessionId: string): Promise<void> {
  await updateProject(id, userId, (p) => {
    if (!p.conversationIds.includes(sessionId)) p.conversationIds.push(sessionId);
  });
}

export async function removeConversationFromProject(id: string, userId: string, sessionId: string): Promise<void> {
  await updateProject(id, userId, (p) => {
    p.conversationIds = p.conversationIds.filter((c) => c !== sessionId);
  });
}
