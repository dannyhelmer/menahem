"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ShieldCheck, Lock, CheckCircle, XCircle } from "lucide-react";
import { PRICING_PLANS, PRICING_FAQS, type BillingInterval } from "@/lib/pricing/plans";
import PricingCard from "./PricingCard";
import BillingToggle from "./BillingToggle";
import FaqAccordion from "./FaqAccordion";
import PaymentIcons from "./PaymentIcons";

export default function PricingContent() {
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const [loading, setLoading] = useState(false);
  const searchParams = useSearchParams();
  const isSuccess = searchParams.get("success") === "true";
  const isCanceled = searchParams.get("canceled") === "true";

  async function handleUpgrade() {
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to start checkout. Please try again.");
        setLoading(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      alert("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <main className="flex-1 overflow-y-auto bg-white dark:bg-neutral-950">
      <div className="mx-auto max-w-5xl px-6 pt-8">
        <Link
          href="/"
          className="hover:text-burgundy inline-block text-sm text-neutral-500 dark:text-neutral-400"
        >
          ← Back to Menahem
        </Link>
      </div>

      {isSuccess && (
        <div className="mx-auto mt-4 max-w-2xl px-6">
          <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3 dark:border-green-900 dark:bg-green-950/50">
            <CheckCircle className="h-5 w-5 shrink-0 text-green-600 dark:text-green-400" aria-hidden="true" />
            <p className="text-sm text-green-800 dark:text-green-300">
              Payment successful! Your Pro subscription is now active.
            </p>
          </div>
        </div>
      )}

      {isCanceled && (
        <div className="mx-auto mt-4 max-w-2xl px-6">
          <div className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900/50">
            <XCircle className="h-5 w-5 shrink-0 text-neutral-400" aria-hidden="true" />
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Checkout was canceled. You can upgrade anytime.
            </p>
          </div>
        </div>
      )}

      <section className="px-6 pb-10 pt-12 text-center">
        <div className="mx-auto max-w-2xl">
          <h1 className="text-4xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-5xl">
            Choose Your Plan
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-neutral-500 dark:text-neutral-400">
            Start free and upgrade for faster, deeper, and more powerful government intelligence.
          </p>
        </div>

        <div className="mt-8 flex justify-center">
          <BillingToggle interval={interval} onChange={setInterval} />
        </div>
      </section>

      <section className="px-6 pb-16">
        <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-2">
          {PRICING_PLANS.map((plan) => (
            <PricingCard
              key={plan.id}
              plan={plan}
              interval={interval}
              onUpgrade={plan.id === "pro" ? handleUpgrade : undefined}
              loading={loading}
            />
          ))}
        </div>

        <p className="mt-8 text-center text-sm text-neutral-400 dark:text-neutral-600">
          Cancel anytime. No hidden fees.
        </p>
      </section>

      <section className="border-t border-neutral-100 bg-neutral-50 px-6 py-16 dark:border-neutral-900 dark:bg-neutral-900/50">
        <div className="mx-auto max-w-2xl">
          <h2 className="mb-8 text-center text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
            Frequently Asked Questions
          </h2>
          <FaqAccordion items={PRICING_FAQS} />
        </div>
      </section>

      <section className="px-6 py-12">
        <div className="mx-auto max-w-2xl text-center">
          <div className="mb-4 flex items-center justify-center gap-2 text-neutral-700 dark:text-neutral-300">
            <ShieldCheck className="h-5 w-5 text-burgundy" aria-hidden="true" />
            <span className="text-sm font-medium">Secure Payment</span>
          </div>
          <p className="mb-6 text-sm text-neutral-500 dark:text-neutral-400">
            Your payment information is processed securely through a PCI-compliant provider.
            We never store your full card details on our servers.
          </p>
          <PaymentIcons />
          <div className="mt-6 flex items-center justify-center gap-1.5 text-xs text-neutral-400 dark:text-neutral-600">
            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
            <span>256-bit SSL encryption</span>
          </div>
        </div>
      </section>
    </main>
  );
}