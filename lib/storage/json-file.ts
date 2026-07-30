import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { isProductionDeployment } from "@/lib/env";

// Vercel's deployment filesystem is read-only outside /tmp (writing under
// process.cwd() there throws ENOENT trying to create the directory at
// all) -- /tmp IS writable but ephemeral, not shared across instances, and
// wiped on cold start. This stops the immediate crash so chat/documents/etc.
// actually work, but it's a stopgap: this data won't reliably survive
// between requests in production until it moves to Postgres, the same way
// auth/AI provider keys already did.
export const DATA_DIR = isProductionDeployment()
  ? path.join(os.tmpdir(), "menahem-data")
  : path.join(process.cwd(), "data");

export async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

export async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch (err) {
    if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
      return fallback;
    }
    throw err;
  }
}

// Write to a temp file then rename -- rename is atomic on the same filesystem,
// so a crash mid-write can never leave a half-written index.json or session file.
export async function writeJsonFileAtomic<T>(filePath: string, value: T): Promise<void> {
  await ensureDir(path.dirname(filePath));
  const tmpPath = `${filePath}.tmp`;
  await writeFile(tmpPath, JSON.stringify(value, null, 2), "utf-8");
  await rename(tmpPath, filePath);
}
