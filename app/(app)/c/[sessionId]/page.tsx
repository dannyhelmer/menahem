import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ChatView from "@/app/_components/ChatView";
import { needsApiKeySetup } from "@/lib/ai/get-provider";
import { requireApprovedPageUser } from "@/lib/auth/session";
import { FALLBACK_TITLE } from "@/lib/memory/title";
import { loadSession } from "@/lib/memory/store";

// A conversation's title arrives asynchronously (generated after the first
// reply) -- this covers direct navigation/reload; the in-app transition
// from a brand-new chat to its generated title happens without a page
// navigation at all, so useChatSession.ts also syncs document.title
// directly once that title shows up.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}): Promise<Metadata> {
  const { sessionId } = await params;
  const user = await requireApprovedPageUser().catch(() => null);
  if (!user) return { title: { absolute: "Menahem" } };
  const session = await loadSession(sessionId, user.id);
  if (!session || session.title === FALLBACK_TITLE) return { title: { absolute: "Menahem" } };
  return { title: session.title };
}

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const user = await requireApprovedPageUser();
  const { sessionId } = await params;
  const [session, needsApiKey] = await Promise.all([loadSession(sessionId, user.id), needsApiKeySetup()]);
  if (!session) notFound();

  const initialMessages = session.messages.map((message, index) => ({
    id: `${sessionId}-${index}`,
    role: message.role,
    content: message.content,
    sources: message.sources,
    confidence: message.confidence,
    confidenceReason: message.confidenceReason,
    truncated: message.truncated,
  }));

  return (
    <ChatView
      key={sessionId}
      initialSessionId={sessionId}
      initialMessages={initialMessages}
      needsApiKey={needsApiKey}
    />
  );
}
