import path from "node:path";
import { DATA_DIR, readJsonFile, writeJsonFileAtomic } from "@/lib/storage/json-file";
import { API_KEY_PROVIDERS, type ApiKeyProviderDef } from "./api-key-providers";

const API_KEYS_PATH = path.join(DATA_DIR, "api-keys.json");

interface StoredApiKey {
  value: string;
  updatedAt: string;
}

type ApiKeysRecord = Record<string, StoredApiKey>;

async function loadKeys(): Promise<ApiKeysRecord> {
  return readJsonFile<ApiKeysRecord>(API_KEYS_PATH, {});
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
  await writeJsonFileAtomic(API_KEYS_PATH, keys);
}

export async function clearApiKey(providerId: string): Promise<void> {
  const keys = await loadKeys();
  delete keys[providerId];
  await writeJsonFileAtomic(API_KEYS_PATH, keys);
}
