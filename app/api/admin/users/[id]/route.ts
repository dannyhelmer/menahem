import { deleteUser, setApproved } from "@/lib/auth/users";
import { withAdmin } from "@/lib/auth/with-auth";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = withAdmin<Ctx>(async (request, { params }, admin) => {
  const { id } = await params;
  const { approved } = (await request.json()) as { approved?: boolean };
  if (typeof approved !== "boolean") {
    return Response.json({ error: "approved (boolean) is required." }, { status: 400 });
  }
  if (id === admin.id && !approved) {
    return Response.json({ error: "You can't revoke your own access." }, { status: 400 });
  }

  await setApproved(id, approved);
  return Response.json({ ok: true });
});

export const DELETE = withAdmin<Ctx>(async (_request, { params }, admin) => {
  const { id } = await params;
  if (id === admin.id) {
    return Response.json({ error: "You can't delete your own account." }, { status: 400 });
  }

  await deleteUser(id);
  return Response.json({ ok: true });
});
