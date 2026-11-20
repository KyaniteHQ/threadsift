import { eq, sql } from "drizzle-orm";

import type { Database } from "./database.ts";
import type { Concluded, Fetched } from "./details.ts";
import { digestAfterFetch } from "./digest-opening.ts";
import { settledContent } from "./fetch-content.ts";
import { anchoredOutcome, displayedBesideThread } from "./highlight-publish.ts";
import type { ClaimedJob, JobOutcome, JobPorts, SettledOutcome } from "./job-outcome.ts";
import { isLastAttempt } from "./job-retry.ts";
import { items } from "./schema.ts";
import { fetchedPartWrites } from "./search.ts";
import { failedFetch, isRetryable } from "./settle.ts";
import { queueVaultItems } from "./vault-queue.ts";
import { queueVaultFetchedTitle } from "./vault-wiki-writes.ts";

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
  const item = eq(items.id, job.itemId);

  const { postText, replaces, thread, fields, publication, files } = await settledContent(
    ports,
    job,
    fetched,
    title,
    deadline,
  );

  const storesText = (postText !== undefined && postText !== null) || thread !== null;

  const columns = {
    ...fields,
    pendingDigest: storesText ? (suppliedDigest ?? items.pendingDigest) : null,
    generation: replaces ? sql`${items.generation} + 1` : items.generation,
  };

  const outcome: SettledOutcome = {
    writes: [
      ...(fields.title === undefined ? [] : queueVaultFetchedTitle(ports.db, item, fields.title)),
      ports.db.update(items).set(columns).where(item),
      ...(fields.title === undefined ? [] : fetchedPartWrites(ports.db, item, postText)),
      ...publication,
      ...(replaces ? digestAfterFetch(ports.db, job) : []),
      ...(fetched.status === "ok" ? [queueVaultItems(ports.db, item)] : []),
    ],
    files,
  };

  return replaces
    ? anchoredOutcome(ports.db, outcome, {
        owner: item,
        displayed: displayedBesideThread({ post: postText, comments: thread?.nodes }),
      })
    : outcome;
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
