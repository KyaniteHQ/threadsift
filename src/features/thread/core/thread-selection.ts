import { type SQL, type SQLWrapper, and, asc, eq, isNotNull, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { CommentId } from "../../../core/contract/comment-id.ts";
import type { Database } from "../../../core/kernel/database.ts";
import { digests, items, threadComments, threads } from "../../../core/kernel/schema.ts";
import { among } from "../../../core/kernel/sql-expressions.ts";

export interface CommentCandidate {
  readonly id: string;
  readonly parentId: string | null;
  readonly body: string;
}

export function keptCommentIds(): SQL<string> {
  return sql<string>`(select coalesce(json_group_array(id), '[]') from (select ${threadComments.id} as id from ${threadComments} join ${digests} on ${digests.itemId} = ${threadComments.itemId} and ${digests.generation} = ${threadComments.generation} where ${threadComments.itemId} = ${items.id} and ${threadComments.kept} = 1 order by ${threadComments.position}))`;
}

function selected(kept: readonly string[]): SQL {
  return sql`${threadComments.eligible} = 1 and ${among(threadComments.id, kept)}`;
}

function commentsWhere(
  db: Database,
  snapshot: Readonly<{ itemId: number; generation: number }>,
  condition: Readonly<SQLWrapper>,
) {
  return db
    .select({ id: threadComments.id, body: threadComments.body })
    .from(threadComments)
    .where(
      and(
        eq(threadComments.itemId, snapshot.itemId),
        eq(threadComments.generation, snapshot.generation),
        sql`${condition}`,
      ),
    )
    .orderBy(asc(threadComments.position));
}

async function bodiesWhere(
  db: Database,
  snapshot: Readonly<{ itemId: number; generation: number }>,
  condition: Readonly<SQLWrapper>,
): Promise<readonly string[]> {
  const rows = await commentsWhere(db, snapshot, condition);

  return rows.flatMap(({ body }) => (body === null ? [] : [body]));
}

export function selectedBodies(
  db: Database,
  snapshot: Readonly<{ itemId: number; generation: number }>,
  kept: readonly string[],
): Promise<readonly string[]> {
  return bodiesWhere(db, snapshot, selected(kept));
}

export async function eligibleAmong(
  db: Database,
  snapshot: Readonly<{ itemId: number; generation: number }>,
  ids: readonly string[],
): Promise<readonly string[]> {
  if (ids.length === 0) return [];

  const rows = await commentsWhere(db, snapshot, selected(ids));

  return rows.map(({ id }) => id);
}

export function keptBodies(
  db: Database,
  snapshot: Readonly<{ itemId: number; generation: number }>,
): Promise<readonly string[]> {
  return bodiesWhere(db, snapshot, eq(threadComments.kept, true));
}

export function highlightedComments(
  db: Database,
  snapshot: Readonly<{ itemId: number; generation: number }>,
  ids: readonly string[],
) {
  return ids.length === 0 ? Promise.resolve([]) : commentsWhere(db, snapshot, selected(ids));
}

export function submittedAmong(
  ids: readonly string[],
  submitted: readonly string[],
): readonly string[] {
  const allowed = new Set(submitted);

  return [...new Set(ids)].filter((id) => allowed.has(id) && CommentId.safeParse(id).success);
}

export async function commentCandidates(
  db: Database,
  snapshot: Readonly<{ itemId: number; generation: number }>,
): Promise<readonly CommentCandidate[]> {
  const rows = await db
    .select({ id: threadComments.id, parentId: threadComments.parentId, body: threadComments.body })
    .from(threadComments)
    .where(
      and(
        eq(threadComments.itemId, snapshot.itemId),
        eq(threadComments.generation, snapshot.generation),
        eq(threadComments.eligible, true),
        isNotNull(threadComments.body),
      ),
    )
    .orderBy(asc(threadComments.position));

  return rows.flatMap(({ id, parentId, body }) => (body === null ? [] : [{ id, parentId, body }]));
}

export function selectionWrites(
  db: Database,
  published: Readonly<{ itemId: number; generation: number }>,
  kept: readonly string[],
): readonly BatchItem<"sqlite">[] {
  const { itemId, generation } = published;

  return [
    db
      .update(threadComments)
      .set({ kept: selected(kept) })
      .where(and(eq(threadComments.itemId, itemId), eq(threadComments.generation, generation))),
    db
      .delete(threadComments)
      .where(
        and(eq(threadComments.itemId, itemId), sql`${threadComments.generation} <> ${generation}`),
      ),
    db
      .delete(threads)
      .where(and(eq(threads.itemId, itemId), sql`${threads.generation} <> ${generation}`)),
  ];
}
