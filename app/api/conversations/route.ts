import { listPinned, listRecent } from "@/lib/memory/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const [pinned, recent] = await Promise.all([listPinned(), listRecent(8, true)]);
  return Response.json({ pinned, recent });
}
