import { ensureSchema } from "@/lib/db/schema";
import { sql } from "@/lib/db/client";
import type { PlanTier } from "./plans";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SubscriptionRecord {
  userId: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripePriceId: string | null;
  plan: string;
  status: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
}

export interface UsageRecord {
  userId: string;
  messagesThisCycle: number;
  uploadsThisCycle: number;
  billingCycleStart: string;
  billingCycleEnd: string | null;
  lastMessageAt: string | null;
  lastUploadAt: string | null;
}

export interface UploadWindowResult {
  count: number;
  oldestUploadAt: string | null;
  nextAvailableAt: string | null;
}

// ---------------------------------------------------------------------------
// Subscription operations
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSub(row: any): SubscriptionRecord {
  return {
    userId: row.user_id,
    stripeCustomerId: row.stripe_customer_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    stripePriceId: row.stripe_price_id,
    plan: row.plan,
    status: row.status,
    currentPeriodStart: row.current_period_start?.toISOString() ?? null,
    currentPeriodEnd: row.current_period_end?.toISOString() ?? null,
    cancelAtPeriodEnd: row.cancel_at_period_end,
    canceledAt: row.canceled_at?.toISOString() ?? null,
  };
}

export async function getSubscription(userId: string): Promise<SubscriptionRecord | null> {
  await ensureSchema();
  const rows = await sql`
    SELECT * FROM subscriptions WHERE user_id = ${userId}
  `;
  return rows[0] ? mapSub(rows[0]) : null;
}

export async function getSubscriptionByCustomerId(
  customerId: string,
): Promise<SubscriptionRecord | null> {
  await ensureSchema();
  const rows = await sql`
    SELECT * FROM subscriptions WHERE stripe_customer_id = ${customerId}
  `;
  return rows[0] ? mapSub(rows[0]) : null;
}

export async function getSubscriptionBySubscriptionId(
  subscriptionId: string,
): Promise<SubscriptionRecord | null> {
  await ensureSchema();
  const rows = await sql`
    SELECT * FROM subscriptions WHERE stripe_subscription_id = ${subscriptionId}
  `;
  return rows[0] ? mapSub(rows[0]) : null;
}

export async function upsertSubscription(
  userId: string,
  fields: {
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    stripePriceId?: string;
    plan: PlanTier;
    status: string;
    currentPeriodStart?: string | null;
    currentPeriodEnd?: string | null;
    cancelAtPeriodEnd?: boolean;
    canceledAt?: string | null;
  },
): Promise<SubscriptionRecord> {
  await ensureSchema();
  const rows = await sql`
    INSERT INTO subscriptions (
      user_id, stripe_customer_id, stripe_subscription_id, stripe_price_id,
      plan, status, current_period_start, current_period_end,
      cancel_at_period_end, canceled_at
    ) VALUES (
      ${userId},
      ${fields.stripeCustomerId ?? null},
      ${fields.stripeSubscriptionId ?? null},
      ${fields.stripePriceId ?? null},
      ${fields.plan},
      ${fields.status},
      ${fields.currentPeriodStart ?? null},
      ${fields.currentPeriodEnd ?? null},
      ${fields.cancelAtPeriodEnd ?? false},
      ${fields.canceledAt ?? null}
    )
    ON CONFLICT (user_id) DO UPDATE SET
      stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, subscriptions.stripe_customer_id),
      stripe_subscription_id = COALESCE(EXCLUDED.stripe_subscription_id, subscriptions.stripe_subscription_id),
      stripe_price_id = COALESCE(EXCLUDED.stripe_price_id, subscriptions.stripe_price_id),
      plan = EXCLUDED.plan,
      status = EXCLUDED.status,
      current_period_start = COALESCE(EXCLUDED.current_period_start, subscriptions.current_period_start),
      current_period_end = COALESCE(EXCLUDED.current_period_end, subscriptions.current_period_end),
      cancel_at_period_end = EXCLUDED.cancel_at_period_end,
      canceled_at = EXCLUDED.canceled_at,
      updated_at = now()
    RETURNING *
  `;
  return mapSub(rows[0]);
}

export async function updateUserPlan(userId: string, plan: PlanTier): Promise<void> {
  await ensureSchema();
  await sql`UPDATE users SET plan = ${plan} WHERE id = ${userId}`;
}

// ---------------------------------------------------------------------------
// Usage tracking operations
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapUsage(row: any): UsageRecord {
  return {
    userId: row.user_id,
    messagesThisCycle: row.messages_this_cycle,
    uploadsThisCycle: row.uploads_this_cycle,
    billingCycleStart: row.billing_cycle_start?.toISOString() ?? new Date().toISOString(),
    billingCycleEnd: row.billing_cycle_end?.toISOString() ?? null,
    lastMessageAt: row.last_message_at?.toISOString() ?? null,
    lastUploadAt: row.last_upload_at?.toISOString() ?? null,
  };
}

export async function getUsage(userId: string): Promise<UsageRecord> {
  await ensureSchema();
  const rows = await sql`
    SELECT * FROM usage_tracking WHERE user_id = ${userId}
  `;
  if (!rows[0]) {
    await sql`
      INSERT INTO usage_tracking (user_id)
      VALUES (${userId})
      ON CONFLICT DO NOTHING
    `;
    const fresh = await sql`SELECT * FROM usage_tracking WHERE user_id = ${userId}`;
    return mapUsage(fresh[0]);
  }
  return mapUsage(rows[0]);
}

export async function incrementMessageCount(userId: string): Promise<UsageRecord> {
  await ensureSchema();
  await sql`
    INSERT INTO usage_tracking (user_id)
    VALUES (${userId})
    ON CONFLICT DO NOTHING
  `;
  const rows = await sql`
    UPDATE usage_tracking
    SET messages_this_cycle = messages_this_cycle + 1,
        last_message_at = now(),
        updated_at = now()
    WHERE user_id = ${userId}
    RETURNING *
  `;
  return mapUsage(rows[0]);
}

export async function incrementUploadCount(userId: string): Promise<UsageRecord> {
  await ensureSchema();
  await sql`
    INSERT INTO usage_tracking (user_id)
    VALUES (${userId})
    ON CONFLICT DO NOTHING
  `;
  const rows = await sql`
    UPDATE usage_tracking
    SET uploads_this_cycle = uploads_this_cycle + 1,
        last_upload_at = now(),
        updated_at = now()
    WHERE user_id = ${userId}
    RETURNING *
  `;
  return mapUsage(rows[0]);
}

export async function resetUsageForNewCycle(
  userId: string,
  cycleStart: string,
  cycleEnd: string,
): Promise<void> {
  await ensureSchema();
  await sql`
    UPDATE usage_tracking
    SET messages_this_cycle = 0,
        uploads_this_cycle = 0,
        billing_cycle_start = ${cycleStart},
        billing_cycle_end = ${cycleEnd},
        updated_at = now()
    WHERE user_id = ${userId}
  `;
}

// ---------------------------------------------------------------------------
// Upload events (rolling 24h window for free plan)
// ---------------------------------------------------------------------------

export async function recordUploadEvent(
  userId: string,
  documentId: string | null,
  filename: string,
  sizeBytes: number,
): Promise<void> {
  await ensureSchema();
  await sql`
    INSERT INTO upload_events (user_id, document_id, filename, size_bytes)
    VALUES (${userId}, ${documentId}, ${filename}, ${sizeBytes})
  `;
}

export async function getRolling24hUploadCount(userId: string): Promise<UploadWindowResult> {
  await ensureSchema();
  const rows = await sql`
    SELECT uploaded_at FROM upload_events
    WHERE user_id = ${userId}
      AND uploaded_at > now() - interval '24 hours'
    ORDER BY uploaded_at ASC
  `;
  const count = rows.length;
  if (count === 0) {
    return { count: 0, oldestUploadAt: null, nextAvailableAt: null };
  }
  const oldest = rows[0].uploaded_at;
  const oldestDate = new Date(oldest);
  const nextAvailable = new Date(oldestDate.getTime() + 24 * 60 * 60 * 1000);
  return {
    count,
    oldestUploadAt: oldestDate.toISOString(),
    nextAvailableAt: nextAvailable.toISOString(),
  };
}

export async function getMonthlyUploadCount(
  userId: string,
  cycleStart: string,
): Promise<number> {
  await ensureSchema();
  const rows = await sql`
    SELECT COUNT(*) as cnt FROM upload_events
    WHERE user_id = ${userId}
      AND uploaded_at >= ${cycleStart}
  `;
  return Number(rows[0]?.cnt ?? 0);
}

// ---------------------------------------------------------------------------
// Conversation count (for limit enforcement)
// ---------------------------------------------------------------------------

export async function getConversationCount(userId: string): Promise<number> {
  await ensureSchema();
  const rows = await sql`
    SELECT COUNT(*) as cnt FROM conversations WHERE user_id = ${userId}
  `;
  return Number(rows[0]?.cnt ?? 0);
}