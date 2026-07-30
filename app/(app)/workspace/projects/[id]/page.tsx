import { notFound } from "next/navigation";
import ProjectWorkspace from "@/app/_components/ProjectWorkspace";
import { listDocuments } from "@/lib/documents/store";
import { getEntity } from "@/lib/graph/store";
import { getSummaries, listRecent } from "@/lib/memory/store";
import { getProject } from "@/lib/notebook/store";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
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
