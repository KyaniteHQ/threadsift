import { eq, sql } from "drizzle-orm";

import { digestAfterFetch } from "./digest-job.ts";
import { settledContent } from "./fetch-content.ts";
import { FETCH_DEADLINE_MS, fetchedForJob } from "./fetch-link.ts";
import { anchoredOutcome } from "./highlight-publish.ts";
import {
  type ClaimedJob,
  type JobHandler,
  type JobOutcome,
  type JobPorts,
  type SettledOutcome,
  isLastAttempt,
} from "./job-outcome.ts";
import { fetchedRepository, repositoryWrites } from "./repositories.ts";
import { items } from "./schema.ts";
import { fetchedPartWrites } from "./search.ts";
import { isRetryable } from "./settle.ts";

async function titleOf(db: JobPorts["db"], itemId: number): Promise<string | null> {
  const [item] = await db.select({ title: items.title }).from(items).where(eq(items.id, itemId));

  return item?.title ?? null;
}

function rateLimitGaveUp(db: JobPorts["db"], job: Readonly<ClaimedJob>): JobOutcome {
  return {
    writes: [
      db
        .update(items)
        .set({ status: "failed", reason: "rate-limited", pendingDigest: null })
        .where(eq(items.id, job.itemId)),
    ],
    failedAttempt: true,
  };
}

function waitingOutcome(
  db: JobPorts["db"],
  job: Readonly<ClaimedJob>,
  { until, limited }: Readonly<{ until: number; limited: boolean }>,
): JobOutcome {
  if (limited && isLastAttempt(job.attempts)) return rateLimitGaveUp(db, job);

  return { deferredUntil: until, wait: "github-rate-limit", countsAttempt: limited };
}

async function attemptFetch(ports: JobPorts, job: Readonly<ClaimedJob>): Promise<JobOutcome> {
  const deadline = AbortSignal.timeout(FETCH_DEADLINE_MS);
  const fetched = await fetchedForJob(ports, job, deadline);

  if (fetched.status === "waiting") return waitingOutcome(ports.db, job, fetched);

  const title = isRetryable(fetched.status) ? await titleOf(ports.db, job.itemId) : null;
  const repository = fetchedRepository(fetched);

  const { postText, replaces, fields, mediaPublication, files } = await settledContent(
    ports,
    job,
    fetched,
    title,
    deadline,
  );

  const storesText = postText !== undefined && postText !== null;

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
      ...(repository === null ? [] : repositoryWrites(ports.db, job.itemId, repository)),
      ...mediaPublication,
      ...(replaces ? digestAfterFetch(ports.db, job) : []),
    ],
    files,
  };

  return replaces
    ? anchoredOutcome(ports.db, outcome, {
        owner: eq(items.id, job.itemId),
        displayed: () => ({ post: postText }),
      })
    : outcome;
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
