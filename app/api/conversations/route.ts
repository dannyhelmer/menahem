import { withAuth } from "@/lib/auth/with-auth";
import { listPinned, listRecent } from "@/lib/memory/store";

export const dynamic = "force-dynamic";

export const GET = withAuth(async () => {
  const [pinned, recent] = await Promise.all([listPinned(), listRecent(8, true)]);
  return Response.json({ pinned, recent });
});
