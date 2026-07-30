import { ensureSchema } from "@/lib/db/schema";
import { sql } from "@/lib/db/client";

// Was JSON-file-backed under DATA_DIR, which on Vercel resolves to
// os.tmpdir() -- ephemeral (wiped on cold start, not shared across
// concurrent instances). That's what made search-provider settings appear
// to "reset" at random: whichever instance happened to serve the next
// request simply never saw the file the previous instance wrote.
export async function getSetting<T>(key: string, defaultValue: T): Promise<T> {
  await ensureSchema();
  const rows = (await sql`SELECT value FROM app_settings WHERE key = ${key}`) as { value: T }[];
  return rows[0] ? rows[0].value : defaultValue;
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  await ensureSchema();
  await sql`
    INSERT INTO app_settings (key, value) VALUES (${key}, ${JSON.stringify(value)})
    ON CONFLICT (key) DO UPDATE SET value = ${JSON.stringify(value)}, updated_at = now()
  `;
}
