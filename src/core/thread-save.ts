import { eq } from "drizzle-orm";

import { anchoredOutcome } from "./highlight-publish.ts";
import type { AnchoredOutcome } from "./job-outcome.ts";
import type { Database } from "./ports.ts";
import type { ParsedThread } from "./reddit-json.ts";
import { guardedWrite, items } from "./schema.ts";
import { type ThreadPlace, threadItemInsert, threadPublication } from "./thread-publish.ts";

async function commit(
  db: Database,
  place: Readonly<ThreadPlace>,
  { writes, precondition }: Readonly<AnchoredOutcome>,
): Promise<boolean> {
  const inserted = await guardedWrite(db, precondition.holds, threadItemInsert(db, place), writes);

  return inserted === null ? commit(db, place, await precondition.rebuild()) : inserted.length > 0;
}

export async function publishThread(
  db: Database,
  place: Readonly<ThreadPlace>,
  thread: Readonly<ParsedThread>,
  pendingDigest: string | null,
): Promise<boolean> {
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

  return commit(db, place, publication);
}
