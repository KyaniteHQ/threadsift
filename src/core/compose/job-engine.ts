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
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";

import { CLAIM_MARGIN_MS, JOB_KINDS } from "../contract/job-contract.ts";
import type { Database } from "../kernel/database.ts";
import { logFailure } from "../kernel/failure-log.ts";
import { type ClaimedRow, type JobPorts, claimedRow } from "../kernel/job-outcome.ts";
import { isSpent, retryDelayMs } from "../kernel/job-retry.ts";
import { ATTEMPT_FILES, hasOpenJob } from "../kernel/job-rows.ts";
import type { InputFact, JobSpec, Specs } from "../kernel/job-spec.ts";
import { jobIs } from "../kernel/job-tables.ts";
import { jobs } from "../kernel/schema.ts";
import { applyOutcome, exhaust, queueLater } from "./job-finish.ts";

function caseOnKind(whens: readonly SQL[]): SQL {
  return sql`case ${jobs.kind} ${sql.join([...whens], sql` `)} end`;
}

function inputValue(input: Readonly<InputFact>, column: SQLiteColumn): SQL {
  return sql`(select ${column} from ${column.table} where ${input.key} = ${jobs.itemId})`;
}

function inputCase(specs: Specs, pick: (input: Readonly<InputFact>) => SQLiteColumn | undefined) {
  const whens = JOB_KINDS.flatMap((kind) => {
    const { input } = specs[kind];
    const column = input === undefined ? undefined : pick(input);

    return input === undefined || column === undefined
      ? []
      : [sql`when ${kind} then ${inputValue(input, column)}`];
  });

  return whens.length === 0 ? sql`null` : caseOnKind(whens);
}

interface Fragments {
  readonly leaseMs: SQL;
  readonly inputVersion: SQL;
  readonly pendingInput: SQL;
}

function fragmentsOf(specs: Specs): Fragments {
  return {
    leaseMs: caseOnKind(
      JOB_KINDS.map((kind) => sql`when ${kind} then ${specs[kind].deadlineMs + CLAIM_MARGIN_MS}`),
    ),
    inputVersion: inputCase(specs, ({ version }) => version),
    pendingInput: inputCase(specs, ({ pending }) => pending),
  };
}

function isDue(specs: Specs, now: number) {
  return and(
    or(
      and(jobIs("queued"), lte(jobs.nextAttemptAt, now)),
      and(jobIs("running"), lt(jobs.claimExpires, now)),
    ),
    or(
      ...JOB_KINDS.map((kind) =>
        and(
          eq(jobs.kind, kind),
          ...specs[kind].blockedBy.map((blocker) =>
            notExists(hasOpenJob(blocker, sql`${jobs.itemId}`)),
          ),
        ),
      ),
    ),
  );
}

function dueIds(specs: Specs, db: Database, now: number, limit: number) {
  return db
    .select({ id: jobs.id })
    .from(jobs)
    .where(isDue(specs, now))
    .orderBy(asc(jobs.nextAttemptAt), asc(jobs.id))
    .limit(limit);
}

async function claim(
  specs: Specs,
  { leaseMs, inputVersion, pendingInput }: Readonly<Fragments>,
  db: Database,
  which: (now: number) => SQL,
): Promise<ClaimedRow | null> {
  const now = Date.now();

  const [claimed] = await db
    .update(jobs)
    .set({
      state: "running",
      claimExpires: sql`${now} + ${leaseMs}`,
      attempts: sql`case when ${jobs.attemptGeneration} <> ${inputVersion} then 0 else ${jobs.attempts} + (${jobIs("running")}) end`,
      attemptGeneration: inputVersion,
      attemptPending: pendingInput,
      waitReason: null,
    })
    .where(and(which(now), isDue(specs, now)))
    .returning({
      ...getTableColumns(jobs),
      attemptKey: sql<string | null>`${ATTEMPT_FILES.postText}`,
      imagePrefix: sql<string | null>`${ATTEMPT_FILES.imagePrefix}`,
    });

  return claimed === undefined ? null : claimedRow(claimed);
}

async function attempted(
  ports: JobPorts,
  job: Readonly<ClaimedRow>,
  spec: Readonly<JobSpec>,
): Promise<void> {
  if (isSpent(job.attempts)) {
    await exhaust(ports, job, spec, job.attempts);

    return;
  }

  try {
    await applyOutcome(ports, job, await spec.attempt(ports, job), spec);
  } catch (error) {
    logFailure(
      "job-attempt-failed",
      { jobId: job.id, kind: job.kind, attempt: job.attempts + 1 },
      error,
    );
    const delayMs = retryDelayMs(job.attempts);

    await (delayMs === undefined
      ? exhaust(ports, job, spec, job.attempts + 1)
      : queueLater(ports, job, {
          until: Date.now() + delayMs,
          attempts: job.attempts + 1,
          staleRequeues: 0,
          wait: null,
          closing: spec,
        }));
  }
}

export function jobEngine(specs: Specs) {
  const fragments = fragmentsOf(specs);

  return {
    claimDue: (db: Database, jobId?: number) =>
      claim(specs, fragments, db, (now) =>
        jobId === undefined ? inArray(jobs.id, dueIds(specs, db, now, 1)) : eq(jobs.id, jobId),
      ),
    executeClaimed: (ports: JobPorts, job: Readonly<ClaimedRow>) =>
      attempted(ports, job, specs[job.kind]),
    dueIds: (db: Database, now: number, limit: number) => dueIds(specs, db, now, limit),
  };
}
