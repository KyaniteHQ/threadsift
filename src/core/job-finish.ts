import { type SQL, and, eq, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { bestEffort, databaseCodeOf, logFailure, readOrAssume, report } from "./failure-log.ts";
import { deleteQuietly, unnamed } from "./file-cleanup.ts";
import { closeJob, discardTask } from "./job-close.ts";
import {
  MAX_STALE_REQUEUES,
  STALE_DELAYS_MS,
  type JobClosing,
  type JobFiles,
  type ClaimedRow,
  type JobHandler,
  type JobWrites,
  NO_CLOSING,
  NO_FILES,
  type JobOutcome,
  type JobPorts,
  type Precondition,
  type SettledOutcome,
} from "./job-outcome.ts";
import { enqueueItemJobs, enqueueQuietly, holding } from "./job-rows.ts";
import type { WaitReason } from "./kinds.ts";
import type { Database } from "./ports.ts";
import { type JobRow, aiTasks, guardHolds, guardedBatch, jobs } from "./schema.ts";

function writeWhileHolding(
  db: Database,
  job: Readonly<JobRow>,
  writes: readonly BatchItem<"sqlite">[],
  precondition?: Readonly<Precondition>,
) {
  return guardedBatch(db, and(holding(job), precondition?.holds) ?? holding(job), writes);
}

function logClaimLost(job: Readonly<Pick<JobRow, "id" | "attempts">>): void {
  report("job-claim-lost", { jobId: job.id, attempt: job.attempts });
}

export async function finish<Claimed extends ClaimedRow>(
  ports: JobPorts,
  job: Readonly<Claimed>,
  {
    writes,
    attempts,
    files = NO_FILES,
    precondition,
    continuation = [],
    closing = NO_CLOSING,
  }: Readonly<{
    writes: readonly BatchItem<"sqlite">[];
    attempts: number;
    files?: JobFiles | undefined;
    precondition?: Readonly<Precondition> | undefined;
    continuation?: readonly BatchItem<"sqlite">[] | undefined;
    closing?: JobClosing<Claimed> | undefined;
  }>,
): Promise<"done" | "lost" | Readonly<Precondition>> {
  const { db } = ports;

  const wrote = await writeWhileHolding(
    db,
    job,
    [
      ...writes,
      ...closeJob(db, job, attempts),
      ...(closing.closing?.(db, job, { kind: "closed" }) ?? []),
      ...continuation,
    ],
    precondition,
  );

  if (!wrote && precondition !== undefined && (await guardHolds(db, holding(job)))) {
    return precondition;
  }

  await afterClose(ports, job, wrote, files, closing);

  return wrote ? "done" : "lost";
}

async function afterClose<Claimed extends ClaimedRow>(
  ports: JobPorts,
  job: Readonly<Claimed>,
  wrote: boolean,
  files: JobFiles,
  closing: JobClosing<Claimed>,
): Promise<void> {
  if (job.itemId !== null) await enqueueItemJobs(ports, job.itemId);

  await closing.afterClosed?.(ports, job, wrote);

  await (wrote
    ? deleteQuietly(ports, files.superseded)
    : deleteQuietly(ports, files.written, (keys) => unnamed(ports, keys)));

  if (!wrote) logClaimLost(job);
}

export async function exhaust<Claimed extends ClaimedRow>(
  ports: JobPorts,
  job: Readonly<Claimed>,
  handler: Pick<JobHandler<Claimed>, "exhausted" | "inputCurrent" | "closing" | "afterClosed">,
  attempts: number,
): Promise<void> {
  const { db } = ports;
  const sameInput = handler.inputCurrent?.(job);

  const wrote = await guardedBatch(db, and(holding(job), sameInput) ?? holding(job), [
    ...(handler.exhausted?.(db, job) ?? []),
    ...closeJob(db, job, attempts),
    ...(handler.closing?.(db, job, { kind: "closed" }) ?? []),
  ]);

  if (!wrote && sameInput !== undefined && (await guardHolds(db, holding(job)))) {
    await queueLater(ports, job, {
      until: Date.now(),
      attempts: job.attempts,
      staleRequeues: 0,
      wait: null,
      closing: handler,
    });

    return;
  }

  await afterClose(ports, job, wrote, NO_FILES, handler);
}

function dueAt(until: number, closedTask: number | undefined): number | SQL {
  if (closedTask === undefined) return until;

  const now = Date.now();

  return sql`case when exists (select 1 from ${aiTasks} where ${aiTasks.id} = ${closedTask} and (${aiTasks.answeredAt} is not null or ${aiTasks.state} <> 'running')) then ${now} else min(${until}, coalesce((select ${aiTasks.deadline} from ${aiTasks} where ${aiTasks.id} = ${closedTask}), ${until})) end`;
}

export async function queueLater<Claimed extends ClaimedRow>(
  ports: JobPorts,
  job: Readonly<Claimed>,
  {
    until,
    attempts,
    staleRequeues,
    wait,
    unlessOpen,
    writes = [],
    closing = NO_CLOSING,
  }: Readonly<{
    until: number;
    attempts: number;
    staleRequeues: number;
    wait: WaitReason | null;
    unlessOpen?: number | undefined;
    writes?: JobWrites | undefined;
    closing?: JobClosing<Claimed> | undefined;
  }>,
): Promise<void> {
  const wrote = await writeWhileHolding(ports.db, job, [
    ...writes,
    ports.db
      .update(jobs)
      .set({
        state: "queued",
        attempts,
        staleRequeues,
        nextAttemptAt: dueAt(until, unlessOpen),
        claimExpires: null,
        waitReason: wait,
      })
      .where(eq(jobs.id, job.id)),
    ...(closing.closing?.(ports.db, job, { kind: "deferred", wait }) ?? []),
  ]);

  if (wrote) {
    const [due] = await ports.db
      .select({ at: jobs.nextAttemptAt })
      .from(jobs)
      .where(eq(jobs.id, job.id));

    await enqueueQuietly(ports, [job.id], Math.max(0, (due?.at ?? until) - Date.now()));
  } else {
    logClaimLost(job);
    await closing.afterClosed?.(ports, job, false);
  }
}

async function writeOutcome<Claimed extends ClaimedRow>(
  ports: JobPorts,
  job: Readonly<Claimed>,
  outcome: SettledOutcome,
  closing: JobClosing<Claimed>,
): Promise<"done" | "lost" | "stale"> {
  let result: Awaited<ReturnType<typeof finish>>;

  try {
    result = await finish(ports, job, {
      writes: outcome.writes,
      attempts: job.attempts + (outcome.failedAttempt === true ? 1 : 0),
      files: outcome.files,
      precondition: outcome.precondition,
      continuation: outcome.continuation,
      closing,
    });
  } catch (error) {
    const state = await readOrAssume(
      true,
      { event: "job-currency-read-failed", fields: { jobId: job.id, kind: job.kind } },
      async () => (await outcome.currency?.current()) ?? true,
    );

    if (state) throw error;

    return "stale";
  }

  if (result === "done" || result === "lost") return result;

  return writeOutcome(ports, job, await result.rebuild(), closing);
}

async function applySettled<Claimed extends ClaimedRow>(
  ports: JobPorts,
  job: Readonly<Claimed>,
  outcome: SettledOutcome,
  closing: JobClosing<Claimed>,
): Promise<void> {
  let result: Awaited<ReturnType<typeof writeOutcome>>;

  try {
    result = await writeOutcome(ports, job, outcome, closing);
  } catch (error) {
    logFailure(
      "job-write-failed",
      { jobId: job.id, kind: job.kind, databaseCode: databaseCodeOf(error) },
      error,
    );
    await bestEffort(
      { event: "job-task-not-discarded", fields: { jobId: job.id, kind: job.kind } },
      () => discardTask(ports.db, outcome.currency, "error"),
    );
    throw error;
  }

  switch (result) {
    case "done":
      break;
    case "lost":
      await discardTask(ports.db, outcome.currency, "lease-lost");
      break;
    case "stale": {
      await discardTask(ports.db, outcome.currency, "stale");
      const staleRequeues = Math.min(job.staleRequeues + 1, MAX_STALE_REQUEUES);
      await queueLater(ports, job, {
        until: Date.now() + (STALE_DELAYS_MS[job.staleRequeues] ?? STALE_DELAYS_MS[2]),
        attempts: job.attempts,
        staleRequeues,
        wait: null,
        closing,
      });
      break;
    }

    default: {
      const exhaustive: never = result;
      throw new Error(exhaustive);
    }
  }
}

export async function applyOutcome<Claimed extends ClaimedRow>(
  ports: JobPorts,
  job: Readonly<Claimed>,
  outcome: JobOutcome,
  closing: JobClosing<Claimed> = NO_CLOSING,
): Promise<void> {
  if ("deferredUntil" in outcome) {
    await queueLater(ports, job, {
      until: outcome.deferredUntil,
      attempts: job.attempts + (outcome.countsAttempt ? 1 : 0),
      staleRequeues: job.staleRequeues,
      wait: outcome.wait,
      unlessOpen: outcome.unlessOpen,
      writes: outcome.writes,
      closing,
    });

    return;
  }

  await applySettled(ports, job, outcome, closing);
}
