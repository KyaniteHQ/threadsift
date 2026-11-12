import { type SQL, type SQLWrapper, and, asc, desc, eq, isNotNull, lte, sql } from "drizzle-orm";

import { parseStoredDigest } from "./ai-contract.ts";
import { fillDisagreementInput } from "./disagreement-fill.ts";
import { DISAGREEMENT_ITEMS, type SentItem, type SentTopic } from "./disagreement-task.ts";
import { logFailure } from "./failure-log.ts";
import type { Database } from "./ports.ts";
import { pairKey } from "./proposal-candidates.ts";
import { digests, items, proposals, topicChecks, topics } from "./schema.ts";
import { digestedCount } from "./topic-coverage.ts";

const TOPICS_READ = 150;

export function membersOf(topicId: Readonly<SQLWrapper>): SQL<string | null> {
  return sql`(select group_concat(newest.id || ':' || newest.digest, ',' order by newest.id) from (select member.id as id, kept.task_id as digest from ${items} as member join ${digests} as kept on kept.item_id = member.id where member.topic_id = ${topicId} order by member.saved_at desc, member.id desc limit ${DISAGREEMENT_ITEMS}) as newest)`;
}

function newestDigestAt(topicId: Readonly<SQLWrapper>): SQL<number> {
  return sql`(select max(kept.created_at) from ${items} as member join ${digests} as kept on kept.item_id = member.id where member.topic_id = ${topicId})`;
}

function touched(topicId: Readonly<SQLWrapper>): SQL {
  return sql`${digestedCount(topicId)} >= 2 and ${membersOf(topicId)} is not (select ${topicChecks.members} from ${topicChecks} where ${topicChecks.topicId} = ${topicId})`;
}

interface ReadRow {
  readonly topicId: number;
  readonly name: string;
  readonly members: string | null;
  readonly itemId: number;
  readonly digest: number;
  readonly stored: string;
}

function readableItem(row: Readonly<ReadRow>): readonly SentItem[] {
  try {
    const { title, summary } = parseStoredDigest(row.stored);

    return [{ id: row.itemId, digest: row.digest, title, summary }];
  } catch (error) {
    logFailure("topic-digest-unreadable", { itemId: row.itemId }, error);

    return [];
  }
}

function candidatesOf(rows: readonly Readonly<ReadRow>[]): readonly SentTopic[] {
  const byTopic = new Map<number, ReadRow[]>();

  for (const row of rows) byTopic.set(row.topicId, [...(byTopic.get(row.topicId) ?? []), row]);

  return [...byTopic.values()].flatMap((group) => {
    const [first] = group;

    return first === undefined || first.members === null
      ? []
      : [
          {
            id: first.topicId,
            name: first.name,
            members: first.members,
            items: group.flatMap((row) => readableItem(row)),
          },
        ];
  });
}

function touchedRows(db: Database) {
  const picked = db
    .select({ id: topics.id, newest: sql<number>`${newestDigestAt(topics.id)}`.as("newest") })
    .from(topics)
    .where(touched(topics.id))
    .orderBy(desc(sql`newest`), asc(topics.id))
    .limit(TOPICS_READ)
    .as("picked");

  const compared = db
    .select({
      topicId: sql<number>`${items.topicId}`.as("topic_id"),
      itemId: sql<number>`${items.id}`.as("item_id"),
      digest: sql<number>`${digests.taskId}`.as("digest"),
      stored: sql<string>`${digests.digest}`.as("stored"),
      place:
        sql<number>`row_number() over (partition by ${items.topicId} order by ${items.savedAt} desc, ${items.id} desc)`.as(
          "place",
        ),
    })
    .from(items)
    .innerJoin(digests, eq(digests.itemId, items.id))
    .where(isNotNull(items.topicId))
    .as("compared");

  return db
    .select({
      topicId: picked.id,
      name: topics.name,
      members: membersOf(sql`${picked.id}`),
      itemId: compared.itemId,
      digest: compared.digest,
      stored: compared.stored,
    })
    .from(picked)
    .innerJoin(topics, eq(topics.id, picked.id))
    .innerJoin(
      compared,
      and(eq(compared.topicId, picked.id), lte(compared.place, DISAGREEMENT_ITEMS)),
    )
    .orderBy(desc(picked.newest), asc(picked.id), asc(compared.place));
}

async function decidedPairs(db: Database, itemIds: readonly number[]): Promise<Set<string>> {
  const wanted = JSON.stringify(itemIds);

  const rows = await db
    .select({ from: proposals.fromItemId, into: proposals.intoItemId })
    .from(proposals)
    .where(
      and(
        eq(proposals.kind, "items-disagree"),
        sql`${proposals.fromItemId} in (select value from json_each(${wanted}))`,
        sql`${proposals.intoItemId} in (select value from json_each(${wanted}))`,
      ),
    );

  return new Set(
    rows.flatMap(({ from, into }) => (from === null || into === null ? [] : [pairKey(from, into)])),
  );
}

export async function readDisagreementInput(db: Database) {
  const candidates = candidatesOf(await touchedRows(db));
  const itemIds = candidates.flatMap(({ items: each }) => each.map(({ id }) => id));
  const decided = itemIds.length === 0 ? new Set<string>() : await decidedPairs(db, itemIds);
  const { input, sent } = fillDisagreementInput(candidates, decided);

  return sent.length === 0 ? null : { input, inputRevision: 0, sent };
}
