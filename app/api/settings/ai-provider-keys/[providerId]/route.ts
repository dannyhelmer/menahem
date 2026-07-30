import { deleteUserApiKey, getMaskedUserApiKey, hasConfiguredApiKey, saveUserApiKey } from "@/lib/ai/user-api-keys";
import { PROVIDER_REGISTRY } from "@/lib/ai/providers/registry";
import { withAuth } from "@/lib/auth/with-auth";

export const dynamic = "force-dynamic";

function isKnownProvider(providerId: string): boolean {
  return providerId in PROVIDER_REGISTRY;
}

type Ctx = { params: Promise<{ providerId: string }> };

// Every handler scopes strictly to the authenticated session's own userId --
// never another account's key, and never returns the raw key value, only
// the masked display form.
export const GET = withAuth<Ctx>(async (_request, { params }, user) => {
  const { providerId } = await params;
  if (!isKnownProvider(providerId)) return Response.json({ error: "Unknown provider." }, { status: 404 });

  return Response.json({
    configured: await hasConfiguredApiKey(user.id, providerId),
    masked: await getMaskedUserApiKey(user.id, providerId),
  });
});

export const PUT = withAuth<Ctx>(async (request, { params }, user) => {
  const { providerId } = await params;
  if (!isKnownProvider(providerId)) return Response.json({ error: "Unknown provider." }, { status: 404 });

  const { value } = (await request.json()) as { value?: string };
  if (typeof value !== "string" || !value.trim()) {
    return Response.json({ error: "A non-empty key value is required." }, { status: 400 });
  }

  await saveUserApiKey(user.id, providerId, value);
  return Response.json({ configured: true, masked: await getMaskedUserApiKey(user.id, providerId) });
});

export const DELETE = withAuth<Ctx>(async (_request, { params }, user) => {
  const { providerId } = await params;
  if (!isKnownProvider(providerId)) return Response.json({ error: "Unknown provider." }, { status: 404 });

  await deleteUserApiKey(user.id, providerId);
  return Response.json({ configured: false, masked: null });
});
