import { eq, sql } from "drizzle-orm";

import { anchoredOutcome } from "./highlight-publish.ts";
import type { AnchoredOutcome } from "./job-outcome.ts";
import type { Database } from "./ports.ts";
import type { ParsedThread } from "./reddit-json.ts";
import { hasNoThread } from "./reddit-thread.ts";
import { guardHolds, guardedWrite, items } from "./schema.ts";
import { type ThreadPlace, threadItemInsert, threadPublication } from "./thread-publish.ts";

export type Replacement = "any" | "no-thread";

async function commit(
  db: Database,
  place: Readonly<ThreadPlace>,
  replacement: Replacement,
  { writes, precondition }: Readonly<AnchoredOutcome>,
): Promise<boolean | null> {
  const unthreaded = hasNoThread(place.normalizedUrl);

  const holds =
    replacement === "any" ? precondition.holds : sql`${precondition.holds} and ${unthreaded}`;

  const inserted = await guardedWrite(db, holds, threadItemInsert(db, place), writes);

  if (inserted !== null) return inserted.length > 0;

  if (replacement === "no-thread" && !(await guardHolds(db, unthreaded))) return null;

  return commit(db, place, replacement, await precondition.rebuild());
}

export async function publishThread(
  db: Database,
  place: Readonly<ThreadPlace>,
  thread: Readonly<ParsedThread>,
  {
    pendingDigest,
    replacement,
  }: Readonly<{ pendingDigest: string | null; replacement: Replacement }>,
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

  return commit(db, place, replacement, publication);
}
