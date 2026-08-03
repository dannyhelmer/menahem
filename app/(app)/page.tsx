import type { Metadata } from "next";
import ChatView from "@/app/_components/ChatView";
import PublicHomepage from "@/app/_components/PublicHomepage";
import { needsApiKeySetup } from "@/lib/ai/get-provider";
import { getSessionUser, requireApprovedPageUser } from "@/lib/auth/session";
import { listAllEntities } from "@/lib/graph/store";
import type { EntityType } from "@/lib/graph/types";
import { PAGE_SEO, SITE_KEYWORDS } from "@/lib/seo/constants";

// "/" serves two entirely different things depending on session state: a
// public, indexable marketing page for a logged-out visitor (including
// search crawlers -- see proxy.ts, which lets "/" through unauthenticated),
// and the authenticated chat app for everyone else. Metadata has to branch
// the same way generateMetadata runs -- a static export can't read the
// session, and (app)/layout.tsx's blanket noindex is deliberately
// overridden here for the logged-out case, since a page's own metadata for
// a field takes precedence over its parent layout's.
export async function generateMetadata(): Promise<Metadata> {
  const user = await getSessionUser();
  if (user) {
    // Plain "Menahem" during normal app usage -- never indexed (private,
    // personalized chat interface).
    return { title: { absolute: "Menahem" }, robots: { index: false, follow: false } };
  }

  const { title, description } = PAGE_SEO.home;
  return {
    // The homepage's title already includes the site name -- `absolute`
    // bypasses the root layout's `%s | Menahem` template so it doesn't get
    // appended a second time ("... | Menahem | Menahem").
    title: { absolute: title },
    description,
    keywords: SITE_KEYWORDS,
    alternates: { canonical: "/" },
    robots: { index: true, follow: true },
    openGraph: { title, description, url: "/", type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

const RECENT_RESEARCH_TYPES = new Set<EntityType>(["bill", "representative", "candidate"]);
const RECENT_RESEARCH_LIMIT = 6;

export default async function Home() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return <PublicHomepage />;

  await requireApprovedPageUser();
  const [entities, needsApiKey] = await Promise.all([listAllEntities(), needsApiKeySetup()]);

  const recentEntities = entities
    .filter((entity) => RECENT_RESEARCH_TYPES.has(entity.type))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, RECENT_RESEARCH_LIMIT);

  return <ChatView recentEntities={recentEntities} needsApiKey={needsApiKey} />;
}
