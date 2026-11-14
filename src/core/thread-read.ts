import { and, asc, eq, sql } from "drizzle-orm";

import {
  type CommentRow,
  type CommentsView,
  NO_COMMENTS,
  type ThreadReport,
  commentsViewOf,
} from "./comment-view.ts";
import type { Database } from "./ports.ts";
import { providerSet } from "./provider-saved.ts";
import { commentReadable, readGeneration } from "./reddit-thread.ts";
import { digests, redditComments, redditThreads } from "./schema.ts";

export function readableBody(
  db: Database,
  itemId: number,
  commentId: string | null,
  generation: number,
) {
  return db
    .select({ body: redditComments.body })
    .from(redditComments)
    .where(
      and(
        eq(redditComments.itemId, itemId),
        eq(redditComments.generation, generation),
        commentId === null ? sql`0` : eq(redditComments.id, commentId),
        eq(redditComments.kind, "comment"),
        commentReadable(),
      ),
    );
}

function threadRows(db: Database, itemId: number) {
  const readable = commentReadable();

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
      published: sql<boolean>`${digests.itemId} is not null`.mapWith(Boolean),
      provider: sql<boolean>`${providerSet()}`.mapWith(Boolean),
      link: sql<
        string | null
      >`(select newest.post_link from reddit_threads as newest where newest.item_id = ${redditThreads}.item_id order by newest.generation desc limit 1)`,
    })
    .from(redditThreads)
    .leftJoin(
      digests,
      and(
        eq(digests.itemId, redditThreads.itemId),
        eq(digests.generation, redditThreads.generation),
      ),
    )
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
  report: readonly Readonly<{
    reported: number | null;
    archivedAt: number | null;
    generation: number;
    published: boolean;
    provider: boolean;
  }>[],
  postRevision: number,
  digest: Omit<ThreadReport["digest"], "provider">,
): CommentsView {
  const [thread] = report;

  if (thread === undefined) return NO_COMMENTS;

  const { reported, archivedAt, generation, published, provider } = thread;

  return commentsViewOf(rows, {
    reported,
    archive: archivedAt === null ? null : { at: archivedAt, withPost: generation === postRevision },
    published,
    digest: { ...digest, provider },
  });
}
