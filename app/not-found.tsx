import type { Metadata } from "next";
import Link from "next/link";
import { PAGE_SEO } from "@/lib/seo/constants";

export const metadata: Metadata = {
  title: PAGE_SEO.notFound.title,
  description: PAGE_SEO.notFound.description,
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main className="flex min-h-screen w-full flex-col items-center justify-center gap-4 bg-white px-6 text-center dark:bg-neutral-950">
      <h1 className="text-3xl font-semibold text-neutral-900 dark:text-neutral-50">Page Not Found</h1>
      <p className="max-w-md text-base text-neutral-500 dark:text-neutral-400">{PAGE_SEO.notFound.description}</p>
      <Link
        href="/"
        className="bg-burgundy hover:bg-burgundy-dark mt-2 rounded-xl px-5 py-2.5 text-sm font-medium text-white transition-colors duration-150"
      >
        Back to Menahem
      </Link>
    </main>
  );
}
