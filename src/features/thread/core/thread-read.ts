import { and, asc, eq, sql } from "drizzle-orm";

import {
  type CommentRow,
  type CommentsView,
  NO_COMMENTS,
  type ThreadReport,
  commentsViewOf,
} from "../../../core/contract/comment-view.ts";
import type { Database } from "../../../core/kernel/database.ts";
import { providerMayRead } from "../../../core/kernel/digest-source.ts";
import { providerSet } from "../../../core/kernel/provider-saved.ts";
import { threadComments, threads } from "../../../core/kernel/schema.ts";
import { commentReadable, digestCoversThread, readGeneration } from "./thread-store.ts";

export function readableBody(
  db: Database,
  itemId: number,
  commentId: string | null,
  generation: number,
) {
  return db
    .select({ body: threadComments.body })
    .from(threadComments)
    .where(
      and(
        eq(threadComments.itemId, itemId),
        eq(threadComments.generation, generation),
        commentId === null ? sql`0` : eq(threadComments.id, commentId),
        eq(threadComments.kind, "comment"),
        commentReadable(),
      ),
    );
}

function threadRows(db: Database, itemId: number) {
  const readable = commentReadable();

  return db
    .select({
      id: threadComments.id,
      parentId: threadComments.parentId,
      depth: threadComments.depth,
      kind: threadComments.kind,
      eligible: threadComments.eligible,
      kept: threadComments.kept,
      readable: sql<boolean>`${readable}`.mapWith(Boolean),
      author: sql<string | null>`case when ${readable} then ${threadComments.author} end`,
      body: sql<string | null>`case when ${readable} then ${threadComments.body} end`,
      score: sql<number | null>`case when ${readable} then ${threadComments.score} end`,
      postedAt: sql<number | null>`case when ${readable} then ${threadComments.postedAt} end`,
    })
    .from(threadComments)
    .where(
      and(
        eq(threadComments.itemId, itemId),
        sql`${threadComments.generation} = ${readGeneration(itemId)}`,
      ),
    )
    .orderBy(asc(threadComments.position));
}

function threadReport(db: Database, itemId: number) {
  return db
    .select({
      reported: threads.reported,
      archivedAt: threads.archivedAt,
      generation: threads.generation,
      published: sql<boolean>`${digestCoversThread(itemId)}`.mapWith(Boolean),
      provider: sql<boolean>`${providerSet()}`.mapWith(Boolean),
      providerMayRead: sql<boolean>`${providerMayRead(sql`${itemId}`)}`.mapWith(Boolean),
      link: sql<
        string | null
      >`(select newest.post_link from ${threads} as newest where newest.item_id = ${threads}.item_id order by newest.generation desc limit 1)`,
    })
    .from(threads)
    .where(and(eq(threads.itemId, itemId), sql`${threads.generation} = ${readGeneration(itemId)}`));
}

export function threadReads(db: Database, itemId: number) {
  return [threadRows(db, itemId), threadReport(db, itemId)] as const;
}

export function commentsOf(
  rows: readonly CommentRow[],
  report: readonly Readonly<{
    reported: number | null;
    archivedAt: number | null;
    generation: number;
    published: boolean;
    provider: boolean;
    providerMayRead: boolean;
  }>[],
  postRevision: number,
  digest: Omit<ThreadReport["digest"], "provider" | "providerMayRead">,
): CommentsView {
  const [thread] = report;

  if (thread === undefined) return NO_COMMENTS;

  const {
    reported,
    archivedAt,
    generation,
    published,
    provider,
    providerMayRead: mayRead,
  } = thread;

  return commentsViewOf(rows, {
    reported,
    archive: archivedAt === null ? null : { at: archivedAt, withPost: generation === postRevision },
    published,
    digest: { ...digest, provider, providerMayRead: mayRead },
  });
}

function readableWhenKept(row: CommentRow): CommentRow {
  return { ...row, readable: row.kept };
}

export function keptNodesOf(...args: Readonly<Parameters<typeof commentsOf>>) {
  const [rows, ...rest] = args;

  return commentsOf(
    rows.map((row) => readableWhenKept(row)),
    ...rest,
  ).nodes;
}
