import Link from "next/link";
import { notFound } from "next/navigation";
import AddToProjectButton from "@/app/_components/AddToProjectButton";
import { getConnectedEntities, getEntity } from "@/lib/graph/store";
import { humanize } from "@/lib/graph/humanize";
import { getTimeline } from "@/lib/timeline/store";

function DataFields({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data).filter(
    ([, value]) => value !== undefined && value !== null && value !== "",
  );
  if (entries.length === 0) return null;

  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
      {entries.map(([key, value]) => (
        <div key={key} className="contents">
          <dt className="text-neutral-500 dark:text-neutral-400">{humanize(key)}</dt>
          <dd className="text-neutral-800 dark:text-neutral-200">{String(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

export default async function WorkspaceEntityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const entityId = decodeURIComponent(id);

  const entity = await getEntity(entityId);
  if (!entity) notFound();

  const [connected, timeline] = await Promise.all([
    getConnectedEntities(entityId),
    getTimeline(entityId),
  ]);

  return (
    <main className="flex-1 overflow-y-auto px-6 py-10">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/workspace"
          className="hover:text-burgundy mb-8 inline-block text-sm text-neutral-500 dark:text-neutral-400"
        >
          ← Back to workspace
        </Link>

        <div className="mb-3 flex items-start justify-between gap-4">
          <span className="bg-burgundy/10 text-burgundy inline-block rounded-full px-3 py-1 text-xs font-medium dark:bg-burgundy/20">
            {humanize(entity.type)}
          </span>
          <AddToProjectButton entityId={entity.id} />
        </div>
        <h1 className="mb-1 text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
          {entity.label}
        </h1>
        <p className="mb-8 text-xs text-neutral-400 dark:text-neutral-500">
          Source: {entity.source} · Updated {new Date(entity.updatedAt).toLocaleString()}
        </p>

        <section className="mb-10">
          <h2 className="mb-3 text-lg font-medium text-neutral-900 dark:text-neutral-100">Details</h2>
          <DataFields data={entity.data} />
        </section>

        <section className="mb-10">
          <h2 className="mb-3 text-lg font-medium text-neutral-900 dark:text-neutral-100">Connections</h2>
          {connected.length === 0 ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">No known connections yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {connected.map(({ entity: other, edge }) => {
                const outgoing = edge.from === entityId;
                return (
                  <li key={`${edge.from}-${edge.relationship}-${edge.to}`}>
                    <Link
                      href={`/workspace/${encodeURIComponent(other.id)}`}
                      className="hover:border-burgundy/40 hover:text-burgundy block rounded-xl border border-neutral-200 px-4 py-2.5 text-sm text-neutral-700 transition-colors dark:border-neutral-800 dark:text-neutral-200"
                    >
                      {outgoing ? (
                        <>
                          {humanize(edge.relationship)} → <span className="font-medium">{other.label}</span>
                        </>
                      ) : (
                        <>
                          <span className="font-medium">{other.label}</span> → {humanize(edge.relationship)}
                        </>
                      )}
                      <span className="ml-2 text-xs text-neutral-400 dark:text-neutral-500">
                        ({humanize(other.type)})
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {timeline && timeline.events.length > 0 && (
          <section>
            <h2 className="mb-3 text-lg font-medium text-neutral-900 dark:text-neutral-100">Timeline</h2>
            <ol className="space-y-3 border-l border-neutral-200 pl-4 dark:border-neutral-800">
              {timeline.events.map((event, index) => (
                <li key={index}>
                  <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                    {event.date} · {event.label}
                  </p>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">{event.description}</p>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </main>
  );
}
