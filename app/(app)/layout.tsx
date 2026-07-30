import type { Metadata } from "next";
import Sidebar from "@/app/_components/Sidebar";
import ProfileOnboarding from "@/app/_components/ProfileOnboarding";
import { getSessionUser } from "@/lib/auth/session";

// Every page under this layout requires an approved account (private
// beta) -- none of it should ever be indexed, regardless of what any
// individual page below might otherwise set. Single choke point, same
// reasoning as proxy.ts's auth gate: one place to get this right rather
// than repeating it on every page.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Approval itself is already enforced by every individual page
  // (requireApprovedPageUser) -- this read is only to decide whether to
  // show the "what should we call you" prompt, not a security check.
  const user = await getSessionUser();

  return (
    <div className="flex h-screen w-full overflow-hidden bg-white dark:bg-neutral-950">
      <Sidebar />
      {children}
      {user && !user.preferredName && <ProfileOnboarding />}
    </div>
  );
}
