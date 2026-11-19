import type { SQLWrapper } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import type { ModelAi } from "./ai-contract.ts";
import type { Database } from "./database.ts";
import type { JobKind, OwnedJobKind, WaitReason } from "./kinds.ts";
import type { Ports } from "./ports.ts";
import type { JobRow } from "./schema.ts";

export type JobPorts = Pick<
  Ports,
  | "db"
  | "files"
  | "network"
  | "vaultFolder"
  | "redditSession"
  | "pages"
  | "jobs"
  | "ai"
  | "secrets"
  | "crypto"
  | "fetchers"
  | "xFetcher"
>;

export type JobWrites = readonly BatchItem<"sqlite">[];

type Claim<Kind extends JobKind, Owner extends number | null> = Omit<JobRow, "kind" | "itemId"> & {
  readonly kind: Kind;
  readonly itemId: Owner;
};

export type ClaimedJob = Claim<OwnedJobKind, number> & {
  readonly attemptKey: string;
  readonly imagePrefix: string;
};

export type ClaimedExport = Claim<"export", null>;

export type ClaimedRestore = Claim<"restore", null>;

export type ClaimedRow = ClaimedJob | ClaimedExport | ClaimedRestore;

export interface ClaimedColumns extends JobRow {
  readonly attemptKey: string | null;
  readonly imagePrefix: string | null;
}

export function ownedClaim(row: Readonly<ClaimedColumns>): ClaimedJob {
  const { attemptKey, imagePrefix, ...columns } = row;

  if (
    columns.kind === "export" ||
    columns.kind === "restore" ||
    columns.itemId === null ||
    attemptKey === null ||
    imagePrefix === null
  ) {
    throw new Error(`Job ${String(row.id)} of kind ${row.kind} is not owned by an Item`);
  }

  return { ...columns, kind: columns.kind, itemId: columns.itemId, attemptKey, imagePrefix };
}

export interface JobCurrency {
  readonly current: () => Promise<boolean>;
  readonly discard: (cause: "stale" | "lease-lost" | "error") => readonly BatchItem<"sqlite">[];
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
  readonly continuation?: JobWrites;
}

export interface AnchoredOutcome extends SettledOutcome {
  readonly precondition: Precondition<AnchoredOutcome>;
}

export interface DeferredOutcome {
  readonly deferredUntil: number;
  readonly wait: WaitReason | null;
  readonly countsAttempt: boolean;
  readonly unlessOpen?: number;
  readonly writes?: JobWrites;
}

export type JobOutcome = SettledOutcome | DeferredOutcome;

export type Closing =
  | { readonly kind: "closed" }
  | { readonly kind: "deferred"; readonly wait: WaitReason | null };

export interface JobClosing<Claimed extends ClaimedRow = ClaimedJob> {
  readonly closing?: (db: Database, job: Readonly<Claimed>, how: Closing) => JobWrites;
  readonly afterClosed?: (
    ports: JobPorts,
    job: Readonly<Claimed>,
    closed: boolean,
  ) => Promise<void>;
}

export const NO_CLOSING: JobClosing<ClaimedRow> = {};

export interface JobHandler<Claimed extends ClaimedRow = ClaimedJob> extends JobClosing<Claimed> {
  readonly deadlineMs: number;
  readonly blockedBy: readonly JobKind[];
  readonly attempt: (ports: JobPorts, job: Readonly<Claimed>) => Promise<JobOutcome>;
  readonly exhausted?: (db: Database, job: Readonly<Claimed>) => JobWrites;
  readonly inputCurrent?: (job: Readonly<Claimed>) => SQLWrapper;
}

export interface ModelHandler extends Omit<JobHandler, "attempt"> {
  readonly attempt: (
    ports: JobPorts,
    job: Readonly<ClaimedJob>,
    ai: ModelAi,
  ) => Promise<JobOutcome>;
}

export const CLAIM_MARGIN_MS = 120_000;

export const RETRY_DELAYS_MS = [30_000, 120_000] as const;

export function settled<Outcome extends JobOutcome>(outcome: Outcome) {
  return { kind: "settled", outcome } as const;
}

export function isLastAttempt(attempts: number): boolean {
  return RETRY_DELAYS_MS[attempts] === undefined;
}

export const STALE_DELAYS_MS = [0, 0, 30_000] as const;
export const MAX_STALE_REQUEUES = 3;
