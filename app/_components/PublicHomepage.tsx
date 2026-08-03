import Link from "next/link";

// The public, crawlable homepage shown to signed-out visitors (and search
// engines) at "/" -- app/(app)/page.tsx renders this instead of the
// authenticated ChatView when there's no session. Deliberately reuses the
// exact H1/subtitle text and visual language the authenticated Dashboard's
// empty state already uses ("Menahem" / "AI-powered research for
// legislation, public policy, and official government sources."), just
// with a Sign Up/Sign In call to action in place of a composer that can't
// actually function without an account.
const CAPABILITIES = [
  "Research legislation and bills",
  "Explain public policy",
  "Analyze court opinions",
  "Search official government documents",
  "Compare laws and constitutions",
  "Organize research into workspaces",
  "Analyze uploaded PDFs and images",
  "Support deep government research with AI",
];

export default function PublicHomepage() {
  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-burgundy focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
      >
        Skip to main content
      </a>

      <header className="border-b border-neutral-200 dark:border-neutral-800">
        <nav
          aria-label="Primary"
          className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4"
        >
          <Link href="/" className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
            Menahem
          </Link>
          <div className="flex items-center gap-5 text-sm">
            <Link href="/pricing" className="text-neutral-600 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-neutral-50">
              Pricing
            </Link>
            <Link href="/about" className="text-neutral-600 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-neutral-50">
              About
            </Link>
            <Link href="/signin" className="text-neutral-600 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-neutral-50">
              Sign In
            </Link>
            <Link
              href="/signup"
              className="bg-burgundy hover:bg-burgundy-dark rounded-xl px-4 py-2 font-medium text-white transition-colors duration-150"
            >
              Get Started
            </Link>
          </div>
        </nav>
      </header>

      <main id="main-content">
        <section aria-labelledby="hero-heading" className="px-6 py-20 text-center sm:py-28">
          <div className="mx-auto max-w-3xl space-y-6">
            <h1
              id="hero-heading"
              className="text-4xl font-semibold tracking-tight text-neutral-900 sm:text-5xl dark:text-neutral-50"
            >
              Menahem
            </h1>
            <p className="mx-auto max-w-2xl text-lg text-neutral-500 dark:text-neutral-400">
              AI-powered research for legislation, public policy, and official government sources.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <Link
                href="/signup"
                className="bg-burgundy hover:bg-burgundy-dark rounded-xl px-6 py-3 text-sm font-medium text-white transition-colors duration-150"
              >
                Get Started Free
              </Link>
              <Link
                href="/pricing"
                className="rounded-xl border border-neutral-200 px-6 py-3 text-sm font-medium text-neutral-700 transition-colors duration-150 hover:border-neutral-300 dark:border-neutral-800 dark:text-neutral-300 dark:hover:border-neutral-700"
              >
                View Pricing
              </Link>
            </div>
          </div>
        </section>

        <section aria-labelledby="capabilities-heading" className="border-t border-neutral-200 px-6 py-16 dark:border-neutral-800">
          <div className="mx-auto max-w-3xl">
            <h2 id="capabilities-heading" className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
              What Menahem Can Do
            </h2>
            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
              {CAPABILITIES.map((item) => (
                <li
                  key={item}
                  className="rounded-xl border border-neutral-200 px-4 py-3 text-sm text-neutral-600 dark:border-neutral-800 dark:text-neutral-300"
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-labelledby="who-heading" className="border-t border-neutral-200 px-6 py-16 dark:border-neutral-800">
          <div className="mx-auto max-w-3xl">
            <h2 id="who-heading" className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
              Built for Researchers, Journalists, and Policymakers
            </h2>
            <p className="mt-4 text-base leading-relaxed text-neutral-600 dark:text-neutral-300">
              Menahem combines artificial intelligence with official government sources to make legislation,
              public policy, court decisions, and public records easier to explore -- prioritizing primary
              sources like Congress.gov, state legislatures, and court opinions over secondary commentary.
              Students, journalists, researchers, public officials, and engaged citizens use Menahem to access
              trustworthy government information more efficiently.
            </p>
            <p className="mt-4">
              <Link href="/about" className="text-burgundy text-sm font-medium hover:underline">
                Learn more about Menahem →
              </Link>
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-neutral-200 px-6 py-8 dark:border-neutral-800">
        <nav aria-label="Footer" className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 text-sm text-neutral-500 dark:text-neutral-400">
          <span>© {new Date().getFullYear()} Menahem</span>
          <div className="flex flex-wrap gap-5">
            <Link href="/about" className="hover:text-neutral-900 dark:hover:text-neutral-50">
              About
            </Link>
            <Link href="/pricing" className="hover:text-neutral-900 dark:hover:text-neutral-50">
              Pricing
            </Link>
            <Link href="/privacy" className="hover:text-neutral-900 dark:hover:text-neutral-50">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-neutral-900 dark:hover:text-neutral-50">
              Terms
            </Link>
          </div>
        </nav>
      </footer>
    </>
  );
}
