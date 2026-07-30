import { needsApiKeySetup } from "@/lib/ai/get-provider";
import { getSessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return Response.json({ user: null });

  // Server-wide now, identical for every signed-in user -- no per-user key
  // to check.
  const hasApiKey = !(await needsApiKeySetup());
  return Response.json({
    user: { email: user.email, approved: user.approved, isAdmin: user.isAdmin, hasApiKey },
  });
}
