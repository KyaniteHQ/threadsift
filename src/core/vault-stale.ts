import { type SQL, type SQLWrapper, eq, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import type { Database } from "./database.ts";
import { disagreementInTopic } from "./disagreement-sql.ts";
import { itemTitle } from "./item-title.ts";
import { digests, items, logEntries, pins, relatedItems, topics } from "./schema.ts";
import { logMonthAt, logMonthColumn } from "./vault-log-month.ts";
import { queueVaultNotes } from "./vault-queue.ts";
import { type VaultKind, vaultSettings } from "./vault-tables.ts";

type When = Readonly<SQLWrapper>;

function itemNotes(db: Database, when: When) {
  return queueVaultNotes(db, { kind: "item", id: items.id, from: items, when });
}

function topicNotes(db: Database, when: When) {
  return queueVaultNotes(db, { kind: "topic", id: topics.id, from: topics, when });
}

function indexNote(db: Database, when: When) {
  return queueVaultNotes(db, { kind: "index", id: 0, when });
}

function logNote(db: Database, when: When) {
  return queueVaultNotes(db, { kind: "log", id: 0, when });
}

function logMonthNotes(db: Database, when: When) {
  const months = db
    .selectDistinct({ month: logMonthColumn(logEntries.at).as("month") })
    .from(logEntries)
    .where(sql`${when}`)
    .as("months");

  return queueVaultNotes(db, {
    kind: "log-month",
    id: sql`months.month`,
    from: sql`${months}`,
    when: sql`months.month is not null`,
  });
}

function topicOfItem(itemId: number) {
  return sql`(select ${items.topicId} from ${items} where ${items.id} = ${itemId})`;
}

function linkingItemNotes(db: Database, targets: When) {
  return itemNotes(
    db,
    sql`${items.id} in (select ${relatedItems.itemId} from ${relatedItems} where ${relatedItems.relatedId} in (${targets}))`,
  );
}

type EveryKind<Kinds extends readonly VaultKind[]> = [Exclude<VaultKind, Kinds[number]>] extends [
  never,
]
  ? Kinds
  : never;

const QUEUE_ORDER = ["item", "topic", "index", "log-month", "log"] as const;

const LIBRARY_ORDER: EveryKind<typeof QUEUE_ORDER> = QUEUE_ORDER;

const WHOLE_LIBRARY = {
  item: (db) => itemNotes(db, sql`1`),
  topic: (db) => topicNotes(db, sql`1`),
  index: (db) => indexNote(db, sql`1`),
  "log-month": (db) => logMonthNotes(db, sql`1`),
  log: (db) => logNote(db, sql`1`),
} as const satisfies Readonly<Record<VaultKind, (db: Database) => BatchItem<"sqlite">>>;

export const STALE = {
  itemChanged: (db: Database, when: When) => [itemNotes(db, when)] as const,

  fetchedTitle(db: Database, item: When, title: string | null) {
    const changed = db
      .select({ id: items.id, topic: items.topicId })
      .from(items)
      .leftJoin(digests, eq(digests.itemId, items.id))
      .where(sql`${item} and ${digests.title} is null and ${items.title} is not ${title}`)
      .as("changed_title");

    return [
      topicNotes(db, sql`${topics.id} in (select topic_id from ${changed})`),
      linkingItemNotes(db, sql`select id from ${changed}`),
    ] as const;
  },

  digestLinked(
    db: Database,
    { itemId, title, topicKey }: Readonly<{ itemId: number; title: string; topicKey: string }>,
  ) {
    const oldTopic = topicOfItem(itemId);
    const nextTopic = sql`(select ${topics.id} from ${topics} where ${topics.key} = ${topicKey})`;
    const moved = sql`${oldTopic} is not ${nextTopic}`;
    const titleChanged = sql`(select ${itemTitle()} from ${items} left join ${digests} on ${digests.itemId} = ${items.id} where ${items.id} = ${itemId}) is not ${title}`;
    const agreementChanged = sql`exists (select 1 from ${pins} where ${disagreementInTopic(oldTopic)} and (${pins.fromItemId} = ${itemId} or ${pins.intoItemId} = ${itemId}))`;

    return [
      topicNotes(
        db,
        sql`${topics.id} in (${oldTopic}, ${nextTopic}) and (${moved} or ${titleChanged} or ${agreementChanged})`,
      ),
      indexNote(db, moved),
      linkingItemNotes(db, sql`select ${itemId} where ${titleChanged}`),
    ] as const;
  },

  topicMoved(
    db: Database,
    {
      loser,
      survivor,
      moving,
    }: Readonly<{ loser: number; survivor: number; moving: SQL | undefined }>,
  ) {
    const moved = sql`exists (select 1 from ${items} where ${moving})`;

    return [
      itemNotes(db, sql`${moving}`),
      topicNotes(db, sql`${topics.id} in (${loser}, ${survivor}) and ${moved}`),
      indexNote(db, moved),
    ] as const;
  },

  topicMerged(db: Database, { from, gone }: Readonly<{ from: number; gone: When }>) {
    return [topicNotes(db, sql`${topics.id} = ${from} and ${gone}`), indexNote(db, gone)] as const;
  },

  overviewText: (db: Database, topicId: number) =>
    [topicNotes(db, eq(topics.id, topicId))] as const,

  overviewLine: (db: Database) => [indexNote(db, sql`1`)] as const,

  disagreementAccepted: (db: Database, itemId: number) =>
    [topicNotes(db, sql`${topics.id} = ${topicOfItem(itemId)} and changes() > 0`)] as const,

  itemDeleted(db: Database, itemId: number) {
    const topic = topicOfItem(itemId);

    return [
      itemNotes(db, eq(items.id, itemId)),
      topicNotes(db, eq(topics.id, topic)),
      indexNote(db, sql`${topic} is not null`),
      logMonthNotes(db, eq(logEntries.itemId, itemId)),
      linkingItemNotes(db, sql`select ${itemId}`),
    ] as const;
  },

  logAppended: (db: Database, at: number) =>
    [
      queueVaultNotes(db, { kind: "log-month", id: logMonthAt(at), when: sql`changes() > 0` }),
    ] as const,

  monthNoteListed: (db: Database, held: When) => [logNote(db, held)] as const,

  library: (db: Database) =>
    [
      ...LIBRARY_ORDER.map((kind) => WHOLE_LIBRARY[kind](db)),
      db.update(vaultSettings).set({ scanPending: true }),
    ] as const,
};
