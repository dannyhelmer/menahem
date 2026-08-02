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

  // Conversations, notebook projects, documents, and app-wide settings used
  // to live in JSON files under DATA_DIR. On Vercel that resolves to
  // os.tmpdir(), which is ephemeral (wiped on cold start) and NOT shared
  // across concurrent serverless instances -- so a conversation saved by one
  // instance would 404 on the next request served by a different instance,
  // and simply vanish after any cold start. Moving all of it into Postgres
  // (the same durable store auth/API keys already use) is the actual fix.
  await sql`
    CREATE TABLE IF NOT EXISTS conversations (
      session_id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date text NOT NULL,
      title text NOT NULL,
      start_time timestamptz NOT NULL,
      end_time timestamptz,
      pinned boolean NOT NULL DEFAULT false,
      category text,
      messages jsonb NOT NULL DEFAULT '[]',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS conversations_user_id_idx ON conversations(user_id)`;

  // Soft delete / trash support for conversations -- deleted_at tracks when
  // a conversation was moved to trash, and deleted_expires_at is 30 days
  // after that (auto-purge deadline). NULL means the conversation is live.
  await sql`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS deleted_at timestamptz`;
  await sql`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS deleted_expires_at timestamptz`;
  await sql`CREATE INDEX IF NOT EXISTS conversations_deleted_at_idx ON conversations(deleted_at)`;

  await sql`
    CREATE TABLE IF NOT EXISTS notebook_projects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name text NOT NULL,
      description text NOT NULL DEFAULT '',
      entity_ids jsonb NOT NULL DEFAULT '[]',
      conversation_ids jsonb NOT NULL DEFAULT '[]',
      notes jsonb NOT NULL DEFAULT '[]',
      citations jsonb NOT NULL DEFAULT '[]',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS notebook_projects_user_id_idx ON notebook_projects(user_id)`;

  await sql`
    CREATE TABLE IF NOT EXISTS documents (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      project_id uuid NOT NULL,
      filename text NOT NULL,
      size_bytes bigint NOT NULL,
      summary text NOT NULL DEFAULT '',
      file_data text NOT NULL,
      text_content text NOT NULL,
      uploaded_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS documents_project_id_idx ON documents(project_id)`;

  await sql`
    CREATE TABLE IF NOT EXISTS app_settings (
      key text PRIMARY KEY,
      value jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  // Subscription tracking -- stores Stripe customer/subscription IDs and
  // billing status so webhooks can upgrade/downgrade users automatically.
  await sql`
    CREATE TABLE IF NOT EXISTS subscriptions (
      user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      stripe_customer_id text UNIQUE,
      stripe_subscription_id text UNIQUE,
      stripe_price_id text,
      plan text NOT NULL DEFAULT 'free',
      status text NOT NULL DEFAULT 'free',
      current_period_start timestamptz,
      current_period_end timestamptz,
      cancel_at_period_end boolean NOT NULL DEFAULT false,
      canceled_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  // Usage tracking -- one row per user per billing cycle. Counters reset
  // when the billing cycle renews (current_period_end changes).
  await sql`
    CREATE TABLE IF NOT EXISTS usage_tracking (
      user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      messages_this_cycle int NOT NULL DEFAULT 0,
      uploads_this_cycle int NOT NULL DEFAULT 0,
      billing_cycle_start timestamptz NOT NULL DEFAULT now(),
      billing_cycle_end timestamptz,
      last_message_at timestamptz,
      last_upload_at timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  // Upload history -- individual upload timestamps for rolling 24h window
  // enforcement (free plan). Each row is one upload event.
  await sql`
    CREATE TABLE IF NOT EXISTS upload_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      document_id uuid,
      filename text NOT NULL,
      size_bytes bigint NOT NULL,
      uploaded_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS upload_events_user_id_idx ON upload_events(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS upload_events_uploaded_at_idx ON upload_events(uploaded_at)`;
}

export function ensureSchema(): Promise<void> {
  if (!ensured) ensured = runMigrations();
  return ensured;
}
