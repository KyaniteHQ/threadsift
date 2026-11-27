import { type SQL, type SQLWrapper, and, asc, eq, lte, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import {
  GROK_BOT_WAIT,
  INTAKE_JOB_KINDS,
  type OwnedJobKind,
  type WaitReason,
} from "../contract/job-contract.ts";
import type { Database } from "./database.ts";
import { guardedBatch } from "./guards.ts";
import type { JobPorts } from "./job-outcome.ts";
import { enqueueRows } from "./job-rows.ts";
import { jobIs, jobOpen } from "./job-tables.ts";
import { listed } from "./schema-checks.ts";
import { items, jobs } from "./schema.ts";

export function waitingFor(reason?: WaitReason): SQL {
  return reason === undefined
    ? sql`${jobIs("queued")} and ${jobs.waitReason} is not null`
    : sql`${jobIs("queued")} and ${jobs.waitReason} = ${reason}`;
}

const WAITING_JOB = sql`${jobs.itemId} = ${items.id} and ${jobs.kind} in (${listed(INTAKE_JOB_KINDS)}) and ${waitingFor()}`;

export const WAIT_VIEW_COLUMNS = {
  waitReason:
    sql<WaitReason | null>`(select ${jobs.waitReason} from ${jobs} where ${WAITING_JOB})`.as(
      "wait_reason",
    ),
  retryAt: sql<number | null>`(select ${jobs.nextAttemptAt} from ${jobs} where ${WAITING_JOB})`.as(
    "retry_at",
  ),
};

export function wokenJobs(
  db: Database,
  now: number,
  first: SQL,
  ...rest: readonly (SQLWrapper | undefined)[]
) {
  return db
    .update(jobs)
    .set({ nextAttemptAt: now })
    .where(and(first, ...rest));
}

export function wokenJob(db: Database, jobId: number, now: number, when?: Readonly<SQLWrapper>) {
  return wokenJobs(db, now, eq(jobs.id, jobId), jobOpen(), when && sql`${when}`);
}

export function wokenBotWaits(
  db: Database,
  kind: OwnedJobKind,
  itemId: number | Readonly<SQLWrapper>,
  now: number,
) {
  return wokenJobs(
    db,
    now,
    waitingFor(GROK_BOT_WAIT),
    eq(jobs.kind, kind),
    eq(jobs.itemId, itemId),
  );
}

export async function enqueueWoken(
  ports: Readonly<Pick<JobPorts, "db" | "jobs">>,
  now: number,
  where: SQL,
  which: "oldest" | "all",
): Promise<void> {
  const due = ports.db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(where, lte(jobs.nextAttemptAt, now)))
    .orderBy(asc(jobs.id));

  await enqueueRows(ports, await (which === "oldest" ? due.limit(1) : due));
}

export function waitingFetches(reason: WaitReason): SQL {
  return sql`(${eq(jobs.kind, "fetch")} and ${waitingFor(reason)})`;
}

export async function wakeWaitingFetches(
  ports: Readonly<Pick<JobPorts, "db" | "jobs">>,
  reason: WaitReason,
  {
    writes,
    when,
    held = sql`1`,
    now,
  }: Readonly<{
    writes: readonly [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]];
    when?: SQL | undefined;
    held?: SQL | undefined;
    now: number;
  }>,
): Promise<void> {
  const waiting = waitingFetches(reason);
  const written = await guardedBatch(ports.db, held, [
    ...writes,
    wokenJobs(ports.db, now, waiting, when),
  ]);

  if (written) await enqueueWoken(ports, now, waiting, "all");
}
