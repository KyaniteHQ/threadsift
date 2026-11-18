import { type SQLWrapper, eq, sql } from "drizzle-orm";

import { currentDisagreementPin } from "./disagreement-pins.ts";
import { itemTitle } from "./item-title.ts";
import type { Database } from "./ports.ts";
import { digests, items, logEntries, pins, relatedItems, topics } from "./schema.ts";
import {
  queueVaultIndex,
  queueVaultItems,
  queueVaultLog,
  queueVaultTopics,
} from "./vault-queue.ts";

export function vaultTopicOf(itemId: number) {
  return sql`(select ${items.topicId} from ${items} where ${items.id} = ${itemId})`;
}

function incomingLinks(db: Database, targets: Readonly<SQLWrapper>) {
  return queueVaultItems(
    db,
    sql`${items.id} in (select ${relatedItems.itemId} from ${relatedItems} where ${relatedItems.relatedId} in (${targets}))`,
  );
}

export function queueVaultFetchedTitle(
  db: Database,
  item: Readonly<SQLWrapper>,
  title: string | null,
) {
  const changed = db
    .select({ id: items.id, topic: items.topicId })
    .from(items)
    .leftJoin(digests, eq(digests.itemId, items.id))
    .where(sql`${item} and ${digests.title} is null and ${items.title} is not ${title}`)
    .as("changed_title");

  return [
    queueVaultTopics(db, sql`${topics.id} in (select topic_id from ${changed})`),
    incomingLinks(db, sql`select id from ${changed}`),
  ];
}

export function queueVaultDigestWiki(
  db: Database,
  { itemId, title, topicKey }: Readonly<{ itemId: number; title: string; topicKey: string }>,
) {
  const oldTopic = vaultTopicOf(itemId);
  const nextTopic = sql`(select ${topics.id} from ${topics} where ${topics.key} = ${topicKey})`;
  const moved = sql`${oldTopic} is not ${nextTopic}`;
  const titleChanged = sql`(select ${itemTitle()} from ${items} left join ${digests} on ${digests.itemId} = ${items.id} where ${items.id} = ${itemId}) is not ${title}`;
  const agreementChanged = sql`exists (select 1 from ${pins} join items as other on other.id = case when ${pins.fromItemId} = ${itemId} then ${pins.intoItemId} else ${pins.fromItemId} end where ${currentDisagreementPin()} and (${pins.fromItemId} = ${itemId} or ${pins.intoItemId} = ${itemId}) and other.topic_id = ${oldTopic})`;

  return [
    queueVaultTopics(
      db,
      sql`${topics.id} in (${oldTopic}, ${nextTopic}) and (${moved} or ${titleChanged} or ${agreementChanged})`,
    ),
    queueVaultIndex(db, moved),
    incomingLinks(db, sql`select ${itemId} where ${titleChanged}`),
  ];
}

export function queueVaultItemDeletion(db: Database, itemId: number) {
  const topic = vaultTopicOf(itemId);

  return [
    queueVaultItems(db, eq(items.id, itemId)),
    queueVaultTopics(db, eq(topics.id, topic)),
    queueVaultIndex(db, sql`${topic} is not null`),
    queueVaultLog(
      db,
      sql`exists (select 1 from ${logEntries} where ${logEntries.itemId} = ${itemId})`,
    ),
    incomingLinks(db, sql`select ${itemId}`),
  ] as const;
}
