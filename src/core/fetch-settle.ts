import { eq } from "drizzle-orm";

import type { Database } from "./database.ts";
import type { Concluded, Fetched } from "./details.ts";
import { settledContent } from "./fetch-content.ts";
import { publishFetched } from "./item-publish.ts";
import type { ClaimedJob, JobOutcome, JobPorts } from "./job-outcome.ts";
import { isLastAttempt } from "./job-retry.ts";
import { items } from "./schema.ts";
import { failedFetch, fetchedThread, isRetryable } from "./settle.ts";
import type { StoredThread } from "./stored-thread.ts";

async function titleOf(db: Database, itemId: number): Promise<string | null> {
  const [item] = await db.select({ title: items.title }).from(items).where(eq(items.id, itemId));

  return item?.title ?? null;
}

export async function settledFetch(
  ports: JobPorts,
  job: Readonly<ClaimedJob>,
  fetched: Readonly<Concluded>,
  deadline: AbortSignal,
  suppliedDigest: string | null,
) {
  const title = isRetryable(fetched.status) ? await titleOf(ports.db, job.itemId) : null;

  return publishFetched(
    ports.db,
    job,
    await settledContent(ports, job, fetched, title, deadline, suppliedDigest),
  );
}

export function settledThread(
  ports: JobPorts,
  job: Readonly<ClaimedJob>,
  thread: Readonly<StoredThread>,
  deadline: AbortSignal,
  suppliedDigest: string | null,
) {
  return settledFetch(ports, job, fetchedThread(thread), deadline, suppliedDigest);
}

function rateLimitGaveUp(db: Database, job: Readonly<ClaimedJob>): JobOutcome {
  return { writes: [failedFetch(db, job.itemId, "rate-limited", null)], failedAttempt: true };
}

function waitingOutcome(
  db: Database,
  job: Readonly<ClaimedJob>,
  { until, limited, wait }: Readonly<Extract<Fetched, { status: "waiting" }>>,
): JobOutcome {
  if (limited && isLastAttempt(job.attempts)) return rateLimitGaveUp(db, job);

  return { deferredUntil: until, wait, countsAttempt: limited };
}

export function outcomeOfFetched(
  ports: JobPorts,
  job: Readonly<ClaimedJob>,
  fetched: Readonly<Fetched>,
  deadline: AbortSignal,
): Promise<JobOutcome> | JobOutcome {
  if (fetched.status === "waiting") return waitingOutcome(ports.db, job, fetched);

  return settledFetch(ports, job, fetched, deadline, null);
}
