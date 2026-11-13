import { type SQL, type SQLWrapper, and, eq, sql } from "drizzle-orm";

import { guardHolds, guardedWrite } from "./guards.ts";
import { anchoredOutcome } from "./highlight-publish.ts";
import type { AnchoredOutcome, JobWrites } from "./job-outcome.ts";
import type { Database } from "./ports.ts";
import type { ParsedThread } from "./reddit-json.ts";
import { awaitsThread } from "./reddit-thread.ts";
import { items } from "./schema.ts";
import { type ThreadPlace, threadItemInsert, threadPublication } from "./thread-publish.ts";

export interface Binding {
  readonly holds: Readonly<SQLWrapper>;
  readonly writes: JobWrites;
}

interface Conditions {
  readonly fillOnly: boolean;
  readonly binding: Readonly<Binding> | undefined;
}

function requirementOf(
  place: Readonly<ThreadPlace>,
  { fillOnly, binding }: Readonly<Conditions>,
): SQL | undefined {
  return and(fillOnly ? awaitsThread(place.normalizedUrl) : undefined, binding?.holds);
}

async function commit(
  db: Database,
  place: Readonly<ThreadPlace>,
  { writes, precondition }: Readonly<AnchoredOutcome>,
  conditions: Readonly<Conditions>,
): Promise<boolean | null> {
  const required = requirementOf(place, conditions);

  const holds =
    required === undefined ? precondition.holds : sql`(${precondition.holds}) and (${required})`;

  const inserted = await guardedWrite(db, holds, threadItemInsert(db, place), [
    ...writes,
    ...(conditions.binding?.writes ?? []),
  ]);

  if (inserted !== null) return inserted.length > 0;

  if (required !== undefined && !(await guardHolds(db, required))) return null;

  return commit(db, place, await precondition.rebuild(), conditions);
}

export async function publishThread(
  db: Database,
  place: Readonly<ThreadPlace>,
  thread: Readonly<ParsedThread>,
  {
    pendingDigest,
    fillOnly,
    binding,
  }: Readonly<{ pendingDigest: string | null; fillOnly: boolean; binding?: Readonly<Binding> }>,
): Promise<boolean | null> {
  const publication = await anchoredOutcome(
    db,
    { writes: threadPublication(db, place, thread, pendingDigest) },
    {
      owner: eq(items.normalizedUrl, place.normalizedUrl),
      displayed: ({ threaded }) => ({
        post: thread.postText,
        comments: threaded ? undefined : thread.nodes,
      }),
    },
  );

  return commit(db, place, publication, { fillOnly, binding });
}
