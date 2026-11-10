import { eq, sql } from "drizzle-orm";

import { anchoredOutcome } from "./highlight-publish.ts";
import type { AnchoredOutcome } from "./job-outcome.ts";
import type { Database } from "./ports.ts";
import type { ParsedThread } from "./reddit-json.ts";
import { awaitsThread } from "./reddit-thread.ts";
import { guardHolds, guardedWrite, items } from "./schema.ts";
import { type ThreadPlace, threadItemInsert, threadPublication } from "./thread-publish.ts";

async function commit(
  db: Database,
  place: Readonly<ThreadPlace>,
  { writes, precondition }: Readonly<AnchoredOutcome>,
  fillOnly: boolean,
): Promise<boolean | null> {
  const only = fillOnly ? awaitsThread(place.normalizedUrl) : undefined;

  const holds =
    only === undefined ? precondition.holds : sql`(${precondition.holds}) and (${only})`;

  const inserted = await guardedWrite(db, holds, threadItemInsert(db, place), writes);

  if (inserted !== null) return inserted.length > 0;

  if (only !== undefined && !(await guardHolds(db, only))) return null;

  return commit(db, place, await precondition.rebuild(), fillOnly);
}

export async function publishThread(
  db: Database,
  place: Readonly<ThreadPlace>,
  thread: Readonly<ParsedThread>,
  { pendingDigest, fillOnly }: Readonly<{ pendingDigest: string | null; fillOnly: boolean }>,
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

  return commit(db, place, publication, fillOnly);
}
