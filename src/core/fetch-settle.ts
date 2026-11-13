import { eq, sql } from "drizzle-orm";

import type { Concluded } from "./details.ts";
import { digestAfterFetch } from "./digest-job.ts";
import { settledContent } from "./fetch-content.ts";
import { anchoredOutcome } from "./highlight-publish.ts";
import type { ClaimedJob, JobPorts, SettledOutcome } from "./job-outcome.ts";
import { items } from "./schema.ts";
import { fetchedPartWrites } from "./search.ts";
import { isRetryable } from "./settle.ts";

async function titleOf(db: JobPorts["db"], itemId: number): Promise<string | null> {
  const [item] = await db.select({ title: items.title }).from(items).where(eq(items.id, itemId));

  return item?.title ?? null;
}

export async function settledFetch(
  ports: JobPorts,
  job: Readonly<ClaimedJob>,
  fetched: Readonly<Concluded>,
  deadline: AbortSignal,
) {
  const title = isRetryable(fetched.status) ? await titleOf(ports.db, job.itemId) : null;

  const { postText, replaces, thread, fields, contentPublication, mediaPublication, files } =
    await settledContent(ports, job, fetched, title, deadline);

  const storesText = (postText !== undefined && postText !== null) || thread !== null;

  const columns = {
    ...fields,
    pendingDigest: storesText ? items.pendingDigest : null,
    generation: replaces ? sql`${items.generation} + 1` : items.generation,
  };

  const outcome: SettledOutcome = {
    writes: [
      ports.db.update(items).set(columns).where(eq(items.id, job.itemId)),
      ...(fields.title === undefined
        ? []
        : fetchedPartWrites(ports.db, eq(items.id, job.itemId), postText)),
      ...contentPublication,
      ...mediaPublication,
      ...(replaces ? digestAfterFetch(ports.db, job) : []),
    ],
    files,
  };

  return replaces
    ? anchoredOutcome(ports.db, outcome, {
        owner: eq(items.id, job.itemId),
        displayed: () => ({ post: postText, comments: thread?.nodes }),
      })
    : outcome;
}
