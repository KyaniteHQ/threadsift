import type { BatchItem } from "drizzle-orm/batch";

import type { JobKind } from "./kinds.ts";
import type { Database, Ports } from "./ports.ts";
import type { JobRow } from "./schema.ts";

export type JobPorts = Pick<Ports, "db" | "network" | "pages" | "jobs" | "ai">;

export type JobWrites = readonly BatchItem<"sqlite">[];

export interface JobCurrency {
  readonly current: () => Promise<boolean>;
  readonly discard: (cause: "stale" | "lease-lost" | "error") => BatchItem<"sqlite">;
}

export interface JobOutcome {
  readonly writes: JobWrites;
  readonly currency?: JobCurrency;
}

export interface JobHandler {
  readonly deadlineMs: number;
  readonly blockedBy: readonly JobKind[];
  readonly attempt: (ports: JobPorts, job: Readonly<JobRow>) => Promise<JobOutcome>;
  readonly exhausted: (db: Database, job: Readonly<JobRow>) => JobWrites;
}
