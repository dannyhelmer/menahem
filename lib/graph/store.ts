import path from "node:path";
import { DATA_DIR, readJsonFile, writeJsonFileAtomic } from "@/lib/storage/json-file";
import type { EntityType, GraphEdge, GraphEntity, RelationshipType } from "./types";

const ENTITIES_PATH = path.join(DATA_DIR, "graph", "entities.json");
const EDGES_PATH = path.join(DATA_DIR, "graph", "edges.json");

async function loadEntities(): Promise<GraphEntity[]> {
  return readJsonFile<GraphEntity[]>(ENTITIES_PATH, []);
}

async function loadEdges(): Promise<GraphEdge[]> {
  return readJsonFile<GraphEdge[]>(EDGES_PATH, []);
}

export async function upsertEntity(entity: Omit<GraphEntity, "updatedAt">): Promise<GraphEntity> {
  const entities = await loadEntities();
  const full: GraphEntity = { ...entity, updatedAt: new Date().toISOString() };
  const next = entities.filter((e) => e.id !== full.id);
  next.push(full);
  await writeJsonFileAtomic(ENTITIES_PATH, next);
  return full;
}

export async function upsertEdge(edge: GraphEdge): Promise<void> {
  const edges = await loadEdges();
  const exists = edges.some(
    (e) => e.from === edge.from && e.to === edge.to && e.relationship === edge.relationship,
  );
  if (exists) return;
  edges.push(edge);
  await writeJsonFileAtomic(EDGES_PATH, edges);
}

export async function getEntity(id: string): Promise<GraphEntity | null> {
  const entities = await loadEntities();
  return entities.find((e) => e.id === id) ?? null;
}

export async function listEntitiesByType(type: EntityType): Promise<GraphEntity[]> {
  const entities = await loadEntities();
  return entities.filter((e) => e.type === type);
}

export async function listAllEntities(): Promise<GraphEntity[]> {
  return loadEntities();
}

export async function getEdges(
  id: string,
  options?: { direction?: "from" | "to" | "both"; relationship?: RelationshipType },
): Promise<GraphEdge[]> {
  const direction = options?.direction ?? "both";
  const edges = await loadEdges();
  return edges.filter((edge) => {
    if (options?.relationship && edge.relationship !== options.relationship) return false;
    if (direction === "from") return edge.from === id;
    if (direction === "to") return edge.to === id;
    return edge.from === id || edge.to === id;
  });
}

export interface ConnectedEntity {
  entity: GraphEntity;
  edge: GraphEdge;
}

export async function getConnectedEntities(
  id: string,
  options?: { direction?: "from" | "to" | "both"; relationship?: RelationshipType },
): Promise<ConnectedEntity[]> {
  const edges = await getEdges(id, options);
  const results: ConnectedEntity[] = [];
  for (const edge of edges) {
    const otherId = edge.from === id ? edge.to : edge.from;
    const entity = await getEntity(otherId);
    if (entity) results.push({ entity, edge });
  }
  return results;
}
