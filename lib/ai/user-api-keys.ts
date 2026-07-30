import { sql } from "@/lib/db/client";
import { ensureSchema } from "@/lib/db/schema";
import { decrypt, encrypt } from "./encryption";

// Per-user, per-provider encrypted API keys. Deliberately separate from
// lib/settings/api-keys.ts, which is a single-user, unencrypted JSON-file
// store for search/gov-data provider keys (Brave, Congress.gov, etc.) --
// different purpose, different trust model, not touched by this module.
export async function saveUserApiKey(userId: string, provider: string, rawKey: string): Promise<void> {
  await ensureSchema();
  const encrypted = encrypt(rawKey.trim());
  await sql`
    INSERT INTO user_api_keys (user_id, provider, encrypted_key)
    VALUES (${userId}, ${provider}, ${encrypted})
    ON CONFLICT (user_id, provider)
    DO UPDATE SET encrypted_key = ${encrypted}, updated_at = now()
  `;
}

export async function getDecryptedUserApiKey(userId: string, provider: string): Promise<string | null> {
  await ensureSchema();
  const rows = await sql`
    SELECT encrypted_key FROM user_api_keys WHERE user_id = ${userId} AND provider = ${provider}
  `;
  if (!rows[0]) return null;
  return decrypt(rows[0].encrypted_key as string);
}

export async function hasConfiguredApiKey(userId: string, provider: string): Promise<boolean> {
  return (await getDecryptedUserApiKey(userId, provider)) !== null;
}

export async function getMaskedUserApiKey(userId: string, provider: string): Promise<string | null> {
  const value = await getDecryptedUserApiKey(userId, provider);
  if (!value) return null;
  const visible = value.slice(-4);
  return `${"•".repeat(Math.max(value.length - 4, 4))}${visible}`;
}

export async function deleteUserApiKey(userId: string, provider: string): Promise<void> {
  await ensureSchema();
  await sql`DELETE FROM user_api_keys WHERE user_id = ${userId} AND provider = ${provider}`;
}
