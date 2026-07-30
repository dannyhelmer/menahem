import { notFound } from "next/navigation";
import ResearchWorkspace from "@/app/_components/ResearchWorkspace";
import { listByCategory } from "@/lib/memory/store";
import { getResearchCategory } from "@/lib/research-categories/config";

export default async function ResearchCategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const category = getResearchCategory(slug);
  if (!category) notFound();

  const recentSearches = await listByCategory(slug);

  return <ResearchWorkspace category={category} recentSearches={recentSearches} />;
}
