import { sql } from "drizzle-orm";

import type { CommentCount } from "./comment-view.ts";
import { commentReadable, publishedGeneration, readGeneration } from "./reddit-thread.ts";
import { items, redditComments, redditThreads } from "./schema.ts";

const PUBLISHED = publishedGeneration(items.id);

const READ = readGeneration(items.id);

const OF_READ_THREAD = sql`${redditComments.itemId} = ${items.id} and ${redditComments.generation} = (${READ}) and ${redditComments.kind} = 'comment'`;

export const COMMENT_COUNT_COLUMNS = {
  commentsFilter: sql<
    CommentCount["filter"] | null
  >`case when (${READ}) is null or not exists (select 1 from ${redditComments} where ${OF_READ_THREAD}) then null when exists (${PUBLISHED}) then 'kept' else 'unfiltered' end`.as(
    "comments_filter",
  ),
  commentsShown: sql<
    number | null
  >`case when (${READ}) is null then null else (select count(*) from ${redditComments} where ${OF_READ_THREAD} and ${commentReadable()}) end`.as(
    "comments_shown",
  ),
  commentsOutOf: sql<
    number | null
  >`(select max(coalesce(${redditThreads.reported}, 0), (select count(*) from ${redditComments} where ${OF_READ_THREAD})) from ${redditThreads} where ${redditThreads.itemId} = ${items.id} and ${redditThreads.generation} = (${READ}))`.as(
    "comments_out_of",
  ),
};
