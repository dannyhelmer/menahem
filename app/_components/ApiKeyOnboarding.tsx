import Link from "next/link";

// Shown instead of the composer whenever the signed-in user hasn't
// configured an AI provider key yet (production only -- see
// lib/ai/get-provider.ts's needsApiKeySetup).
export default function ApiKeyOnboarding() {
  return (
    <main className="flex flex-1 items-center justify-center px-6">
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-neutral-200 bg-white px-8 py-10 text-center shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">Connect an AI provider</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-300">
          Menahem needs an OpenAI API key to research and answer questions. Add your own key in Settings to get
          started -- it's encrypted and never shared with other accounts.
        </p>
        <Link
          href="/settings"
          className="bg-burgundy hover:bg-burgundy-dark inline-block rounded-xl px-5 py-2.5 text-sm font-medium text-white transition-colors duration-150"
        >
          Go to AI Provider Settings
        </Link>
      </div>
    </main>
  );
}
