import type { SQL } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import type { ProposalKind, ProposalState } from "./kinds.ts";
import type { Database } from "./ports.ts";

export interface MergeSide {
  readonly id: number;
  readonly key: string;
  readonly name: string;
}

export interface MergeRow {
  readonly kind: ProposalKind;
  readonly state: ProposalState;
  readonly cursor: number | null;
  readonly revision: number;
  readonly from: MergeSide;
  readonly into: MergeSide;
}

type Writes = readonly BatchItem<"sqlite">[];

export interface MergeUnit {
  readonly guard: SQL;
  readonly moving: SQL;
  readonly pin: Writes;
  readonly moves: Writes;
  readonly cursor: number | null;
  readonly release: Writes;
  readonly closing: Writes;
  readonly opening: BatchItem<"sqlite"> | null;
}

export type PlanUnit = (
  db: Database,
  id: number,
  row: Readonly<MergeRow>,
) => Promise<MergeUnit | "busy">;
