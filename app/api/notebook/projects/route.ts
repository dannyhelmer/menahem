import { createProject, listProjects } from "@/lib/notebook/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const projects = await listProjects();
  return Response.json({ projects });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { name?: string; description?: string };
  const name = body.name?.trim();
  if (!name) return Response.json({ error: "A project name is required." }, { status: 400 });

  const project = await createProject(name, body.description?.trim() ?? "");
  return Response.json(project);
}
