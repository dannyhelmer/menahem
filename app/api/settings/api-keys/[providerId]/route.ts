import { withAuth } from "@/lib/auth/with-auth";
import { API_KEY_PROVIDERS } from "@/lib/settings/api-key-providers";
import { clearApiKey, getMaskedApiKey, isApiKeyConfigured, saveApiKey } from "@/lib/settings/api-keys";

export const dynamic = "force-dynamic";

function isKnownProvider(providerId: string): boolean {
  return API_KEY_PROVIDERS.some((p) => p.id === providerId);
}

export const GET = withAuth(async (_request: Request, { params }: { params: Promise<{ providerId: string }> }) => {
  const { providerId } = await params;
  if (!isKnownProvider(providerId)) return Response.json({ error: "Unknown provider." }, { status: 404 });

  return Response.json({
    configured: await isApiKeyConfigured(providerId),
    masked: await getMaskedApiKey(providerId),
  });
});

export const PUT = withAuth(async (request: Request, { params }: { params: Promise<{ providerId: string }> }) => {
  const { providerId } = await params;
  if (!isKnownProvider(providerId)) return Response.json({ error: "Unknown provider." }, { status: 404 });

  const { value } = (await request.json()) as { value?: string };
  if (typeof value !== "string" || !value.trim()) {
    return Response.json({ error: "A non-empty key value is required." }, { status: 400 });
  }

  await saveApiKey(providerId, value);
  return Response.json({ configured: true, masked: await getMaskedApiKey(providerId) });
});

export const DELETE = withAuth(async (_request: Request, { params }: { params: Promise<{ providerId: string }> }) => {
  const { providerId } = await params;
  if (!isKnownProvider(providerId)) return Response.json({ error: "Unknown provider." }, { status: 404 });

  await clearApiKey(providerId);
  return Response.json({ configured: false, masked: null });
});
