import type { Metadata } from "next";
import Link from "next/link";
import { requireApprovedPageUser } from "@/lib/auth/session";
import { getOwnerProfile } from "@/lib/settings/owner-profile";
import AccountSection from "./_components/AccountSection";
import AiProvidersSection from "./_components/AiProvidersSection";
import GovernmentSourcesSection from "./_components/GovernmentSourcesSection";
import SearchProvidersSection from "./_components/SearchProvidersSection";
import ThemeSection from "./_components/ThemeSection";

export const metadata: Metadata = {
  title: "Settings",
};

function SettingsCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="mb-4 text-base font-semibold text-neutral-900 dark:text-neutral-100">{title}</h2>
      {children}
    </section>
  );
}

export default async function SettingsPage() {
  await requireApprovedPageUser();
  const profile = await getOwnerProfile();

  return (
    <main className="flex-1 overflow-y-auto px-6 py-10 sm:px-8">
      <div className="mx-auto max-w-[960px]">
        <Link
          href="/"
          className="hover:text-burgundy mb-8 inline-block text-sm text-neutral-500 dark:text-neutral-400"
        >
          ← Back to chat
        </Link>

        <h1 className="mb-8 text-2xl font-semibold text-neutral-900 dark:text-neutral-50">Settings</h1>

        <div className="space-y-6">
          <SettingsCard title="Account">
            <AccountSection initialProfile={profile} />
          </SettingsCard>

          <SettingsCard title="Appearance">
            <ThemeSection />
          </SettingsCard>

          <SettingsCard title="AI Providers">
            <AiProvidersSection />
          </SettingsCard>

          <SettingsCard title="Search Providers">
            <SearchProvidersSection />
          </SettingsCard>

          <SettingsCard title="Government Sources">
            <GovernmentSourcesSection />
          </SettingsCard>
        </div>
      </div>
    </main>
  );
}
