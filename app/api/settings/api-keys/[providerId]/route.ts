import { withAdmin, withAuth } from "@/lib/auth/with-auth";
import { API_KEY_PROVIDERS } from "@/lib/settings/api-key-providers";
import { clearApiKey, isApiKeyConfigured, saveApiKey } from "@/lib/settings/api-keys";

export const dynamic = "force-dynamic";

function isKnownProvider(providerId: string): boolean {
  return API_KEY_PROVIDERS.some((p) => p.id === providerId);
}

// Read-only status check (configured or not) -- available to any signed-in
// user so Settings can show a checkmark, but never returns the key value
// itself, masked or otherwise.
export const GET = withAuth(async (_request: Request, { params }: { params: Promise<{ providerId: string }> }) => {
  const { providerId } = await params;
  if (!isKnownProvider(providerId)) return Response.json({ error: "Unknown provider." }, { status: 404 });

  return Response.json({ configured: await isApiKeyConfigured(providerId) });
});

// These credentials are meant to be configured via deployment environment
// variables (see lib/settings/api-key-providers.ts's envVar field); this
// DB-backed fallback path still exists for a future admin configuration
// panel, but is admin-only -- ordinary users can never set, change, or
// clear a provider key.
export const PUT = withAdmin(async (request: Request, { params }: { params: Promise<{ providerId: string }> }) => {
  const { providerId } = await params;
  if (!isKnownProvider(providerId)) return Response.json({ error: "Unknown provider." }, { status: 404 });

  const { value } = (await request.json()) as { value?: string };
  if (typeof value !== "string" || !value.trim()) {
    return Response.json({ error: "A non-empty key value is required." }, { status: 400 });
  }

  await saveApiKey(providerId, value);
  return Response.json({ configured: true });
});

export const DELETE = withAdmin(async (_request: Request, { params }: { params: Promise<{ providerId: string }> }) => {
  const { providerId } = await params;
  if (!isKnownProvider(providerId)) return Response.json({ error: "Unknown provider." }, { status: 404 });

  await clearApiKey(providerId);
  return Response.json({ configured: false });
});
