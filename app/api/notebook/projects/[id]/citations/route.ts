import { addCitation } from "@/lib/notebook/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json()) as { title?: string; url?: string };
  const title = body.title?.trim();
  const url = body.url?.trim();
  if (!title || !url) return Response.json({ error: "A title and URL are required." }, { status: 400 });

  const citation = await addCitation(id, title, url);
  if (!citation) return Response.json({ error: "Not found." }, { status: 404 });
  return Response.json(citation);
}
