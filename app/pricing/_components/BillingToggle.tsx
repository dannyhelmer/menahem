"use client";

import type { BillingInterval } from "@/lib/pricing/plans";

interface BillingToggleProps {
  interval: BillingInterval;
  onChange: (interval: BillingInterval) => void;
}

export default function BillingToggle({ interval, onChange }: BillingToggleProps) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-neutral-50 p-1 dark:border-neutral-800 dark:bg-neutral-900">
      <button
        onClick={() => onChange("monthly")}
        className={`relative rounded-full px-4 py-1.5 text-sm font-medium transition-colors duration-200 ${
          interval === "monthly"
            ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-white"
            : "text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
        }`}
      >
        Monthly
      </button>
      <button
        onClick={() => onChange("yearly")}
        className={`relative flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors duration-200 ${
          interval === "yearly"
            ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-white"
            : "text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
        }`}
      >
        Yearly
        <span className="rounded-full bg-burgundy/10 px-1.5 py-0.5 text-[10px] font-semibold text-burgundy">
          2 months free
        </span>
      </button>
    </div>
  );
}