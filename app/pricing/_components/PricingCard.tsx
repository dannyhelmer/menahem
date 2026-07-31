import Link from "next/link";
import { Check, X } from "lucide-react";
import type { PricingPlan, BillingInterval } from "@/lib/pricing/plans";
import { getDisplayPrice, getBillingSuffix } from "@/lib/pricing/plans";

interface PricingCardProps {
  plan: PricingPlan;
  interval: BillingInterval;
  onUpgrade?: () => void;
  loading?: boolean;
}

export default function PricingCard({ plan, interval, onUpgrade, loading }: PricingCardProps) {
  const displayPrice = getDisplayPrice(plan.monthlyPrice, interval);
  const billingSuffix = getBillingSuffix(interval);
  const isFree = plan.monthlyPrice === 0;

  return (
    <div
      className={`relative flex flex-col rounded-[18px] border p-8 transition-all duration-300 hover:shadow-lg ${
        plan.highlighted
          ? "border-burgundy/30 bg-white shadow-md dark:border-burgundy/40 dark:bg-neutral-900"
          : "border-neutral-200 bg-white hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700"
      }`}
    >
      {plan.badge && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-burgundy px-3 py-1 text-xs font-semibold text-white shadow-sm">
          {plan.badge}
        </span>
      )}

      <div className="mb-6">
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">{plan.name}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">
          {plan.description}
        </p>
      </div>

      <div className="mb-6 flex items-baseline gap-1">
        <span className="text-4xl font-bold text-neutral-900 dark:text-neutral-50">
          ${displayPrice}
        </span>
        <span className="text-sm text-neutral-500 dark:text-neutral-400">{billingSuffix}</span>
      </div>

      {onUpgrade ? (
        <button
          onClick={onUpgrade}
          disabled={loading}
          className={`mb-8 block w-full rounded-xl py-2.5 text-center text-sm font-medium transition-colors duration-150 disabled:opacity-60 ${
            plan.highlighted
              ? "bg-burgundy text-white hover:bg-burgundy-dark"
              : "border border-neutral-300 text-neutral-900 hover:border-neutral-400 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-800"
          }`}
        >
          {loading ? "Redirecting..." : plan.ctaLabel}
        </button>
      ) : (
        <Link
          href={plan.ctaHref}
          className={`mb-8 block rounded-xl py-2.5 text-center text-sm font-medium transition-colors duration-150 ${
            plan.highlighted
              ? "bg-burgundy text-white hover:bg-burgundy-dark"
              : "border border-neutral-300 text-neutral-900 hover:border-neutral-400 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-800"
          }`}
        >
          {plan.ctaLabel}
        </Link>
      )}

      <div className="flex-1 space-y-3">
        {plan.features.map((feature) => (
          <div key={feature.text} className="flex items-start gap-2.5">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-burgundy" aria-hidden="true" />
            <span className="text-sm text-neutral-700 dark:text-neutral-300">{feature.text}</span>
          </div>
        ))}

        {plan.limitations.length > 0 && (
          <div className="mt-4 space-y-3 border-t border-neutral-100 pt-4 dark:border-neutral-800">
            {plan.limitations.map((limitation) => (
              <div key={limitation.text} className="flex items-start gap-2.5">
                <X className="mt-0.5 h-4 w-4 shrink-0 text-neutral-300 dark:text-neutral-600" aria-hidden="true" />
                <span className="text-sm text-neutral-400 dark:text-neutral-500">{limitation.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {isFree && (
        <p className="mt-6 text-center text-xs text-neutral-400 dark:text-neutral-600">
          No credit card required
        </p>
      )}
    </div>
  );
}