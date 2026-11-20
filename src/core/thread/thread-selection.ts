import { type SQL, type SQLWrapper, and, asc, eq, isNotNull, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { StoredCommentId } from "../contract/comment-id.ts";
import type { Database } from "../kernel/database.ts";
import { digests, items, redditComments, redditThreads } from "../kernel/schema.ts";
import { among } from "../kernel/sql-expressions.ts";

export interface CommentCandidate {
  readonly id: string;
  readonly parentId: string | null;
  readonly body: string;
}

export function keptCommentIds(): SQL<string> {
  return sql<string>`(select coalesce(json_group_array(id), '[]') from (select ${redditComments.id} as id from ${redditComments} join ${digests} on ${digests.itemId} = ${redditComments.itemId} and ${digests.generation} = ${redditComments.generation} where ${redditComments.itemId} = ${items.id} and ${redditComments.kept} = 1 order by ${redditComments.position}))`;
}

function selected(kept: readonly string[]): SQL {
  return sql`${redditComments.eligible} = 1 and ${among(redditComments.id, kept)}`;
}

function commentsWhere(
  db: Database,
  snapshot: Readonly<{ itemId: number; generation: number }>,
  condition: Readonly<SQLWrapper>,
) {
  return db
    .select({ id: redditComments.id, body: redditComments.body })
    .from(redditComments)
    .where(
      and(
        eq(redditComments.itemId, snapshot.itemId),
        eq(redditComments.generation, snapshot.generation),
        sql`${condition}`,
      ),
    )
    .orderBy(asc(redditComments.position));
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
  return bodiesWhere(db, snapshot, eq(redditComments.kept, true));
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

  return [...new Set(ids)].filter((id) => allowed.has(id) && StoredCommentId.safeParse(id).success);
}

export async function commentCandidates(
  db: Database,
  snapshot: Readonly<{ itemId: number; generation: number }>,
): Promise<readonly CommentCandidate[]> {
  const rows = await db
    .select({ id: redditComments.id, parentId: redditComments.parentId, body: redditComments.body })
    .from(redditComments)
    .where(
      and(
        eq(redditComments.itemId, snapshot.itemId),
        eq(redditComments.generation, snapshot.generation),
        eq(redditComments.eligible, true),
        isNotNull(redditComments.body),
      ),
    )
    .orderBy(asc(redditComments.position));

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
      .update(redditComments)
      .set({ kept: selected(kept) })
      .where(and(eq(redditComments.itemId, itemId), eq(redditComments.generation, generation))),
    db
      .delete(redditComments)
      .where(
        and(eq(redditComments.itemId, itemId), sql`${redditComments.generation} <> ${generation}`),
      ),
    db
      .delete(redditThreads)
      .where(
        and(eq(redditThreads.itemId, itemId), sql`${redditThreads.generation} <> ${generation}`),
      ),
  ];
}
