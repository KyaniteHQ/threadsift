import { type SQL, type SQLWrapper, and, eq, inArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

import type { MergeKind, ProposalKind, ProposalState } from "./kinds.ts";
import type { Database } from "./ports.ts";
import { highlights, knownProposal, proposals } from "./schema.ts";

interface Lifecycle {
  readonly held: readonly ProposalState[];
  readonly inserted: readonly ProposalState[];
}

const MERGE_LIFECYCLE = {
  held: ["open", "accepting", "rejected", "declined"],
  inserted: ["open", "declined"],
} as const satisfies Lifecycle;

const PLAIN_LIFECYCLE = {
  held: ["open", "rejected"],
  inserted: ["open"],
} as const satisfies Lifecycle;

export const LIFECYCLE = {
  "tag-merge": MERGE_LIFECYCLE,
  "topic-merge": MERGE_LIFECYCLE,
  "highlight-lost": PLAIN_LIFECYCLE,
  "overview-gap": PLAIN_LIFECYCLE,
  "items-disagree": PLAIN_LIFECYCLE,
} as const satisfies Readonly<Record<ProposalKind, Lifecycle>>;

export type InsertedState<Kind extends ProposalKind> = (typeof LIFECYCLE)[Kind]["inserted"][number];

const MOVES = {
  reject: { from: "open", to: "rejected" },
  apply: { from: ["open", "accepting"], to: "accepting" },
  remove: { from: "open" },
} as const satisfies Readonly<
  Record<
    string,
    { readonly from: ProposalState | readonly ProposalState[]; readonly to?: ProposalState }
  >
>;

const SURVIVAL_RANK = {
  accepting: 0,
  rejected: 1,
  open: 2,
  declined: 2,
} as const satisfies { readonly [S in ProposalState]: number };

const OTHER_RANK = 2;

export function anyAccepting(): SQL {
  return sql`exists (select 1 from ${proposals} where ${eq(proposals.state, MOVES.apply.to)})`;
}

export function rejection(db: Database, id: number) {
  return db
    .update(proposals)
    .set({ state: MOVES.reject.to })
    .where(and(eq(proposals.id, id), knownProposal, eq(proposals.state, MOVES.reject.from)))
    .returning({ id: proposals.id });
}

export function unitApplied(db: Database, id: number, moving: Readonly<SQLWrapper>) {
  return db
    .update(proposals)
    .set({ state: MOVES.apply.to, moved: sql`coalesce(${proposals.moved}, 0) + ${moving}` })
    .where(and(eq(proposals.id, id), inArray(proposals.state, MOVES.apply.from)));
}

export function unitAdvanced(db: Database, id: number, cursor: number | null, revision: number) {
  return db
    .update(proposals)
    .set({ cursor, unitRevision: revision })
    .where(and(eq(proposals.id, id), eq(proposals.state, MOVES.apply.to)));
}

export function removedOpen(db: Database, ...conditions: readonly Readonly<SQLWrapper>[]) {
  return db
    .delete(proposals)
    .where(and(eq(proposals.state, MOVES.remove.from), ...conditions.map((each) => sql`${each}`)));
}

export function goneWithItem(db: Database, itemId: number) {
  return [
    db
      .delete(proposals)
      .where(
        inArray(
          proposals.highlightId,
          db.select({ id: highlights.id }).from(highlights).where(eq(highlights.itemId, itemId)),
        ),
      ),
    db
      .delete(proposals)
      .where(or(eq(proposals.fromItemId, itemId), eq(proposals.intoItemId, itemId))),
  ];
}

const other = alias(proposals, "other");

interface Columns {
  readonly id: Readonly<SQLWrapper>;
  readonly from: Readonly<SQLWrapper>;
  readonly into: Readonly<SQLWrapper>;
  readonly state: Readonly<SQLWrapper>;
}

function columnsOf(row: typeof proposals | typeof other, kind: MergeKind): Columns {
  return {
    id: row.id,
    from: kind === "tag-merge" ? row.fromTagId : row.fromTopicId,
    into: kind === "tag-merge" ? row.intoTagId : row.intoTopicId,
    state: row.state,
  };
}

function names({ from, into }: Readonly<Columns>, subjectId: number): SQL {
  return sql`(${from} = ${subjectId} or ${into} = ${subjectId})`;
}

function partner({ from, into }: Readonly<Columns>, subjectId: number): SQL {
  return sql`(case when ${from} = ${subjectId} then ${into} else ${from} end)`;
}

function survival({ state }: Readonly<Columns>): SQL {
  const ranks = Object.entries(SURVIVAL_RANK).map(([name, rank]) => `when '${name}' then ${rank}`);

  return sql`(case ${state} ${sql.raw(ranks.join(" "))} else ${sql.raw(String(OTHER_RANK))} end)`;
}

function outranks(first: Readonly<Columns>, second: Readonly<Columns>): SQL {
  return sql`(${survival(first)} < ${survival(second)} or (${survival(first)} = ${survival(second)} and ${first.id} < ${second.id}))`;
}

export function proposalRelinks(db: Database, kind: MergeKind, loser: number, survivor: number) {
  const outer = columnsOf(proposals, kind);
  const inner = columnsOf(other, kind);

  return [
    db
      .delete(proposals)
      .where(
        sql`(${outer.from} = ${loser} and ${outer.into} = ${survivor}) or (${outer.from} = ${survivor} and ${outer.into} = ${loser})`,
      ),
    db
      .delete(proposals)
      .where(
        sql`${names(outer, loser)} and exists (select 1 from ${proposals} as other where ${names(inner, survivor)} and ${partner(inner, survivor)} = ${partner(outer, loser)} and not ${outranks(outer, inner)})`,
      ),
    db
      .delete(proposals)
      .where(
        sql`${names(outer, survivor)} and exists (select 1 from ${proposals} as other where ${names(inner, loser)} and ${partner(inner, loser)} = ${partner(outer, survivor)} and ${outranks(inner, outer)})`,
      ),
    db
      .update(proposals)
      .set(
        kind === "tag-merge"
          ? {
              fromTagId: sql`case when ${outer.from} = ${loser} then ${survivor} else ${outer.from} end`,
              intoTagId: sql`case when ${outer.into} = ${loser} then ${survivor} else ${outer.into} end`,
            }
          : {
              fromTopicId: sql`case when ${outer.from} = ${loser} then ${survivor} else ${outer.from} end`,
              intoTopicId: sql`case when ${outer.into} = ${loser} then ${survivor} else ${outer.into} end`,
            },
      )
      .where(names(outer, loser)),
  ];
}

type Subject = Readonly<SQLWrapper>;

interface Subjects {
  readonly fromTagId: Subject;
  readonly intoTagId: Subject;
  readonly fromTopicId: Subject;
  readonly intoTopicId: Subject;
  readonly highlightId: Subject;
  readonly topicId: Subject;
  readonly fromItemId: Subject;
  readonly intoItemId: Subject;
  readonly fromDigest: Subject;
  readonly intoDigest: Subject;
}

interface Row<Kind extends ProposalKind> {
  readonly kind: Kind;
  readonly state: InsertedState<Kind> | Subject;
  readonly reason: Subject;
  readonly createdAt: number;
}

const NONE = sql`null`;

export function proposalRow<Kind extends ProposalKind>(
  { kind, state, reason, createdAt }: Readonly<Row<Kind>>,
  subjects: Readonly<Partial<Subjects>>,
) {
  return {
    id: sql<null>`null`.as("id"),
    kind: sql<ProposalKind>`${kind}`.as("kind"),
    fromTagId: sql<number | null>`${subjects.fromTagId ?? NONE}`.as("from_tag_id"),
    intoTagId: sql<number | null>`${subjects.intoTagId ?? NONE}`.as("into_tag_id"),
    fromTopicId: sql<number | null>`${subjects.fromTopicId ?? NONE}`.as("from_topic_id"),
    intoTopicId: sql<number | null>`${subjects.intoTopicId ?? NONE}`.as("into_topic_id"),
    reason: sql<string | null>`${reason}`.as("reason"),
    state: sql<ProposalState>`${state}`.as("state"),
    createdAt: sql<number>`${createdAt}`.as("created_at"),
    cursor: sql<null>`null`.as("cursor"),
    moved: sql<null>`null`.as("moved"),
    unitRevision: sql<null>`null`.as("unit_revision"),
    highlightId: sql<number | null>`${subjects.highlightId ?? NONE}`.as("highlight_id"),
    topicId: sql<number | null>`${subjects.topicId ?? NONE}`.as("topic_id"),
    fromItemId: sql<number | null>`${subjects.fromItemId ?? NONE}`.as("from_item_id"),
    intoItemId: sql<number | null>`${subjects.intoItemId ?? NONE}`.as("into_item_id"),
    fromDigest: sql<number | null>`${subjects.fromDigest ?? NONE}`.as("from_digest"),
    intoDigest: sql<number | null>`${subjects.intoDigest ?? NONE}`.as("into_digest"),
  };
}
