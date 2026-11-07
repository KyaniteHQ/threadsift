import type { BatchItem } from "drizzle-orm/batch";

import type { JobKind } from "./kinds.ts";
import type { Database, Ports } from "./ports.ts";
import type { JobRow } from "./schema.ts";

export type JobPorts = Pick<Ports, "db" | "files" | "network" | "pages" | "jobs" | "ai" | "crypto">;

export type JobWrites = readonly BatchItem<"sqlite">[];

export type ClaimedJob = JobRow & { readonly attemptKey: string };

export interface JobCurrency {
  readonly current: () => Promise<boolean>;
  readonly discard: (cause: "stale" | "lease-lost" | "error") => BatchItem<"sqlite"> | undefined;
}

export interface JobFiles {
  readonly written: string | null;
  readonly superseded: string | null;
}

export interface JobOutcome {
  readonly writes: JobWrites;
  readonly currency?: JobCurrency;
  readonly files?: JobFiles;
  readonly failedAttempt?: boolean;
}

export interface JobHandler {
  readonly deadlineMs: number;
  readonly blockedBy: readonly JobKind[];
  readonly attempt: (ports: JobPorts, job: Readonly<ClaimedJob>) => Promise<JobOutcome>;
  readonly exhausted: (db: Database, job: Readonly<JobRow>) => JobWrites;
}

export const RETRY_DELAYS_MS = [30_000, 120_000] as const;

export function isLastAttempt(attempts: number): boolean {
  return RETRY_DELAYS_MS[attempts] === undefined;
}

export const STALE_DELAYS_MS = [0, 0, 30_000] as const;
export const MAX_STALE_REQUEUES = 3;
