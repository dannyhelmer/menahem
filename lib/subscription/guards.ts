// Feature gating and limit enforcement -- the server-side authority for
// all subscription limits. Every API route that involves a limited action
// calls one of these guards before proceeding. The frontend only displays
// limits for UX; the backend is the real enforcement point.

import type { User } from "@/lib/auth/users";
import { getSubscription, getUsage, getRolling24hUploadCount, getMonthlyUploadCount, getConversationCount } from "./store";
import { getPlanLimits, isProPlan } from "./plans";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LimitType = "messages" | "uploads" | "conversations" | "deep_research" | "export" | "multi_document";

export interface LimitResult {
  allowed: boolean;
  /** Current usage count for this limit. */
  current: number;
  /** Maximum allowed for this limit. */
  max: number;
  /** Human-readable reason if blocked. */
  reason?: string;
  /** When the next slot becomes available (for rolling windows). */
  nextAvailableAt?: string;
  /** The plan tier this user is on. */
  plan: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Resolves the effective plan for a user: checks the subscriptions table
// first, falls back to the users.plan column, defaults to "free".
async function resolvePlan(user: User): Promise<string> {
  const sub = await getSubscription(user.id);
  if (sub && sub.status === "active") return sub.plan;
  // Legacy: users created during beta have plan="beta" -- treat as free.
  return isProPlan(user.plan) ? user.plan : "free";
}

// ---------------------------------------------------------------------------
// Message limit
// ---------------------------------------------------------------------------

export async function checkMessageLimit(user: User): Promise<LimitResult> {
  const plan = await resolvePlan(user);
  const limits = getPlanLimits(plan);
  const usage = await getUsage(user.id);

  const current = usage.messagesThisCycle;
  const max = limits.maxMessagesPerMonth;

  if (current >= max) {
    return {
      allowed: false,
      current,
      max,
      plan,
      reason: `You've used all ${max} AI messages for this billing cycle. Upgrade to Pro for 2,500 messages per month.`,
    };
  }

  return { allowed: true, current, max, plan };
}

// ---------------------------------------------------------------------------
// Upload limit
// ---------------------------------------------------------------------------

export async function checkUploadLimit(user: User): Promise<LimitResult> {
  const plan = await resolvePlan(user);
  const limits = getPlanLimits(plan);

  if (limits.uploadWindow === "rolling_24h") {
    // Free plan: rolling 24h window
    const window = await getRolling24hUploadCount(user.id);
    const current = window.count;
    const max = limits.maxUploadsPerWindow;

    if (current >= max) {
      return {
        allowed: false,
        current,
        max,
        plan,
        nextAvailableAt: window.nextAvailableAt ?? undefined,
        reason: `You've uploaded ${current} documents within the last 24 hours. Your next upload becomes available when the oldest one expires.`,
      };
    }

    return { allowed: true, current, max, plan };
  }

  // Pro plan: monthly window
  const sub = await getSubscription(user.id);
  const cycleStart = sub?.currentPeriodStart ?? new Date(0).toISOString();
  const current = await getMonthlyUploadCount(user.id, cycleStart);
  const max = limits.maxUploadsPerWindow;

  if (current >= max) {
    return {
      allowed: false,
      current,
      max,
      plan,
      reason: `You've uploaded ${current} documents this billing cycle. Your upload count resets at the start of your next cycle.`,
    };
  }

  return { allowed: true, current, max, plan };
}

// ---------------------------------------------------------------------------
// File size limit
// ---------------------------------------------------------------------------

export async function checkFileSize(user: User, fileSizeBytes: number): Promise<LimitResult> {
  const plan = await resolvePlan(user);
  const limits = getPlanLimits(plan);
  const max = limits.maxFileSizeBytes;

  if (fileSizeBytes > max) {
    const maxMB = Math.round(max / (1024 * 1024));
    const fileMB = Math.round(fileSizeBytes / (1024 * 1024));
    return {
      allowed: false,
      current: fileMB,
      max: maxMB,
      plan,
      reason: `That file is ${fileMB} MB, which exceeds the ${maxMB} MB limit for your plan.`,
    };
  }

  return { allowed: true, current: Math.round(fileSizeBytes / (1024 * 1024)), max: Math.round(max / (1024 * 1024)), plan };
}

// ---------------------------------------------------------------------------
// Conversation limit
// ---------------------------------------------------------------------------

export async function checkConversationLimit(user: User): Promise<LimitResult> {
  const plan = await resolvePlan(user);
  const limits = getPlanLimits(plan);

  if (limits.maxConversations === null) {
    return { allowed: true, current: 0, max: Infinity, plan };
  }

  const current = await getConversationCount(user.id);
  const max = limits.maxConversations;

  if (current >= max) {
    return {
      allowed: false,
      current,
      max,
      plan,
      reason: `You've reached the limit of ${max} saved conversations. Delete an old conversation or upgrade to Pro for unlimited conversations.`,
    };
  }

  return { allowed: true, current, max, plan };
}

// ---------------------------------------------------------------------------
// Feature flags (boolean checks)
// ---------------------------------------------------------------------------

export async function checkDeepResearch(user: User): Promise<LimitResult> {
  const plan = await resolvePlan(user);
  const limits = getPlanLimits(plan);

  if (!limits.deepResearch) {
    return {
      allowed: false,
      current: 0,
      max: 0,
      plan,
      reason: "Deep Research mode is a Pro feature. Upgrade to Pro to access advanced multi-step government research.",
    };
  }

  return { allowed: true, current: 1, max: 1, plan };
}

export async function checkExport(user: User): Promise<LimitResult> {
  const plan = await resolvePlan(user);
  const limits = getPlanLimits(plan);

  if (!limits.exportEnabled) {
    return {
      allowed: false,
      current: 0,
      max: 0,
      plan,
      reason: "Exporting research to PDF and DOCX is a Pro feature. Upgrade to Pro to export your research.",
    };
  }

  return { allowed: true, current: 1, max: 1, plan };
}

export async function checkMultiDocument(user: User): Promise<LimitResult> {
  const plan = await resolvePlan(user);
  const limits = getPlanLimits(plan);

  if (!limits.multiDocumentAnalysis) {
    return {
      allowed: false,
      current: 0,
      max: 0,
      plan,
      reason: "Multi-document analysis is a Pro feature. Upgrade to Pro to analyze multiple documents together.",
    };
  }

  return { allowed: true, current: 1, max: 1, plan };
}

// ---------------------------------------------------------------------------
// Convenience: get all limits + usage for the frontend
// ---------------------------------------------------------------------------

export interface UsageSummary {
  plan: string;
  isPro: boolean;
  messages: { used: number; max: number };
  uploads: { used: number; max: number; nextAvailableAt?: string };
  conversations: { used: number; max: number | null };
  features: {
    deepResearch: boolean;
    multiDocument: boolean;
    exportEnabled: boolean;
    priorityQueue: boolean;
  };
  subscription?: {
    status: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
  };
}

export async function getUsageSummary(user: User): Promise<UsageSummary> {
  const plan = await resolvePlan(user);
  const limits = getPlanLimits(plan);
  const usage = await getUsage(user.id);
  const sub = await getSubscription(user.id);

  // Upload count depends on window type
  let uploadUsed = 0;
  let nextAvailableAt: string | undefined;
  if (limits.uploadWindow === "rolling_24h") {
    const window = await getRolling24hUploadCount(user.id);
    uploadUsed = window.count;
    nextAvailableAt = window.nextAvailableAt ?? undefined;
  } else {
    const cycleStart = sub?.currentPeriodStart ?? new Date(0).toISOString();
    uploadUsed = await getMonthlyUploadCount(user.id, cycleStart);
  }

  const convCount = await getConversationCount(user.id);

  return {
    plan,
    isPro: isProPlan(plan),
    messages: { used: usage.messagesThisCycle, max: limits.maxMessagesPerMonth },
    uploads: { used: uploadUsed, max: limits.maxUploadsPerWindow, nextAvailableAt },
    conversations: { used: convCount, max: limits.maxConversations },
    features: {
      deepResearch: limits.deepResearch,
      multiDocument: limits.multiDocumentAnalysis,
      exportEnabled: limits.exportEnabled,
      priorityQueue: limits.priorityQueue,
    },
    subscription: sub
      ? {
          status: sub.status,
          currentPeriodEnd: sub.currentPeriodEnd,
          cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
        }
      : undefined,
  };
}