import Link from "next/link";
import { requireApprovedPageUser } from "@/lib/auth/session";
import { getOwnerProfile } from "@/lib/settings/owner-profile";
import AccountSection from "./_components/AccountSection";
import AiProvidersSection from "./_components/AiProvidersSection";
import GovernmentSourcesSection from "./_components/GovernmentSourcesSection";
import SearchProvidersSection from "./_components/SearchProvidersSection";

export default async function SettingsPage() {
  await requireApprovedPageUser();
  const profile = await getOwnerProfile();

  return (
    <main className="flex-1 overflow-y-auto px-6 py-10">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/"
          className="hover:text-burgundy mb-8 inline-block text-sm text-neutral-500 dark:text-neutral-400"
        >
          ← Back to chat
        </Link>

        <h1 className="mb-8 text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
          Settings
        </h1>

        <section>
          <h2 className="mb-4 text-lg font-medium text-neutral-900 dark:text-neutral-100">
            Account
          </h2>
          <AccountSection initialProfile={profile} />
        </section>

        <section className="mt-10">
          <h2 className="mb-4 text-lg font-medium text-neutral-900 dark:text-neutral-100">
            AI Providers
          </h2>
          <AiProvidersSection />
        </section>

        <section className="mt-10">
          <h2 className="mb-4 text-lg font-medium text-neutral-900 dark:text-neutral-100">
            Search Providers
          </h2>
          <SearchProvidersSection />
        </section>

        <section className="mt-10">
          <h2 className="mb-4 text-lg font-medium text-neutral-900 dark:text-neutral-100">
            Government Sources
          </h2>
          <GovernmentSourcesSection />
        </section>
      </div>
    </main>
  );
}
