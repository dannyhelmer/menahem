// Shown instead of the composer whenever the DEPLOYMENT has no AI provider
// configured yet (production only -- see lib/ai/get-provider.ts's
// needsApiKeySetup). AI provider credentials are server-side deployment
// config now, never something an individual user sets up, so this is a
// deployment-configuration problem, not something the signed-in user can
// fix themselves.
export default function ApiKeyOnboarding() {
  return (
    <main className="flex flex-1 items-center justify-center px-6">
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-neutral-200 bg-white px-8 py-10 text-center shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">Menahem isn't available right now</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-300">
          This deployment doesn't have an AI provider configured yet. This isn't something you need to set up --
          please check back shortly, or contact the Menahem team if this persists.
        </p>
      </div>
    </main>
  );
}
