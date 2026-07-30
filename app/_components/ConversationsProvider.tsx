"use client";

import { createContext, useContext, useState } from "react";

interface ConversationsContextValue {
  version: number;
  refresh: () => void;
}

const ConversationsContext = createContext<ConversationsContextValue | null>(null);

export function ConversationsProvider({ children }: { children: React.ReactNode }) {
  const [version, setVersion] = useState(0);
  const refresh = () => setVersion((v) => v + 1);

  return (
    <ConversationsContext.Provider value={{ version, refresh }}>
      {children}
    </ConversationsContext.Provider>
  );
}

export function useConversationsRefresh(): ConversationsContextValue {
  const context = useContext(ConversationsContext);
  if (!context) {
    throw new Error("useConversationsRefresh must be used within a ConversationsProvider");
  }
  return context;
}
