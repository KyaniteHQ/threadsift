import { eq, sql } from "drizzle-orm";

import { digestAfterFetch } from "./digest-job.ts";
import { FETCH_DEADLINE_MS, fetchLink } from "./fetch-link.ts";
import type { ClaimedJob, JobOutcome, JobHandler, JobPorts } from "./job-outcome.ts";
import type { Database } from "./ports.ts";
import { placePostText } from "./post-text-files.ts";
import { fetchedRepository, repositoryWrites } from "./repositories.ts";
import { items } from "./schema.ts";
import { fetchedPartWrites } from "./search.ts";
import { isRetryable, settle } from "./settle.ts";

async function titleOf(db: Database, itemId: number): Promise<string | null> {
  const [item] = await db.select({ title: items.title }).from(items).where(eq(items.id, itemId));

  return item?.title ?? null;
}

async function attemptFetch(ports: JobPorts, job: Readonly<ClaimedJob>): Promise<JobOutcome> {
  const fetched = await fetchLink(ports.network, ports.pages, job.address);
  const title = isRetryable(fetched.status) ? await titleOf(ports.db, job.itemId) : null;
  const repository = fetchedRepository(fetched);

  const { postText, ...settled } = settle(fetched, title, Date.now());
  const placed = await placePostText(ports, job, postText);
  const fields = { ...settled, ...placed.columns };
  const replacesContent = postText !== undefined;
  const storesText = postText !== undefined && postText !== null;

  const stored = {
    ...fields,
    pendingDigest: storesText ? items.pendingDigest : null,
    generation: replacesContent ? sql`${items.generation} + 1` : items.generation,
  };

  return {
    writes: [
      ports.db.update(items).set(stored).where(eq(items.id, job.itemId)),
      ...(fields.title === undefined
        ? []
        : fetchedPartWrites(ports.db, eq(items.id, job.itemId), postText)),
      ...(repository === null ? [] : repositoryWrites(ports.db, job.itemId, repository)),
      ...(replacesContent ? digestAfterFetch(ports.db, job) : []),
    ],
    files: placed.files,
  };
}

export const fetchHandler: JobHandler = {
  deadlineMs: FETCH_DEADLINE_MS,
  blockedBy: [],
  attempt: attemptFetch,
  exhausted: (db, job) => [
    db
      .update(items)
      .set({ status: "failed", reason: "gave-up", pendingDigest: null })
      .where(eq(items.id, job.itemId)),
  ],
};
