import type { Metadata } from "next";
import HistoryPage from "@/app/_components/HistoryPage";
import { requireApprovedPageUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Conversation History",
};

export default async function Page() {
  await requireApprovedPageUser();
  return <HistoryPage />;
}