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
  LogOut,
  ShieldCheck,
  Settings,
  HelpCircle,
  ChevronRight,
  Paperclip,
  X,
  Menu,
  CreditCard,
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

export function SignOutIcon() {
  return <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />;
}

export function AdminIcon() {
  return <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />;
}

export function SettingsIcon() {
  return <Settings className="h-4 w-4 shrink-0" aria-hidden="true" />;
}

export function HelpIcon() {
  return <HelpCircle className="h-4 w-4 shrink-0" aria-hidden="true" />;
}

export function ChevronRightIcon() {
  return <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
}

export function AttachIcon() {
  return <Paperclip className="h-4 w-4 shrink-0" aria-hidden="true" />;
}

export function CloseIcon() {
  return <X className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
}

export function MenuIcon() {
  return <Menu className="h-5 w-5" aria-hidden="true" />;
}

export function PricingIcon() {
  return <CreditCard className="h-4 w-4 shrink-0" aria-hidden="true" />;
}
