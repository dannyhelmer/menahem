import type { Metadata } from "next";
import HistoryPage from "@/app/_components/HistoryPage";
import { requireApprovedPageUser } from "@/lib/auth/session";
import { PAGE_SEO } from "@/lib/seo/constants";

// Personalized, account-specific content -- inherits (app)/layout.tsx's
// blanket noindex; this description is only for the browser tab/history,
// never a search snippet.
export const metadata: Metadata = {
  title: PAGE_SEO.history.title,
  description: PAGE_SEO.history.description,
};

export default async function Page() {
  await requireApprovedPageUser();
  return <HistoryPage />;
}