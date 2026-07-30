import { notFound } from "next/navigation";
import ResearchWorkspace from "@/app/_components/ResearchWorkspace";
import { needsApiKeySetup } from "@/lib/ai/get-provider";
import { requireApprovedPageUser } from "@/lib/auth/session";
import { listByCategory } from "@/lib/memory/store";
import { getResearchCategory } from "@/lib/research-categories/config";

export default async function ResearchCategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const user = await requireApprovedPageUser();
  const { slug } = await params;
  const category = getResearchCategory(slug);
  if (!category) notFound();

  const [recentSearches, needsApiKey] = await Promise.all([listByCategory(slug), needsApiKeySetup(user.id)]);

  return <ResearchWorkspace category={category} recentSearches={recentSearches} needsApiKey={needsApiKey} />;
}
