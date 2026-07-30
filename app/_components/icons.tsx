// Single, consistent icon system for the whole app -- thin wrappers around
// lucide-react, exported under the same names the rest of the app already
// calls (PromptInput, Sidebar, SidebarConversationItem, etc.), each keeping
// its previous size so no call site needs to change. Monochrome, stroke-based,
// no emoji anywhere in the product.
import {
  Send,
  Globe,
  FlaskConical,
  Plus,
  Search,
  Pin,
  MessageSquare,
  Pencil,
  Trash2,
  Link2,
  Share2,
} from "lucide-react";

export function SendIcon() {
  return <Send className="h-4 w-4" aria-hidden="true" />;
}

export function GlobeIcon() {
  return <Globe className="h-4 w-4 shrink-0" aria-hidden="true" />;
}

export function FlaskIcon() {
  return <FlaskConical className="h-4 w-4 shrink-0" aria-hidden="true" />;
}

export function PlusIcon() {
  return <Plus className="h-4 w-4" aria-hidden="true" />;
}

export function SearchIcon() {
  return <Search className="h-4 w-4 shrink-0" aria-hidden="true" />;
}

export function PinIcon() {
  return <Pin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
}

export function ChatBubbleIcon() {
  return <MessageSquare className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
}

export function PencilIcon() {
  return <Pencil className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
}

export function TrashIcon() {
  return <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
}

export function LinkIcon() {
  return <Link2 className="h-3 w-3 shrink-0" aria-hidden="true" />;
}

export function WorkspaceIcon() {
  return <Share2 className="h-4 w-4 shrink-0" aria-hidden="true" />;
}
