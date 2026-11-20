import type { SQL, SQLWrapper } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";

import type { MergeKind, ProposalState } from "../../../core/contract/proposal-contract.ts";
import type { Database } from "../../../core/kernel/database.ts";
import type { SUBJECTS } from "../../../core/kernel/proposal-tables.ts";
import type { pins, proposals, tags, topics } from "../../../core/kernel/schema.ts";
import type { SentNames } from "./proposal-names.ts";
import type { TagSubject, TopicSubject } from "./proposal-sent.ts";

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

interface MergeTables {
  readonly "tag-merge": typeof tags;
  readonly "topic-merge": typeof topics;
}

interface MergeSubjects {
  readonly "tag-merge": TagSubject;
  readonly "topic-merge": TopicSubject;
}

interface MergeLogs {
  readonly "tag-merge": "merge";
  readonly "topic-merge": "merge-topic";
}

type Ends<Kind extends MergeKind> = (typeof SUBJECTS)[Kind];

type Subject = Readonly<SQLWrapper>;

interface Spec<Kind extends MergeKind> {
  readonly table: MergeTables[Kind];
  readonly from: (typeof proposals)[Ends<Kind>[0]];
  readonly into: (typeof proposals)[Ends<Kind>[1]];
  readonly subjects: (
    from: Subject,
    into: Subject,
  ) => { readonly [Key in Ends<Kind>[number]]: Subject };
  readonly pin: {
    readonly column: (typeof pins)[Ends<Kind>[1]];
    readonly set: (id: number) => { readonly [Key in Ends<Kind>[1]]: number };
  };
  readonly itemLink: Link;
  readonly alsoLinked: readonly SQLiteColumn[];
  readonly log: MergeLogs[Kind];
  readonly plan: (context: Readonly<UnitContext>) => Promise<UnitPlan>;
  readonly stage: string;
  readonly label: string;
  readonly event: string;
  readonly instructions: string;
  readonly names: SentNames<MergeSubjects[Kind]>;
}

export type MergeSpecs = { readonly [Kind in MergeKind]: Spec<Kind> };

export type MergeKindSpec = MergeSpecs[MergeKind];
