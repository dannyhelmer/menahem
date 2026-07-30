import { Scale, Gavel, DollarSign, Vote, ScrollText, Building2, type LucideIcon } from "lucide-react";

// Kept separate from lib/research-categories/config.ts so that plain data
// file stays importable from server code (app/api/chat/route.ts) without
// pulling React/icon components into that bundle.
export const RESEARCH_CATEGORY_ICONS: Record<string, LucideIcon> = {
  legislation: Scale,
  "court-opinions": Gavel,
  budgets: DollarSign,
  elections: Vote,
  constitution: ScrollText,
  agencies: Building2,
};
