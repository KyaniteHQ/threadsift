import {
  type SQL,
  and,
  asc,
  eq,
  getTableColumns,
  inArray,
  lt,
  lte,
  notExists,
  or,
  sql,
} from "drizzle-orm";

import { logFailure } from "./failure-log.ts";
import { applyOutcome, exhaust, queueLater } from "./job-finish.ts";
import { HANDLERS } from "./job-handlers.ts";
import { type ClaimedJob, type JobPorts, RETRY_DELAYS_MS } from "./job-outcome.ts";
import { hasOpenJob } from "./job-rows.ts";
import { JOB_KINDS } from "./kinds.ts";
import type { Database } from "./ports.ts";
import { ATTEMPT_IMAGES, ATTEMPT_KEY, items, jobs } from "./schema.ts";

const CLAIM_MARGIN_MS = 120_000;
const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;

const LEASE_MS = sql.join(
  JOB_KINDS.map((kind) => sql`when ${kind} then ${HANDLERS[kind].deadlineMs + CLAIM_MARGIN_MS}`),
  sql` `,
);

function isDue(now: number) {
  return and(
    or(
      and(eq(jobs.state, "queued"), lte(jobs.nextAttemptAt, now)),
      and(eq(jobs.state, "running"), lt(jobs.claimExpires, now)),
    ),
    or(
      ...JOB_KINDS.map((kind) =>
        and(
          eq(jobs.kind, kind),
          ...HANDLERS[kind].blockedBy.map((blocker) =>
            notExists(hasOpenJob(blocker, sql`${jobs.itemId}`)),
          ),
        ),
      ),
    ),
  );
}

export function dueIds(db: Database, now: number, limit: number) {
  return db
    .select({ id: jobs.id })
    .from(jobs)
    .where(isDue(now))
    .orderBy(asc(jobs.nextAttemptAt), asc(jobs.id))
    .limit(limit);
}

const ITEM_GENERATION = sql`(select ${items.generation} from ${items} where ${items.id} = ${jobs.itemId})`;

async function claim(db: Database, which: () => SQL, now: number): Promise<ClaimedJob | null> {
  const [claimed] = await db
    .update(jobs)
    .set({
      state: "running",
      claimExpires: sql`${now} + case ${jobs.kind} ${LEASE_MS} end`,
      attempts: sql`case when ${jobs.kind} = 'digest' and ${jobs.attemptGeneration} <> ${ITEM_GENERATION} then 0 else ${jobs.attempts} + (${jobs.state} = 'running') end`,
      attemptGeneration: sql`case when ${jobs.kind} = 'digest' then ${ITEM_GENERATION} else ${jobs.attemptGeneration} end`,
      waitReason: null,
    })
    .where(and(which(), isDue(now)))
    .returning({
      ...getTableColumns(jobs),
      attemptKey: ATTEMPT_KEY,
      imagePrefix: ATTEMPT_IMAGES,
    });

  return claimed ?? null;
}

export function claimNextDue(db: Database): Promise<ClaimedJob | null> {
  const now = Date.now();

  return claim(db, () => inArray(jobs.id, dueIds(db, now, 1)), now);
}

export async function executeClaimed(ports: JobPorts, job: Readonly<ClaimedJob>): Promise<void> {
  const handler = HANDLERS[job.kind];

  if (job.attempts >= MAX_ATTEMPTS) {
    await exhaust(ports, job, handler, job.attempts);

    return;
  }

  try {
    await applyOutcome(ports, job, await handler.attempt(ports, job));
  } catch (error) {
    logFailure(
      "job-attempt-failed",
      { jobId: job.id, kind: job.kind, attempt: job.attempts + 1 },
      error,
    );
    const delayMs = RETRY_DELAYS_MS[job.attempts];

    await (delayMs === undefined
      ? exhaust(ports, job, handler, job.attempts + 1)
      : queueLater(ports, job, {
          until: Date.now() + delayMs,
          attempts: job.attempts + 1,
          staleRequeues: 0,
          wait: null,
        }));
  }
}

export async function runJob(ports: JobPorts, id: number): Promise<void> {
  const job = await claim(ports.db, () => eq(jobs.id, id), Date.now());

  if (job !== null) {
    await executeClaimed(ports, job);
  }
}

export async function abandonRunning(db: Database): Promise<void> {
  await db.update(jobs).set({ claimExpires: 0 }).where(eq(jobs.state, "running"));
}
