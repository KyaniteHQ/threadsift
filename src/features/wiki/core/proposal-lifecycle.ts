import {
  type SQL,
  type SQLWrapper,
  type Subquery,
  and,
  eq,
  getTableColumns,
  inArray,
  isNull,
  sql,
} from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";

import type { ProposalKind, ProposalState } from "../../../core/contract/proposal-contract.ts";
import type { Database } from "../../../core/kernel/database.ts";
import { SUBJECT_TABLE, hasSubject, proposals } from "../../../core/kernel/schema.ts";

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

function anyAccepting(): SQL {
  return sql`exists (select 1 from ${proposals} where ${eq(proposals.state, MOVES.apply.to)})`;
}

export function proposalClaimed(db: Database, id: number, kind: ProposalKind) {
  return db
    .update(proposals)
    .set({ state: MOVES.claim.to })
    .where(
      and(
        eq(proposals.id, id),
        eq(proposals.state, MOVES.claim.from),
        whereSubject(kind, sql`1`),
        sql`not ${anyAccepting()}`,
      ),
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
    .where(and(eq(proposals.id, id), eq(proposals.state, MOVES.reject.from), hasSubject()))
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

export function removedOpen<Kind extends ProposalKind>(
  db: Database,
  kind: Kind,
  ...conditions: readonly Readonly<SQLWrapper>[]
) {
  const table = SUBJECT_TABLE[kind];

  return db.delete(table).where(
    inArray(
      table.proposalId,
      db
        .select({ id: proposals.id })
        .from(proposals)
        .where(
          and(eq(proposals.state, MOVES.remove.from), ...conditions.map((each) => sql`${each}`)),
        ),
    ),
  );
}

type Subject = Readonly<SQLWrapper>;

type SubjectInsert<Kind extends ProposalKind> = (typeof SUBJECT_TABLE)[Kind]["$inferInsert"];

export type OwnSubjects<Kind extends ProposalKind> = Kind extends ProposalKind
  ? { readonly [Column in Exclude<keyof SubjectInsert<Kind>, "proposalId" | "kind">]: Subject }
  : never;

export interface Proposed<Kind extends ProposalKind> {
  readonly state: Subject;
  readonly reason: Subject;
  readonly subjects: OwnSubjects<Kind>;
  readonly from: SQLiteTable | Subquery | SQL;
  readonly where: SQL | undefined;
  readonly order: SQL;
}

export function whereSubject(kind: ProposalKind, condition: Subject): SQL {
  const table = SUBJECT_TABLE[kind];

  return sql`${proposals.id} in (select ${table.proposalId} from ${table} where ${condition})`;
}

function proposedRows<Kind extends ProposalKind>(
  db: Database,
  { state, reason, subjects, from, where, order }: Readonly<Proposed<Kind>>,
) {
  const own: Readonly<Partial<Record<string, Subject>>> = subjects;

  return db
    .select({
      seq: sql<number>`row_number() over (order by ${order})`.as("seq"),
      state: sql<ProposalState>`${state}`.as("state"),
      reason: sql<string | null>`${reason}`.as("reason"),
      ...Object.fromEntries(
        Object.entries(own).flatMap(([name, value]) =>
          value === undefined ? [] : [[name, sql`${value}`.as(name)] as const],
        ),
      ),
    })
    .from(from)
    .where(where);
}

function insertedHeads(
  db: Database,
  kind: ProposalKind,
  createdAt: number,
  rows: Readonly<Proposed<ProposalKind>>,
  only: SQL | undefined,
) {
  const proposed = proposedRows(db, rows).as("proposed");

  return db.insert(proposals).select(
    db
      .select({
        id: sql<null>`null`.as("id"),
        kind: sql<ProposalKind>`${kind}`.as("kind"),
        reason: proposed.reason,
        state: proposed.state,
        createdAt: sql<number>`${createdAt}`.as("created_at"),
        cursor: sql<null>`null`.as("cursor"),
        moved: sql<null>`null`.as("moved"),
        unitRevision: sql<null>`null`.as("unit_revision"),
        failedRuns: sql<null>`null`.as("failed_runs"),
      })
      .from(proposed)
      .where(only)
      .orderBy(sql`seq`),
  );
}

function insertedSubjects(
  db: Database,
  kind: ProposalKind,
  rows: Readonly<Proposed<ProposalKind>>,
) {
  const table = SUBJECT_TABLE[kind];

  const inserted = db
    .select({
      id: proposals.id,
      seq: sql<number>`row_number() over (order by ${proposals.id})`.as("seq"),
    })
    .from(proposals)
    .where(
      and(
        eq(proposals.kind, kind),
        sql`${proposals.id} in (select id from ${proposals} order by id desc limit changes())`,
      ),
    );

  const valueOf = (name: string): SQL => {
    if (name === "proposalId") return sql`u.id`;

    return name === "kind" ? sql`${kind}` : sql`p.${sql.identifier(name)}`;
  };

  return db.insert(table).select(
    sql`select ${sql.join(
      Object.keys(getTableColumns(table)).map((name) => valueOf(name)),
      sql`, `,
    )} from (${inserted.getSQL()}) as u inner join (${proposedRows(db, rows).getSQL()}) as p on p.seq = u.seq`,
  );
}

export function insertedProposals<Kind extends ProposalKind>(
  db: Database,
  kind: Kind,
  createdAt: number,
  proposed: Readonly<Proposed<Kind>>,
  only?: SQL,
): readonly BatchItem<"sqlite">[] {
  return [insertedHeads(db, kind, createdAt, proposed, only), insertedSubjects(db, kind, proposed)];
}
