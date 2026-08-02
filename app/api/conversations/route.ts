import { withAuth } from "@/lib/auth/with-auth";
import {
  listPinned,
  listRecent,
  listAllActive,
  listTrashed,
  deleteSessions,
  restoreSessions,
  deleteSessionsPermanently,
  purgeExpiredTrash,
} from "@/lib/memory/store";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (request, _ctx, user) => {
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode");

  // Purge expired trash on any conversations list request (best-effort).
  try {
    await purgeExpiredTrash();
  } catch {
    // Non-critical -- don't block the list if purge fails.
  }

  if (mode === "history") {
    const search = url.searchParams.get("search") ?? undefined;
    const sortBy = (url.searchParams.get("sortBy") as "date" | "title" | null) ?? undefined;
    const conversations = await listAllActive(user.id, { search, sortBy });
    return Response.json({ conversations });
  }

  if (mode === "trash") {
    const conversations = await listTrashed(user.id);
    return Response.json({ conversations });
  }

  // Default: sidebar view (pinned + recent)
  const [pinned, recent] = await Promise.all([listPinned(user.id), listRecent(user.id, 8, true)]);
  return Response.json({ pinned, recent });
});

// Batch operations for the History page's multi-select feature.
export const POST = withAuth(async (request, _ctx, user) => {
  const body = (await request.json()) as {
    action?: "delete" | "restore" | "deletePermanent";
    sessionIds?: string[];
  };

  if (!body.action || !Array.isArray(body.sessionIds)) {
    return Response.json({ error: "action and sessionIds are required." }, { status: 400 });
  }

  const ids = body.sessionIds.filter((id) => id);

  if (body.action === "delete") {
    await deleteSessions(ids, user.id);
  } else if (body.action === "restore") {
    await restoreSessions(ids, user.id);
  } else if (body.action === "deletePermanent") {
    await deleteSessionsPermanently(ids, user.id);
  } else {
    return Response.json({ error: "Invalid action." }, { status: 400 });
  }

  return Response.json({ ok: true });
});
