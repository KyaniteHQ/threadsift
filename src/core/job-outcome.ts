import type { SQLWrapper } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import type { JobKind, WaitReason } from "./kinds.ts";
import type { Database, Ports } from "./ports.ts";
import type { JobRow } from "./schema.ts";

export type JobPorts = Pick<
  Ports,
  "db" | "files" | "network" | "pages" | "jobs" | "ai" | "crypto" | "fetchers"
>;

export type JobWrites = readonly BatchItem<"sqlite">[];

export type ClaimedJob = JobRow & {
  readonly attemptKey: string;
  readonly imagePrefix: string;
};

export interface JobCurrency {
  readonly current: () => Promise<boolean>;
  readonly discard: (cause: "stale" | "lease-lost" | "error") => BatchItem<"sqlite"> | undefined;
}

export interface JobFiles {
  readonly written: readonly string[];
  readonly superseded: readonly string[];
}

export const NO_FILES: JobFiles = { written: [], superseded: [] };

export interface Precondition<Rebuilt extends SettledOutcome = SettledOutcome> {
  readonly holds: Readonly<SQLWrapper>;
  readonly rebuild: () => Promise<Rebuilt>;
}

export interface SettledOutcome {
  readonly writes: JobWrites;
  readonly precondition?: Precondition;
  readonly currency?: JobCurrency;
  readonly files?: JobFiles;
  readonly failedAttempt?: boolean;
}

export interface AnchoredOutcome extends SettledOutcome {
  readonly precondition: Precondition<AnchoredOutcome>;
}

export interface DeferredOutcome {
  readonly deferredUntil: number;
  readonly wait: WaitReason;
  readonly countsAttempt: boolean;
}

export type JobOutcome = SettledOutcome | DeferredOutcome;

export interface JobHandler {
  readonly deadlineMs: number;
  readonly blockedBy: readonly JobKind[];
  readonly attempt: (ports: JobPorts, job: Readonly<ClaimedJob>) => Promise<JobOutcome>;
  readonly exhausted: (db: Database, job: Readonly<JobRow>) => JobWrites;
  readonly inputCurrent?: (job: Readonly<JobRow>) => SQLWrapper;
}

export const RETRY_DELAYS_MS = [30_000, 120_000] as const;

export function isLastAttempt(attempts: number): boolean {
  return RETRY_DELAYS_MS[attempts] === undefined;
}

export const STALE_DELAYS_MS = [0, 0, 30_000] as const;
export const MAX_STALE_REQUEUES = 3;
