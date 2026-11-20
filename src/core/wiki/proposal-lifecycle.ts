import { type SQL, type SQLWrapper, and, eq, inArray, isNull, or, sql } from "drizzle-orm";

import type { ProposalKind, ProposalState } from "../contract/proposal-contract.ts";
import type { Database } from "../kernel/database.ts";
import type { SUBJECTS } from "../kernel/proposal-tables.ts";
import { highlights, proposals } from "../kernel/schema.ts";

const MOVES = {
  reject: { from: "open", to: "rejected" },
  claim: { from: "open", to: "accepting" },
  handBack: { from: "accepting", to: "open" },
  apply: { from: "accepting", to: "accepting" },
  remove: { from: "open" },
} as const satisfies Readonly<
  Record<
    string,
    { readonly from: ProposalState | readonly ProposalState[]; readonly to?: ProposalState }
  >
>;

export function anyAccepting(): SQL {
  return sql`exists (select 1 from ${proposals} where ${eq(proposals.state, MOVES.apply.to)})`;
}

export function proposalClaimed(db: Database, id: number) {
  return db
    .update(proposals)
    .set({ state: MOVES.claim.to })
    .where(
      and(eq(proposals.id, id), eq(proposals.state, MOVES.claim.from), sql`not ${anyAccepting()}`),
    )
    .returning({ id: proposals.id });
}

export function handedBack(db: Database, id: number) {
  return db
    .update(proposals)
    .set({ state: MOVES.handBack.to, failedRuns: null })
    .where(
      and(
        eq(proposals.id, id),
        eq(proposals.state, MOVES.handBack.from),
        isNull(proposals.cursor),
        isNull(proposals.moved),
        isNull(proposals.unitRevision),
      ),
    )
    .returning({ id: proposals.id });
}

export function rejection(db: Database, id: number) {
  return db
    .update(proposals)
    .set({ state: MOVES.reject.to })
    .where(and(eq(proposals.id, id), eq(proposals.state, MOVES.reject.from)))
    .returning({ id: proposals.id });
}

export function unitApplied(db: Database, id: number, moving: Readonly<SQLWrapper>) {
  return db
    .update(proposals)
    .set({ moved: sql`coalesce(${proposals.moved}, 0) + ${moving}` })
    .where(and(eq(proposals.id, id), eq(proposals.state, MOVES.apply.from)));
}

export function revisionOf(): SQL {
  return sql`coalesce(${proposals.unitRevision}, 0)`;
}

export function atRevision(revision: number): SQL {
  return sql`${revisionOf()} = ${revision}`;
}

export function unitAdvanced(db: Database, id: number, cursor: number | null, revision: number) {
  return db
    .update(proposals)
    .set({ cursor, unitRevision: revision, failedRuns: null })
    .where(and(eq(proposals.id, id), eq(proposals.state, MOVES.apply.to)));
}

export function unitFailed(db: Database, id: number, revision: number) {
  return db
    .update(proposals)
    .set({ failedRuns: sql`coalesce(${proposals.failedRuns}, 0) + 1` })
    .where(and(eq(proposals.id, id), eq(proposals.state, MOVES.apply.to), atRevision(revision)));
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

type Subject = Readonly<SQLWrapper>;

type SubjectColumn = (typeof SUBJECTS)[ProposalKind][number];

type Subjects = { readonly [Column in SubjectColumn]: Subject };

interface Row<Kind extends ProposalKind> {
  readonly kind: Kind;
  readonly state: Subject;
  readonly reason: Subject;
  readonly createdAt: number;
}

const NONE = sql`null`;

export type OwnSubjects<Kind extends ProposalKind> = Kind extends ProposalKind
  ? { readonly [Column in (typeof SUBJECTS)[Kind][number]]: Subject }
  : never;

export function proposalRow<Kind extends ProposalKind>(
  { kind, state, reason, createdAt }: Readonly<Row<Kind>>,
  own: OwnSubjects<Kind>,
) {
  const subjects: Readonly<Partial<Subjects>> = own;

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
    failedRuns: sql<null>`null`.as("failed_runs"),
    highlightId: sql<number | null>`${subjects.highlightId ?? NONE}`.as("highlight_id"),
    topicId: sql<number | null>`${subjects.topicId ?? NONE}`.as("topic_id"),
    fromItemId: sql<number | null>`${subjects.fromItemId ?? NONE}`.as("from_item_id"),
    intoItemId: sql<number | null>`${subjects.intoItemId ?? NONE}`.as("into_item_id"),
    fromDigest: sql<number | null>`${subjects.fromDigest ?? NONE}`.as("from_digest"),
    intoDigest: sql<number | null>`${subjects.intoDigest ?? NONE}`.as("into_digest"),
  };
}
