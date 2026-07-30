import { ensureSchema } from "@/lib/db/schema";
import { sql } from "@/lib/db/client";
import { API_KEY_PROVIDERS, type ApiKeyProviderDef } from "./api-key-providers";

interface StoredApiKey {
  value: string;
  updatedAt: string;
}

type ApiKeysRecord = Record<string, StoredApiKey>;

// These are app-wide (not per-user) search/gov-data provider keys -- was
// JSON-file-backed under DATA_DIR, which on Vercel is ephemeral os.tmpdir()
// (wiped on cold start, never shared across instances). Stored in the same
// app_settings table lib/settings/store.ts uses, under one fixed key, so a
// saved key actually survives a refresh instead of silently vanishing.
const SETTINGS_KEY = "api-keys";

async function loadKeys(): Promise<ApiKeysRecord> {
  await ensureSchema();
  const rows = (await sql`SELECT value FROM app_settings WHERE key = ${SETTINGS_KEY}`) as { value: ApiKeysRecord }[];
  return rows[0]?.value ?? {};
}

async function saveKeys(keys: ApiKeysRecord): Promise<void> {
  await ensureSchema();
  await sql`
    INSERT INTO app_settings (key, value) VALUES (${SETTINGS_KEY}, ${JSON.stringify(keys)})
    ON CONFLICT (key) DO UPDATE SET value = ${JSON.stringify(keys)}, updated_at = now()
  `;
}

function findProvider(providerId: string): ApiKeyProviderDef {
  const provider = API_KEY_PROVIDERS.find((p) => p.id === providerId);
  if (!provider) throw new Error(`Unknown API key provider: ${providerId}`);
  return provider;
}

export async function getApiKey(providerId: string): Promise<string | null> {
  const provider = findProvider(providerId);
  if (provider.envVar) {
    const envValue = process.env[provider.envVar];
    if (envValue && envValue.trim()) return envValue.trim();
  }
  const keys = await loadKeys();
  return keys[providerId]?.value ?? null;
}

export async function isApiKeyConfigured(providerId: string): Promise<boolean> {
  return (await getApiKey(providerId)) !== null;
}

export async function getMaskedApiKey(providerId: string): Promise<string | null> {
  const value = await getApiKey(providerId);
  if (!value) return null;
  const visible = value.slice(-4);
  return `${"•".repeat(Math.max(value.length - 4, 4))}${visible}`;
}

export async function saveApiKey(providerId: string, rawValue: string): Promise<void> {
  findProvider(providerId);
  const keys = await loadKeys();
  keys[providerId] = { value: rawValue.trim(), updatedAt: new Date().toISOString() };
  await saveKeys(keys);
}

export async function clearApiKey(providerId: string): Promise<void> {
  const keys = await loadKeys();
  delete keys[providerId];
  await saveKeys(keys);
}
