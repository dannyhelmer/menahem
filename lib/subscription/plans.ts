// Plan limits and feature flags for Menahem's subscription system.
// All limits are enforced server-side -- the frontend only displays them
// for UX purposes. The backend is the authoritative source of truth.

export type PlanTier = "free" | "pro";

export interface PlanLimits {
  /** Max AI messages per billing cycle. */
  maxMessagesPerMonth: number;
  /** Max document uploads per rolling 24h window (free) or per month (pro). */
  maxUploadsPerWindow: number;
  /** Upload window type: "rolling_24h" for free, "monthly" for pro. */
  uploadWindow: "rolling_24h" | "monthly";
  /** Max file size per upload in bytes. */
  maxFileSizeBytes: number;
  /** Whether multi-document analysis is allowed. */
  multiDocumentAnalysis: boolean;
  /** Whether Deep Research mode is allowed. */
  deepResearch: boolean;
  /** Whether PDF/DOCX export is allowed. */
  exportEnabled: boolean;
  /** Max saved conversations (null = unlimited). */
  maxConversations: number | null;
  /** Whether priority processing queue is used. */
  priorityQueue: boolean;
}

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  free: {
    maxMessagesPerMonth: 100,
    maxUploadsPerWindow: 3,
    uploadWindow: "rolling_24h",
    maxFileSizeBytes: 10 * 1024 * 1024, // 10 MB
    multiDocumentAnalysis: false,
    deepResearch: false,
    exportEnabled: false,
    maxConversations: 10,
    priorityQueue: false,
  },
  pro: {
    maxMessagesPerMonth: 2500,
    maxUploadsPerWindow: 100,
    uploadWindow: "monthly",
    maxFileSizeBytes: 100 * 1024 * 1024, // 100 MB
    multiDocumentAnalysis: true,
    deepResearch: true,
    exportEnabled: true,
    maxConversations: null, // unlimited
    priorityQueue: true,
  },
};

export const FREE_TIER: PlanTier = "free";
export const PRO_TIER: PlanTier = "pro";

/** Returns the limits for a given plan tier. Defaults to free. */
export function getPlanLimits(plan: string): PlanLimits {
  return plan === "pro" ? PLAN_LIMITS.pro : PLAN_LIMITS.free;
}

/** Returns true if the plan tier is Pro. */
export function isProPlan(plan: string): boolean {
  return plan === "pro";
}

/** Returns true if a feature is enabled for the given plan. */
export function hasFeature(plan: string, feature: keyof PlanLimits): boolean {
  const limits = getPlanLimits(plan);
  return Boolean(limits[feature]);
}