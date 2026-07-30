import { notFound } from "next/navigation";
import ChatView from "@/app/_components/ChatView";
import { loadSession } from "@/lib/memory/store";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const session = await loadSession(sessionId);
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

  return <ChatView key={sessionId} initialSessionId={sessionId} initialMessages={initialMessages} />;
}
