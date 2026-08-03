import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle } from "lucide-react";

// Transactional, post-checkout confirmation page -- only ever reached via a
// Stripe redirect after a real purchase, so it has no search value and
// should never be indexed.
export const metadata: Metadata = {
  title: "Subscription Activated",
  description: "Your Menahem Pro subscription is being activated.",
  alternates: { canonical: "/billing/success" },
  robots: { index: false, follow: false },
};

export default function BillingSuccessPage() {
  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-white px-6 dark:bg-neutral-950">
      <div className="w-full max-w-md space-y-5 rounded-2xl border border-neutral-200 bg-white px-8 py-10 text-center shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100 dark:bg-green-950">
          <CheckCircle className="h-7 w-7 text-green-600 dark:text-green-400" aria-hidden="true" />
        </div>

        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
          Thank You!
        </h1>

        <div className="space-y-2 text-sm text-neutral-600 dark:text-neutral-300">
          <p>Your Pro subscription is being activated.</p>
          <p>
            You now have access to Political Workspace, comparing bills, reports, and PDFs,
            unlimited saved conversations, unlimited document uploads, and 2,500 AI messages
            per month.
          </p>
          <p className="text-neutral-400 dark:text-neutral-500">
            If your access is not active within a few minutes, try refreshing the page.
          </p>
        </div>

        <Link href="/" className="bg-burgundy hover:bg-burgundy-dark inline-block rounded-xl px-5 py-2.5 text-sm font-medium text-white transition-colors duration-150">
          Start Using Menahem
        </Link>
      </div>
    </main>
  );
}