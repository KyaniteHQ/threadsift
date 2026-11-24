import {
  type SQL,
  type SQLWrapper,
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  lte,
  sql,
} from "drizzle-orm";
import { z } from "zod";

import type { Database } from "../../../core/kernel/database.ts";
import { digestField } from "../../../core/kernel/digest-stored.ts";
import { logFailure } from "../../../core/kernel/failure-log.ts";
import { digests, items, topicChecks, topics } from "../../../core/kernel/schema.ts";
import {
  type DisagreementFill,
  EMPTY_FILL,
  disagreementInput,
  extendFill,
  hasNoRoomForAnother,
} from "./disagreement-fill.ts";
import { decidedPairs } from "./disagreement-pins.ts";
import { DISAGREEMENT_ITEMS, type SentItem, type SentTopic } from "./disagreement-task.ts";
import { digestedCount } from "./topic-coverage.ts";

const TOPICS_PAGE = 20;

export function membersOf(topicId: Readonly<SQLWrapper>): SQL<string | null> {
  return sql`(select group_concat(newest.id || ':' || newest.digest, ',' order by newest.id) from (select member.id as id, kept.task_id as digest from ${items} as member join ${digests} as kept on kept.item_id = member.id where member.topic_id = ${topicId} order by member.saved_at desc, member.id desc limit ${DISAGREEMENT_ITEMS}) as newest)`;
}

function newestDigestAt(topicId: Readonly<SQLWrapper>): SQL<number> {
  return sql`(select max(kept.created_at) from ${items} as member join ${digests} as kept on kept.item_id = member.id where member.topic_id = ${topicId})`;
}

function touched(topicId: Readonly<SQLWrapper>): SQL {
  return sql`${digestedCount(topicId)} >= 2 and ${membersOf(topicId)} is not (select ${topicChecks.members} from ${topicChecks} where ${topicChecks.topicId} = ${topicId})`;
}

interface Place {
  readonly id: number;
  readonly newest: number;
}

function topicsAfter(db: Database, place: Readonly<Place> | null) {
  const newest = newestDigestAt(topics.id);

  return db
    .select({ id: topics.id, newest: sql<number>`${newest}`.as("newest") })
    .from(topics)
    .where(
      and(
        touched(topics.id),
        place === null
          ? undefined
          : sql`(${newest} < ${place.newest} or (${newest} = ${place.newest} and ${topics.id} > ${place.id}))`,
      ),
    )
    .orderBy(desc(sql`newest`), asc(topics.id))
    .limit(TOPICS_PAGE);
}

function newestItemsOf(db: Database, topicIds: readonly number[]) {
  const compared = db
    .select({
      topicId: sql<number>`${items.topicId}`.as("topic_id"),
      itemId: sql<number>`${items.id}`.as("item_id"),
      digest: sql<number>`${digests.taskId}`.as("digest"),
      title: digestField("title", digests.digest).as("title"),
      summary: digestField("summary", digests.digest).as("summary"),
      place:
        sql<number>`row_number() over (partition by ${items.topicId} order by ${items.savedAt} desc, ${items.id} desc)`.as(
          "place",
        ),
    })
    .from(items)
    .innerJoin(digests, eq(digests.itemId, items.id))
    .where(and(isNotNull(items.topicId), inArray(items.topicId, [...topicIds])))
    .as("compared");

  return db
    .select({
      topicId: compared.topicId,
      name: topics.name,
      members: membersOf(topics.id),
      itemId: compared.itemId,
      digest: compared.digest,
      title: compared.title,
      summary: compared.summary,
    })
    .from(compared)
    .innerJoin(topics, eq(topics.id, compared.topicId))
    .where(lte(compared.place, DISAGREEMENT_ITEMS))
    .orderBy(asc(compared.topicId), asc(compared.place));
}

type ReadRow = Awaited<ReturnType<typeof newestItemsOf>>[number];

const ReadableSchema = z.object({ title: z.string(), summary: z.string() });

function readableItem(row: Readonly<ReadRow>): readonly SentItem[] {
  const readable = ReadableSchema.safeParse(row);

  if (readable.success) return [{ id: row.itemId, digest: row.digest, ...readable.data }];

  logFailure("topic-digest-unreadable", { itemId: row.itemId }, readable.error);

  return [];
}

function candidateOf(rows: readonly Readonly<ReadRow>[]): SentTopic | null {
  const [first] = rows;

  if (first?.members === null || first === undefined) return null;

  const readable = rows.flatMap((row) => readableItem(row));

  return readable.length < 2
    ? null
    : { id: first.topicId, name: first.name, members: first.members, items: readable };
}

async function withPage(
  db: Database,
  fill: Readonly<DisagreementFill>,
  page: readonly Readonly<Place>[],
): Promise<DisagreementFill> {
  const rows = await newestItemsOf(
    db,
    page.map(({ id }) => id),
  );

  const found = page.flatMap(({ id }) => {
    const candidate = candidateOf(rows.filter(({ topicId }) => topicId === id));

    return candidate === null ? [] : [candidate];
  });

  const decided = await decidedPairs(
    db,
    found.flatMap(({ items: each }) => each.map(({ id }) => id)),
  );

  return extendFill(fill, found, decided);
}

async function gather(
  db: Database,
  fill: Readonly<DisagreementFill>,
  place: Readonly<Place> | null,
): Promise<DisagreementFill> {
  const page = await topicsAfter(db, place);
  const last = page.at(-1);

  if (last === undefined) return fill;

  const next = await withPage(db, fill, page);

  return page.length < TOPICS_PAGE || hasNoRoomForAnother(next) ? next : gather(db, next, last);
}

export async function readDisagreementInput(db: Database) {
  const fill = await gather(db, EMPTY_FILL, null);

  return fill.sent.length === 0
    ? null
    : { input: disagreementInput(fill), inputRevision: 0, sent: fill.sent };
}
