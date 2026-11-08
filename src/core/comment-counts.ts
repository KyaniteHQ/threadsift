import { sql } from "drizzle-orm";

import { publishedGeneration } from "./reddit-thread.ts";
import { items, redditComments, redditThreads } from "./schema.ts";

const GENERATION = publishedGeneration(items.id);

const PUBLISHED_THREAD = sql`${redditThreads.itemId} = ${items.id} and ${redditThreads.generation} = (${GENERATION})`;

export const COMMENT_COUNT_COLUMNS = {
  commentsKept: sql<
    number | null
  >`case when exists (select 1 from ${redditThreads} where ${PUBLISHED_THREAD}) then (select count(*) from ${redditComments} where ${redditComments.itemId} = ${items.id} and ${redditComments.generation} = (${GENERATION}) and ${redditComments.kept} = 1) end`.as(
    "comments_kept",
  ),
  commentsTotal: sql<
    number | null
  >`(select max(coalesce(${redditThreads.reported}, 0), (select count(*) from ${redditComments} where ${redditComments.itemId} = ${items.id} and ${redditComments.generation} = ${redditThreads.generation} and ${redditComments.kind} = 'comment')) from ${redditThreads} where ${PUBLISHED_THREAD})`.as(
    "comments_total",
  ),
};
