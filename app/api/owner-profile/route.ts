import { withAuth } from "@/lib/auth/with-auth";
import { getOwnerProfile, saveOwnerProfile } from "@/lib/settings/owner-profile";

export const dynamic = "force-dynamic";

export const GET = withAuth(async () => {
  return Response.json(await getOwnerProfile());
});

export const PATCH = withAuth(async (request: Request) => {
  const body = (await request.json()) as { name?: string; preferredName?: string };
  const patch: { name?: string; preferredName?: string } = {};

  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim();
  if (typeof body.preferredName === "string" && body.preferredName.trim()) {
    patch.preferredName = body.preferredName.trim();
  }

  const updated = await saveOwnerProfile(patch);
  return Response.json(updated);
});
