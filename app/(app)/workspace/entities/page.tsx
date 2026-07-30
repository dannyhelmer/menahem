import Link from "next/link";
import { listAllEntities } from "@/lib/graph/store";
import { humanize } from "@/lib/graph/humanize";
import type { EntityType, GraphEntity } from "@/lib/graph/types";

function groupByType(entities: GraphEntity[]): [EntityType, GraphEntity[]][] {
  const groups = new Map<EntityType, GraphEntity[]>();
  for (const entity of entities) {
    const list = groups.get(entity.type) ?? [];
    list.push(entity);
    groups.set(entity.type, list);
  }
  return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
}

export default async function WorkspaceEntitiesPage() {
  const entities = await listAllEntities();
  const groups = groupByType(entities);

  return (
    <main className="flex-1 overflow-y-auto px-6 py-10">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/workspace"
          className="hover:text-burgundy mb-8 inline-block text-sm text-neutral-500 dark:text-neutral-400"
        >
          ← Back to workspace
        </Link>

        <h1 className="mb-2 text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
          All Entities
        </h1>
        <p className="mb-8 text-sm text-neutral-500 dark:text-neutral-400">
          Bills, representatives, and candidates Menahem has looked up, with their real connections and history.
        </p>

        {groups.length === 0 ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Nothing here yet. Entities fill in automatically when you ask Menahem about a bill, representative, or
            candidate (via Congress.gov or FEC, configured in Settings).
          </p>
        ) : (
          <div className="space-y-8">
            {groups.map(([type, items]) => (
              <section key={type}>
                <h2 className="mb-3 text-lg font-medium text-neutral-900 dark:text-neutral-100">
                  {humanize(type)}
                </h2>
                <ul className="space-y-1.5">
                  {items.map((entity) => (
                    <li key={entity.id}>
                      <Link
                        href={`/workspace/${encodeURIComponent(entity.id)}`}
                        className="hover:border-burgundy/40 hover:text-burgundy block rounded-xl border border-neutral-200 px-4 py-2.5 text-sm text-neutral-700 transition-colors dark:border-neutral-800 dark:text-neutral-200"
                      >
                        {entity.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
