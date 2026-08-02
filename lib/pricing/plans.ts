// Pricing configuration for Menahem subscription plans.
// All plan data lives here so the pricing page, billing logic, and future
// Stripe Checkout integration all read from a single source of truth.
//
// When Stripe is wired up, each plan's `stripePriceId` (monthly/yearly) will
// be passed to the Checkout Session -- until then the buttons link to signup.

export type BillingInterval = "monthly" | "yearly";

export interface PlanFeature {
  /** The feature text shown with a checkmark. */
  text: string;
  /** When true, the feature is displayed as a limitation (muted, with ✕). */
  excluded?: boolean;
}

export interface PricingPlan {
  /** Unique identifier for the plan (e.g. "free", "pro"). */
  id: string;
  /** Display name (e.g. "Free", "Pro"). */
  name: string;
  /** Short description shown below the plan name. */
  description: string;
  /** Monthly price in USD. Yearly is derived as monthly * 10 (2 months free). */
  monthlyPrice: number;
  /** Optional badge text (e.g. "Most Popular"). */
  badge?: string;
  /** Whether this plan is the highlighted/popular one. */
  highlighted?: boolean;
  /** Button label (e.g. "Get Started", "Upgrade to Pro"). */
  ctaLabel: string;
  /** Where the CTA button links to. */
  ctaHref: string;
  /** Features included in the plan. */
  features: PlanFeature[];
  /** Limitations (shown as excluded features in muted color). */
  limitations: PlanFeature[];
  /** Future Stripe price IDs for Checkout integration. */
  stripePriceId?: {
    monthly?: string;
    yearly?: string;
  };
}

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: "free",
    name: "Free",
    description: "Perfect for exploring legislation, public policy, and government research.",
    monthlyPrice: 0,
    ctaLabel: "Get Started",
    ctaHref: "/signup",
    features: [
      { text: "250 AI messages per month" },
      { text: "Search official government sources" },
      { text: "Upload up to 3 documents per day" },
      { text: "AI document summaries" },
      { text: "Deep Research mode for in-depth reports" },
      { text: "Save up to 10 conversations" },
    ],
    limitations: [
      { text: "Political Workspace (save bills, notes, and research)", excluded: true },
      { text: "Compare bills, reports, and PDFs", excluded: true },
      { text: "Unlimited saved conversations", excluded: true },
    ],
  },
  {
    id: "pro",
    name: "Pro",
    description:
      "Built for ongoing government and public policy research. Save projects, compare documents, and work without Free plan limits.",
    monthlyPrice: 20,
    badge: "Most Popular",
    highlighted: true,
    ctaLabel: "Upgrade to Pro",
    ctaHref: "/signup",
    features: [
      { text: "Everything included in Free" },
      { text: "2,500 AI messages per month" },
      { text: "Political Workspace (save bills, notes, and research)" },
      { text: "Compare bills, reports, and PDFs" },
      { text: "Unlimited saved conversations" },
      { text: "Unlimited document uploads" },
    ],
    limitations: [],
    stripePriceId: {
      // Set these when Stripe Checkout is wired up:
      // monthly: "price_...",
      // yearly: "price_...",
    },
  },
];

export const PRICING_FAQS: { question: string; answer: string }[] = [
  {
    question: "Can I cancel my subscription anytime?",
    answer:
      "Yes. You can cancel your Pro subscription at any time from your account settings. After cancellation, you'll retain access to Pro features until the end of your current billing period, then automatically revert to the Free plan.",
  },
  {
    question: "What happens if I exceed my monthly message limit?",
    answer:
      "If you reach your monthly AI message limit, you can continue using Menahem with reduced functionality or upgrade to a higher plan for more messages. Your usage resets on the first day of each billing cycle.",
  },
  {
    question: "Is there a discount for annual billing?",
    answer:
      "Yes. When you choose yearly billing, you get two months free compared to paying monthly — effectively paying for 10 months out of 12.",
  },
  {
    question: "What payment methods do you accept?",
    answer:
      "We accept all major credit cards (Visa, Mastercard, American Express), Apple Pay, and Google Pay through our secure payment processor.",
  },
  {
    question: "Is my data secure?",
    answer:
      "Yes. All payment information is processed through a PCI-compliant payment processor. We never store your full credit card details on our servers. Your research data and conversations are encrypted and private to your account.",
  },
  {
    question: "Can I change plans later?",
    answer:
      "Absolutely. You can upgrade or downgrade your plan at any time. Upgrades take effect immediately, and downgrades take effect at the start of your next billing cycle.",
  },
];

/** Returns the display price for a plan given the billing interval. */
export function getDisplayPrice(monthlyPrice: number, interval: BillingInterval): number {
  if (interval === "yearly") {
    // 2 months free: pay for 10 months, spread across 12.
    return Math.round((monthlyPrice * 10) / 12);
  }
  return monthlyPrice;
}

/** Returns the billing suffix for the price display (e.g. "/mo", "/mo, billed yearly"). */
export function getBillingSuffix(interval: BillingInterval): string {
  return interval === "yearly" ? "/mo, billed yearly" : "/mo";
}