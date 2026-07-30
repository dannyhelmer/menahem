import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ProjectWorkspace from "@/app/_components/ProjectWorkspace";
import { requireApprovedPageUser } from "@/lib/auth/session";
import { listDocuments } from "@/lib/documents/store";
import { getEntity } from "@/lib/graph/store";
import { getSummaries, listRecent } from "@/lib/memory/store";
import { getProject } from "@/lib/notebook/store";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const project = await getProject(id);
  return { title: project ? project.name : { absolute: "Menahem" } };
}

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  await requireApprovedPageUser();
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();

  const [entities, conversations, recent, documents] = await Promise.all([
    Promise.all(project.entityIds.map((entityId) => getEntity(entityId))),
    getSummaries(project.conversationIds),
    listRecent(20, false),
    listDocuments(id),
  ]);

  const linkableConversations = recent.filter((c) => !project.conversationIds.includes(c.sessionId));

  return (
    <ProjectWorkspace
      project={project}
      entities={entities.filter((e) => e !== null)}
      conversations={conversations}
      linkableConversations={linkableConversations}
      documents={documents}
    />
  );
}
