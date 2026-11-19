import type { SQL } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import type { Database } from "./database.ts";
import type { MergeKind, ProposalState } from "./kinds.ts";

interface MergeSide {
  readonly id: number;
  readonly key: string;
  readonly name: string;
}

export interface MergeRow {
  readonly kind: MergeKind;
  readonly state: ProposalState;
  readonly cursor: number | null;
  readonly revision: number;
  readonly from: MergeSide;
  readonly into: MergeSide;
}

type Writes = readonly BatchItem<"sqlite">[];

interface MergeClosing {
  readonly writes: Writes;
  readonly wakes: readonly number[];
}

export interface MergeUnit {
  readonly moving: SQL;
  readonly pin: Writes;
  readonly moves: Writes;
  readonly cursor: number | null;
  readonly closing: MergeClosing;
}

export type PlanUnit = (db: Database, id: number, row: Readonly<MergeRow>) => Promise<MergeUnit>;
