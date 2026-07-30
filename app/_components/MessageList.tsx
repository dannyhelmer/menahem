import MessageBubble from "./MessageBubble";
import type { UiMessage } from "./chat-types";

export default function MessageList({
  messages,
  streaming,
  onSelectFollowup,
  onContinue,
  onDeepResearch,
}: {
  messages: UiMessage[];
  streaming: boolean;
  onSelectFollowup: (text: string) => void;
  onContinue: (assistantId: string) => void;
  onDeepResearch: (assistantId: string) => void;
}) {
  const lastMessage = messages[messages.length - 1];
  const isThinking = streaming && lastMessage?.role === "assistant" && lastMessage.content === "";

  return (
    <div className="flex flex-col gap-6">
      {messages.map((message) => (
        <MessageBubble
          key={message.id}
          message={message}
          onSelectFollowup={onSelectFollowup}
          onContinue={onContinue}
          onDeepResearch={onDeepResearch}
        />
      ))}
      {isThinking && (
        <div className="flex items-center gap-2 px-1 py-1">
          <span className="flex items-center gap-1.5">
            <span className="bg-burgundy/50 h-1.5 w-1.5 animate-bounce rounded-full [animation-delay:-0.3s]" />
            <span className="bg-burgundy/50 h-1.5 w-1.5 animate-bounce rounded-full [animation-delay:-0.15s]" />
            <span className="bg-burgundy/50 h-1.5 w-1.5 animate-bounce rounded-full" />
          </span>
          {lastMessage.statusLabel && (
            <span className="text-sm text-neutral-400 dark:text-neutral-500">
              {lastMessage.statusLabel}…
            </span>
          )}
        </div>
      )}
    </div>
  );
}
