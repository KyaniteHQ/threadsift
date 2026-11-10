import { and, asc, eq, isNotNull, sql } from "drizzle-orm";

import { type CommentRow, type CommentsView, NO_COMMENTS, commentsViewOf } from "./comment-view.ts";
import type { Database } from "./ports.ts";
import { readGeneration } from "./reddit-thread.ts";
import { highlights, redditComments, redditThreads } from "./schema.ts";

function readableComments(db: Database, itemId: number) {
  const held = db
    .select({ commentId: highlights.commentId })
    .from(highlights)
    .where(
      and(
        eq(highlights.itemId, itemId),
        eq(highlights.status, "attached"),
        isNotNull(highlights.commentId),
      ),
    )
    .groupBy(highlights.commentId)
    .as("held");

  return {
    held,
    readable: sql`(${redditComments.kept} or ${held.commentId} is not null)`,
  };
}

export function readableBody(
  db: Database,
  itemId: number,
  commentId: string | null,
  generation: number,
) {
  const { held, readable } = readableComments(db, itemId);

  return db
    .select({ body: redditComments.body })
    .from(redditComments)
    .leftJoin(held, eq(held.commentId, redditComments.id))
    .where(
      and(
        eq(redditComments.itemId, itemId),
        eq(redditComments.generation, generation),
        commentId === null ? sql`0` : eq(redditComments.id, commentId),
        eq(redditComments.kind, "comment"),
        readable,
      ),
    );
}

function threadRows(db: Database, itemId: number) {
  const { held, readable } = readableComments(db, itemId);

  return db
    .select({
      id: redditComments.id,
      parentId: redditComments.parentId,
      depth: redditComments.depth,
      kind: redditComments.kind,
      eligible: redditComments.eligible,
      kept: redditComments.kept,
      readable: sql<boolean>`${readable}`.mapWith(Boolean),
      author: sql<string | null>`case when ${readable} then ${redditComments.author} end`,
      body: sql<string | null>`case when ${readable} then ${redditComments.body} end`,
      score: sql<number | null>`case when ${readable} then ${redditComments.score} end`,
      postedAt: sql<number | null>`case when ${readable} then ${redditComments.postedAt} end`,
    })
    .from(redditComments)
    .leftJoin(held, eq(held.commentId, redditComments.id))
    .where(
      and(
        eq(redditComments.itemId, itemId),
        sql`${redditComments.generation} = ${readGeneration(itemId)}`,
      ),
    )
    .orderBy(asc(redditComments.position));
}

function threadReport(db: Database, itemId: number) {
  return db
    .select({
      reported: redditThreads.reported,
      archivedAt: redditThreads.archivedAt,
      generation: redditThreads.generation,
    })
    .from(redditThreads)
    .where(
      and(
        eq(redditThreads.itemId, itemId),
        sql`${redditThreads.generation} = ${readGeneration(itemId)}`,
      ),
    );
}

export function threadReads(db: Database, itemId: number) {
  return [threadRows(db, itemId), threadReport(db, itemId)] as const;
}

export function commentsOf(
  rows: readonly CommentRow[],
  report: readonly Readonly<{ reported: number | null; archivedAt: number | null }>[],
): CommentsView {
  const [thread] = report;

  return thread === undefined ? NO_COMMENTS : commentsViewOf(rows, thread);
}
