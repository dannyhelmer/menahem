import { withAuth } from "@/lib/auth/with-auth";
import { getUsageSummary } from "@/lib/subscription/guards";

// Returns the current user's usage summary -- plan, limits, and current
// usage counts. The frontend uses this to display usage bars, countdown
// timers, and limit-reached messages. All limits are enforced server-side
// in the respective API routes (chat, documents, conversations); this
// endpoint is read-only for display purposes.
export const GET = withAuth(async (_request, _ctx, user) => {
  const summary = await getUsageSummary(user);
  return Response.json(summary);
});