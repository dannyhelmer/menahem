import Link from "next/link";

export function LegalSection({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-base font-semibold text-neutral-900 dark:text-neutral-100">{heading}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

export default function LegalPageLayout({
  title,
  lastUpdated,
  children,
}: {
  title: string;
  lastUpdated: string;
  children: React.ReactNode;
}) {
  return (
    <main className="flex-1 overflow-y-auto px-6 py-12">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/"
          className="hover:text-burgundy mb-8 inline-block text-sm text-neutral-500 dark:text-neutral-400"
        >
          ← Back to Menahem
        </Link>

        <h1 className="mb-1 text-2xl font-semibold text-neutral-900 dark:text-neutral-50">{title}</h1>
        <p className="mb-8 text-sm text-neutral-400 dark:text-neutral-500">Last Updated: {lastUpdated}</p>

        <div className="space-y-6 text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">{children}</div>
      </div>
    </main>
  );
}
