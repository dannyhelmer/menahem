import { sql } from "./client";

// Idempotent -- safe to call on every cold start. Memoized per warm
// instance so a busy deployment doesn't re-run these DDL statements on
// every request; CREATE TABLE/INDEX IF NOT EXISTS makes re-running
// harmless anyway if a new instance spins up concurrently.
let ensured: Promise<void> | null = null;

async function runMigrations(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email text UNIQUE NOT NULL,
      password_hash text NOT NULL,
      approved boolean NOT NULL DEFAULT false,
      is_admin boolean NOT NULL DEFAULT false,
      plan text NOT NULL DEFAULT 'beta',
      created_at timestamptz NOT NULL DEFAULT now(),
      last_login_at timestamptz
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS user_api_keys (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider text NOT NULL,
      encrypted_key text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (user_id, provider)
    )
  `;

  // Added after the users table already existed in production -- ALTER
  // ... ADD COLUMN IF NOT EXISTS instead of folding into the CREATE TABLE
  // above, since that statement only ever runs against a brand-new table.
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name text`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_name text`;
}

export function ensureSchema(): Promise<void> {
  if (!ensured) ensured = runMigrations();
  return ensured;
}
