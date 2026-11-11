import { asc, count, eq, gt, sql } from "drizzle-orm";

import { ITEMS_PAGE_SIZE } from "./item-page.ts";
import type { Database } from "./ports.ts";
import { items, topicPages, topics } from "./schema.ts";
import type { TopicIndex } from "./topic-index-contract.ts";
import { overviewLine } from "./topic-overview-contract.ts";

function pageQuery(db: Database, cursor: string | null) {
  return db
    .select({
      key: topics.key,
      name: topics.name,
      itemCount: sql<number>`(select count(*) from ${items} where ${items.topicId} = ${topics.id})`,
      overview: topicPages.overview,
    })
    .from(topics)
    .leftJoin(topicPages, eq(topicPages.topicId, topics.id))
    .where(cursor === null ? undefined : gt(topics.key, cursor))
    .orderBy(asc(topics.key))
    .limit(ITEMS_PAGE_SIZE + 1);
}

export async function readTopicIndex(db: Database, cursor: string | null): Promise<TopicIndex> {
  const [rows, [totals]] = await db.batch([
    pageQuery(db, cursor),
    db.select({ total: count() }).from(topics),
  ]);

  const shown = rows.slice(0, ITEMS_PAGE_SIZE);
  const last = shown.at(-1);

  return {
    topics: shown.map(({ key, name, itemCount, overview }) => ({
      key,
      name,
      itemCount,
      overviewLine: overview === null ? null : overviewLine(overview),
    })),
    total: totals?.total ?? 0,
    next: rows.length > shown.length && last !== undefined ? last.key : null,
  };
}
