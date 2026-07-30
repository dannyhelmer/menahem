import { hasConfiguredApiKey } from "@/lib/ai/user-api-keys";
import { getSessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return Response.json({ user: null });

  const hasApiKey = await hasConfiguredApiKey(user.id, "openai");
  return Response.json({
    user: { email: user.email, approved: user.approved, isAdmin: user.isAdmin, hasApiKey },
  });
}
