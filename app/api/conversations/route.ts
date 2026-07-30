import { withAuth } from "@/lib/auth/with-auth";
import { listPinned, listRecent } from "@/lib/memory/store";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (_request, _ctx, user) => {
  const [pinned, recent] = await Promise.all([listPinned(user.id), listRecent(user.id, 8, true)]);
  return Response.json({ pinned, recent });
});
