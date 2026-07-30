import { addNote } from "@/lib/notebook/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json()) as { text?: string };
  const text = body.text?.trim();
  if (!text) return Response.json({ error: "Note text is required." }, { status: 400 });

  const note = await addNote(id, text);
  if (!note) return Response.json({ error: "Not found." }, { status: 404 });
  return Response.json(note);
}
