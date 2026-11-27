import type { SQLWrapper } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import {
  type JobKind,
  type OwnedJobKind,
  type UnownedJobKind,
  type WaitReason,
  isUnownedJobKind,
} from "../contract/job-contract.ts";
import type { Database } from "./database.ts";
import type { Ports } from "./ports.ts";
import type { JobRow } from "./schema.ts";

export type JobPorts = Pick<
  Ports,
  | "db"
  | "files"
  | "network"
  | "vaultFolder"
  | "pages"
  | "jobs"
  | "ai"
  | "secrets"
  | "crypto"
  | "fetchers"
  | "xFetcher"
  | "config"
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

export type ClaimedUnowned<Kind extends UnownedJobKind> = Claim<Kind, null>;

export type ClaimedExport = ClaimedUnowned<"export">;

export type ClaimedRestore = ClaimedUnowned<"restore">;

type ClaimedUnownedOf<Kind extends UnownedJobKind> = Kind extends UnownedJobKind
  ? ClaimedUnowned<Kind>
  : never;

export type ClaimedRow = ClaimedJob | ClaimedUnownedOf<UnownedJobKind>;

interface ClaimedColumns extends JobRow {
  readonly attemptKey: string | null;
  readonly imagePrefix: string | null;
}

function ownedClaim(row: Readonly<ClaimedColumns>): ClaimedJob {
  const { attemptKey, imagePrefix, ...columns } = row;

  if (
    isUnownedJobKind(columns.kind) ||
    columns.itemId === null ||
    attemptKey === null ||
    imagePrefix === null
  ) {
    throw new Error(`Job ${String(row.id)} of kind ${row.kind} is not owned by an Item`);
  }

  return { ...columns, kind: columns.kind, itemId: columns.itemId, attemptKey, imagePrefix };
}

export function claimedRow(row: Readonly<ClaimedColumns>): ClaimedRow {
  const { attemptKey: _key, imagePrefix: _prefix, kind, itemId, ...columns } = row;

  if (!isUnownedJobKind(kind)) return ownedClaim(row);

  if (itemId !== null) throw new Error(`Job ${String(row.id)} is a ${kind} with an Item`);

  return { ...columns, kind, itemId };
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

export interface JobClosing {
  readonly closing?:
    | ((db: Database, job: Readonly<ClaimedRow>, how: Closing) => JobWrites)
    | undefined;
  readonly afterClosed?:
    | ((ports: JobPorts, job: Readonly<ClaimedRow>, closed: boolean) => Promise<void>)
    | undefined;
}

export function settled<Outcome extends JobOutcome>(outcome: Outcome) {
  return { kind: "settled", outcome } as const;
}
