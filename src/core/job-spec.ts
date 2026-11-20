import { type SQLWrapper, sql } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";

import type { Database } from "./database.ts";
import type { JobKind, OwnedJobKind, UnownedJobKind } from "./job-contract.ts";
import type {
  Closing,
  ClaimedJob,
  ClaimedRow,
  ClaimedUnowned,
  JobClosing,
  JobOutcome,
  JobPorts,
  JobWrites,
} from "./job-outcome.ts";
import { enqueueRunJobs, unownedOwnerId } from "./job-rows.ts";

export interface InputFact {
  readonly key: SQLiteColumn;
  readonly version: SQLiteColumn;
  readonly pending?: SQLiteColumn;
}

export interface ItemDeclaration {
  readonly deadlineMs: number;
  readonly attempt: (ports: JobPorts, job: Readonly<ClaimedJob>) => Promise<JobOutcome>;
  readonly blockedBy?: readonly JobKind[];
  readonly input?: InputFact;
  readonly exhausted?: (db: Database, job: Readonly<ClaimedJob>) => JobWrites;
  readonly closing?: (db: Database, job: Readonly<ClaimedJob>, how: Closing) => JobWrites;
  readonly afterClosed?: (
    ports: JobPorts,
    job: Readonly<ClaimedJob>,
    closed: boolean,
  ) => Promise<void>;
}

export interface UnownedDeclaration<Kind extends UnownedJobKind> {
  readonly deadlineMs: number;
  readonly attempt: (ports: JobPorts, job: Readonly<ClaimedUnowned<Kind>>) => Promise<JobOutcome>;
  readonly exhausted?: (db: Database, runId: number) => JobWrites;
}

export interface JobSpec<Kind extends JobKind = JobKind> extends JobClosing {
  readonly kind: Kind;
  readonly deadlineMs: number;
  readonly blockedBy: readonly JobKind[];
  readonly input?: InputFact | undefined;
  readonly attempt: (ports: JobPorts, job: Readonly<ClaimedRow>) => Promise<JobOutcome>;
  readonly exhausted?: ((db: Database, job: Readonly<ClaimedRow>) => JobWrites) | undefined;
  readonly inputCurrent?: ((job: Readonly<ClaimedRow>) => SQLWrapper) | undefined;
}

export type Specs = { readonly [Kind in JobKind]: JobSpec<Kind> };

function itemClaim(job: Readonly<ClaimedRow>): Readonly<ClaimedJob> {
  if (job.itemId === null) {
    throw new Error(`Job ${String(job.id)} of kind ${job.kind} is not owned by an Item`);
  }

  return job;
}

function isUnownedClaim<Kind extends UnownedJobKind>(
  kind: Kind,
  job: Readonly<ClaimedRow>,
): job is Readonly<ClaimedRow> & ClaimedUnowned<Kind> {
  return job.kind === kind;
}

function unownedClaim<Kind extends UnownedJobKind>(
  kind: Kind,
  job: Readonly<ClaimedRow>,
): Readonly<ClaimedUnowned<Kind>> {
  if (!isUnownedClaim(kind, job)) {
    throw new Error(`Job ${String(job.id)} of kind ${job.kind} is not a ${kind} job`);
  }

  return job;
}

function inputHolds(input: Readonly<InputFact>, job: Readonly<ClaimedJob>) {
  return sql`exists (select 1 from ${input.key.table} where ${input.key} = ${job.itemId} and ${input.version} is ${job.attemptGeneration})`;
}

export function defineJob<Kind extends OwnedJobKind>(
  kind: Kind,
  { deadlineMs, attempt, blockedBy = [], input, exhausted, closing, afterClosed }: ItemDeclaration,
): JobSpec<Kind> {
  return {
    kind,
    deadlineMs,
    blockedBy,
    input,
    attempt: (ports, job) => attempt(ports, itemClaim(job)),
    exhausted: exhausted === undefined ? undefined : (db, job) => exhausted(db, itemClaim(job)),
    closing: closing === undefined ? undefined : (db, job, how) => closing(db, itemClaim(job), how),
    afterClosed:
      afterClosed === undefined
        ? undefined
        : (ports, job, closed) => afterClosed(ports, itemClaim(job), closed),
    inputCurrent: input === undefined ? undefined : (job) => inputHolds(input, itemClaim(job)),
  };
}

export function defineUnownedJob<Kind extends UnownedJobKind>(
  kind: Kind,
  { deadlineMs, attempt, exhausted }: UnownedDeclaration<Kind>,
): JobSpec<Kind> {
  return {
    kind,
    deadlineMs,
    blockedBy: [],
    attempt: (ports, job) => attempt(ports, unownedClaim(kind, job)),
    exhausted: (db, job) => {
      const runId = unownedOwnerId(kind, job.address);

      return exhausted === undefined || runId === null ? [] : exhausted(db, runId);
    },
    afterClosed: async (ports, job, closed) => {
      if (closed) await enqueueRunJobs(ports, job);
    },
  };
}
