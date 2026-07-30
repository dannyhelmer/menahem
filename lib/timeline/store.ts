import path from "node:path";
import { DATA_DIR, readJsonFile, writeJsonFileAtomic } from "@/lib/storage/json-file";
import type { Timeline, TimelineEvent } from "./types";

const TIMELINES_PATH = path.join(DATA_DIR, "timelines.json");

async function loadTimelines(): Promise<Timeline[]> {
  return readJsonFile<Timeline[]>(TIMELINES_PATH, []);
}

// Replaces the full event list for this entity -- a bill's action history
// is refetched whole each time, not incrementally merged, so it's always a
// faithful snapshot of what the source currently reports.
export async function upsertTimeline(entityId: string, events: TimelineEvent[]): Promise<void> {
  const timelines = await loadTimelines();
  const next = timelines.filter((t) => t.entityId !== entityId);
  next.push({ entityId, events, updatedAt: new Date().toISOString() });
  await writeJsonFileAtomic(TIMELINES_PATH, next);
}

export async function getTimeline(entityId: string): Promise<Timeline | null> {
  const timelines = await loadTimelines();
  return timelines.find((t) => t.entityId === entityId) ?? null;
}
