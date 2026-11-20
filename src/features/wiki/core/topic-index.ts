import { asc, count, eq, gt } from "drizzle-orm";

import { PAGE_SIZE, pageTail } from "../../../core/contract/paging.ts";
import type { TopicIndex } from "../../../core/contract/topic-index-contract.ts";
import { overviewLine } from "../../../core/contract/topic-overview-contract.ts";
import { TOPIC_USES } from "../../../core/kernel/catalog-uses.ts";
import type { Database } from "../../../core/kernel/database.ts";
import { topicPages, topics } from "../../../core/kernel/schema.ts";

export function topicIndexRows(db: Database, cursor: string | null, limit: number) {
  return db
    .select({
      id: topics.id,
      key: topics.key,
      name: topics.name,
      itemCount: TOPIC_USES,
      overview: topicPages.overview,
    })
    .from(topics)
    .leftJoin(topicPages, eq(topicPages.topicId, topics.id))
    .where(cursor === null ? undefined : gt(topics.key, cursor))
    .orderBy(asc(topics.key))
    .limit(limit);
}

export async function readTopicIndex(db: Database, cursor: string | null): Promise<TopicIndex> {
  const [rows, [totals]] = await db.batch([
    topicIndexRows(db, cursor, PAGE_SIZE + 1),
    db.select({ total: count() }).from(topics),
  ]);

  const { items, next } = pageTail(rows, PAGE_SIZE, ({ key }) => key);

  return {
    topics: items.map(({ key, name, itemCount, overview }) => ({
      key,
      name,
      itemCount,
      overviewLine: overview === null ? null : overviewLine(overview),
    })),
    total: totals?.total ?? 0,
    next,
  };
}
