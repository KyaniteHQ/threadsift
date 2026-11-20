import type { SQL, SQLWrapper } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";

import type { CatalogTable } from "./catalog-tables.ts";
import type { Database } from "./database.ts";
import type { MergeKind, ProposalState } from "./kinds.ts";
import type { pins, proposals, tags, topics } from "./schema.ts";

export interface Side {
  readonly id: number;
  readonly key: string;
  readonly name: string;
}

export interface MergeRow {
  readonly kind: MergeKind;
  readonly state: ProposalState;
  readonly cursor: number | null;
  readonly revision: number;
  readonly from: Side;
  readonly into: Side;
}

type Writes = readonly BatchItem<"sqlite">[];

interface Link {
  readonly entry: SQLiteColumn;
  readonly item: SQLiteColumn;
}

export interface UnitContext {
  readonly db: Database;
  readonly from: Side;
  readonly into: Side;
  readonly cursor: number | null;
  readonly gone: SQL;
}

export interface UnitPlan {
  readonly moving: SQL;
  readonly moves: Writes;
  readonly cursor: number | null;
  readonly before: Writes;
  readonly wakes: Writes;
}

interface Spec<
  Table extends CatalogTable,
  From extends "fromTagId" | "fromTopicId",
  Into extends "intoTagId" | "intoTopicId",
  Log extends "merge" | "merge-topic",
> {
  readonly table: Table;
  readonly from: (typeof proposals)[From];
  readonly into: (typeof proposals)[Into];
  readonly subjects: (
    from: Readonly<SQLWrapper>,
    into: Readonly<SQLWrapper>,
  ) => { readonly [Key in From]: Readonly<SQLWrapper> } & {
    readonly [Key in Into]: Readonly<SQLWrapper>;
  };
  readonly pin: {
    readonly column: (typeof pins)[Into];
    readonly set: (id: number) => { readonly [Key in Into]: number };
  };
  readonly itemLink: Link;
  readonly alsoLinked: readonly SQLiteColumn[];
  readonly log: Log;
  readonly plan: (context: Readonly<UnitContext>) => Promise<UnitPlan>;
}

export interface MergeSpecs {
  readonly "tag-merge": Spec<typeof tags, "fromTagId", "intoTagId", "merge">;
  readonly "topic-merge": Spec<typeof topics, "fromTopicId", "intoTopicId", "merge-topic">;
}

export type MergeKindSpec = MergeSpecs[MergeKind];
