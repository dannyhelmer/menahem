import { withAuth } from "@/lib/auth/with-auth";
import { createProject, listProjects } from "@/lib/notebook/store";
import { getSubscription } from "@/lib/subscription/store";
import { isProPlan } from "@/lib/subscription/plans";

export const dynamic = "force-dynamic";

async function isUserPro(userId: string): Promise<boolean> {
  const sub = await getSubscription(userId);
  if (sub && sub.status === "active") return isProPlan(sub.plan);
  return false;
}

export const GET = withAuth(async (_request, _ctx, user) => {
  const projects = await listProjects(user.id);
  return Response.json({ projects });
});

export const POST = withAuth(async (request: Request, _ctx, user) => {
  // Political Workspace project creation is Pro-only -- free users can see
  // the workspace but cannot create new projects.
  const pro = await isUserPro(user.id);
  if (!pro) {
    return Response.json(
      { error: "Political Workspace projects are a Pro feature. Upgrade to Pro to create projects." },
      { status: 403 },
    );
  }

  const body = (await request.json()) as { name?: string; description?: string };
  const name = body.name?.trim();
  if (!name) return Response.json({ error: "A project name is required." }, { status: 400 });

  const project = await createProject(user.id, name, body.description?.trim() ?? "");
  return Response.json(project);
});
