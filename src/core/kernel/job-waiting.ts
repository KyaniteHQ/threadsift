import { type SQL, type SQLWrapper, and, eq, sql } from "drizzle-orm";

import { INTAKE_JOB_KINDS, type WaitReason } from "../contract/job-contract.ts";
import type { Database } from "./database.ts";
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

export function wokenJobs(db: Database, now: number, where: SQL | undefined) {
  return db.update(jobs).set({ nextAttemptAt: now }).where(where);
}

export function wokenJob(db: Database, jobId: number, now: number, when?: Readonly<SQLWrapper>) {
  return wokenJobs(db, now, and(eq(jobs.id, jobId), jobOpen(), when && sql`${when}`));
}
