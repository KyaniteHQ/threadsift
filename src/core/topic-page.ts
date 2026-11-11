import { and, count, desc, eq, inArray, sql } from "drizzle-orm";

import { providerSet } from "./ai-tasks.ts";
import { catalogKey } from "./catalog.ts";
import { type ItemCursor, ITEMS_PAGE_SIZE, formatCursor } from "./item-page.ts";
import type { Database } from "./ports.ts";
import { digests, items, topicPages, topics } from "./schema.ts";
import { notBuiltFrom } from "./topic-coverage.ts";
import {
  type BuiltFrom,
  type Overview,
  type TopicPage,
  citedIds,
} from "./topic-overview-contract.ts";
import { topicKeyOfSegment } from "./topic-path.ts";

export interface TopicRow {
  readonly id: number;
  readonly key: string;
  readonly name: string;
}

export async function topicOfKey(db: Database, text: string): Promise<TopicRow | null> {
  const key = catalogKey(topicKeyOfSegment(text));

  if (key === "") return null;

  const [topic] = await db
    .select({ id: topics.id, key: topics.key, name: topics.name })
    .from(topics)
    .where(eq(topics.key, key));

  return topic ?? null;
}

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
    .limit(ITEMS_PAGE_SIZE + 1);
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
        pending: sql<number>`exists (select 1 from jobs as open_overview join items as owner on owner.id = open_overview.item_id where open_overview.kind = 'topic_overview' and open_overview.state <> 'done' and owner.topic_id = ${topicId})`,
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
      state: flags?.pending === 1 ? "pending" : failure === null ? "idle" : "failed",
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

  const [rows, { overview, total, builtFrom }] = await Promise.all([
    pageQuery(db, topic.id, cursor),
    readTopicOverview(db, topic.id),
  ]);

  const built = new Map(builtFrom.map(({ item, digest }) => [item, digest]));
  const shown = rows.slice(0, ITEMS_PAGE_SIZE);
  const last = shown.at(-1);

  return {
    topic: { key: topic.key, name: topic.name, itemCount: total },
    overview,
    items: shown.map((row) => ({
      id: row.id,
      source: row.source,
      title: row.title,
      summary: row.summary,
      savedAt: row.savedAt,
      read: row.readState === "read",
      inOverview: built.get(row.id) === row.digest,
    })),
    next:
      rows.length > shown.length && last !== undefined
        ? formatCursor({ savedAt: last.savedAt, id: last.id })
        : null,
  };
}
