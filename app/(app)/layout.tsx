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

  // "/" is the one route in this group reachable while logged out (see
  // proxy.ts) -- it renders a public marketing page for that case (see
  // app/(app)/page.tsx). That page must never be wrapped in the
  // authenticated app's Sidebar/chrome, which would both look broken (every
  // nav link bounces a guest straight to /signup) and defeat the point of a
  // plain, crawlable marketing page. Every other page under this layout
  // still requires a session to be reached at all, so this only ever
  // changes behavior for a signed-out visit to "/".
  if (!user) return <>{children}</>;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-white dark:bg-neutral-950">
      <Sidebar />
      {/* pt-14 reserves space for Sidebar's fixed mobile top bar (h-14) --
          only needed below md, where that bar is fixed/out-of-flow and
          would otherwise overlap the first ~56px of page content. */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden pt-14 md:pt-0">{children}</div>
      {!user.preferredName && <ProfileOnboarding />}
    </div>
  );
}
