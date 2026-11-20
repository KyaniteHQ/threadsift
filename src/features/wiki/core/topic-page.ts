import { and, count, desc, eq, inArray, sql } from "drizzle-orm";

import { type ItemCursor, formatCursor } from "../../../core/contract/item-cursor.ts";
import { PAGE_SIZE, pageTail } from "../../../core/contract/paging.ts";
import {
  type BuiltFrom,
  type Overview,
  type TopicPage,
  citedIds,
  overviewState,
} from "../../../core/contract/topic-overview-contract.ts";
import type { Database } from "../../../core/kernel/database.ts";
import { providerSet } from "../../../core/kernel/provider-saved.ts";
import { digests, items, topicPages } from "../../../core/kernel/schema.ts";
import { readDisagreements } from "./known-disagreements.ts";
import { hasOpenOverview, notBuiltFrom } from "./topic-coverage.ts";
import { topicOfKey } from "./topic-lookup.ts";

function pageQuery(db: Database, topicId: number, cursor: Readonly<ItemCursor> | null) {
  const after =
    cursor === null
      ? undefined
      : sql`(${items.savedAt}, ${items.id}) < (${cursor.savedAt}, ${cursor.id})`;

  return db
    .select({
      id: items.id,
      source: items.source,
      savedAt: items.savedAt,
      readState: items.readState,
      title: digests.title,
      summary: sql<string>`json_extract(${digests.digest}, '$.summary')`,
      digest: digests.taskId,
    })
    .from(items)
    .innerJoin(digests, eq(digests.itemId, items.id))
    .where(and(eq(items.topicId, topicId), after))
    .orderBy(desc(items.savedAt), desc(items.id))
    .limit(PAGE_SIZE + 1);
}

function overviewReads(db: Database, topicId: number) {
  return db.batch([
    db
      .select({
        overview: topicPages.overview,
        builtFrom: topicPages.builtFrom,
        failure: topicPages.failure,
      })
      .from(topicPages)
      .where(eq(topicPages.topicId, topicId)),
    db
      .select({
        total: count(),
        built: sql<number>`coalesce(sum(case when not (${notBuiltFrom(topicId, sql`${items.id}`, sql`${digests.taskId}`)}) then 1 else 0 end), 0)`,
      })
      .from(items)
      .innerJoin(digests, eq(digests.itemId, items.id))
      .where(eq(items.topicId, topicId)),
    db
      .select({
        pending: sql<number>`${hasOpenOverview(topicId)}`,
        provider: sql<number>`${providerSet()}`,
      })
      .from(sql`(select 1)`),
  ]);
}

interface Cited {
  readonly id: number;
  readonly title: string;
}

function citedTitles(db: Database, topicId: number, text: string | null): Promise<Cited[]> {
  const ids = text === null ? [] : citedIds(text);

  if (ids.length === 0) return Promise.resolve([]);

  return db
    .select({ id: items.id, title: digests.title })
    .from(items)
    .innerJoin(digests, eq(digests.itemId, items.id))
    .where(and(eq(items.topicId, topicId), inArray(items.id, ids)));
}

interface TopicOverviewRead {
  readonly overview: Overview;
  readonly total: number;
  readonly builtFrom: BuiltFrom;
}

export async function readTopicOverview(db: Database, topicId: number): Promise<TopicOverviewRead> {
  const [[page], [counts], [flags]] = await overviewReads(db, topicId);
  const failure = page?.failure ?? null;
  const cited = await citedTitles(db, topicId, page?.overview ?? null);

  return {
    total: counts?.total ?? 0,
    builtFrom: page?.builtFrom ?? [],
    overview: {
      state: overviewState({ open: flags?.pending === 1, failure }),
      text: page?.overview ?? null,
      cited,
      builtFrom: counts?.built ?? 0,
      provider: flags?.provider === 1,
      failure,
    },
  };
}

export async function readTopicPage(
  db: Database,
  keyText: string,
  cursor: Readonly<ItemCursor> | null,
): Promise<TopicPage | undefined> {
  const topic = await topicOfKey(db, keyText);

  if (topic === null) return undefined;

  const [rows, { overview, total, builtFrom }, disagreements] = await Promise.all([
    pageQuery(db, topic.id, cursor),
    readTopicOverview(db, topic.id),
    readDisagreements(db, topic.id),
  ]);

  const built = new Map(builtFrom.map(({ item, digest }) => [item, digest]));
  const page = pageTail(rows, PAGE_SIZE, formatCursor);

  return {
    topic: { key: topic.key, name: topic.name, itemCount: total },
    overview,
    disagreements,
    items: page.items.map((row) => ({
      id: row.id,
      source: row.source,
      title: row.title,
      summary: row.summary,
      savedAt: row.savedAt,
      read: row.readState === "read",
      inOverview: built.get(row.id) === row.digest,
    })),
    next: page.next,
  };
}
