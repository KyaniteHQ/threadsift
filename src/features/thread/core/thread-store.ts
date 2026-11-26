import { type SQL, type SQLWrapper, and, eq, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { REDDIT_KINDS, type ThreadSource } from "../../../core/contract/item-contract.ts";
import type { Database } from "../../../core/kernel/database.ts";
import { guardHolds } from "../../../core/kernel/guards.ts";
import { listed } from "../../../core/kernel/schema-checks.ts";
import {
  digests,
  highlights,
  items,
  threadComments,
  threads,
} from "../../../core/kernel/schema.ts";
import type { StoredThread } from "./stored-thread.ts";
import { jsonArrays, rowJson } from "./thread-rows.ts";

export function commentReadable(): SQL<boolean> {
  const covered = sql`${threadComments}.generation in (${publishedGeneration(sql`${threadComments}.item_id`)})`;
  const held = sql`exists (select 1 from ${highlights} where ${highlights.itemId} = ${threadComments}.item_id and ${highlights.status} = 'attached' and ${highlights.commentId} = ${threadComments}.id)`;

  return sql<boolean>`(${threadComments.kept} = 1 or ${held} or (${threadComments.eligible} = 1 and not ${covered}))`;
}

export interface Owner {
  readonly id: Readonly<SQLWrapper>;
  readonly source: Readonly<SQLWrapper>;
  readonly generation: Readonly<SQLWrapper>;
}

export function ownerOfItem(itemId: number): Owner {
  return {
    id: sql`${itemId}`,
    source: sql`(select ${items.source} from ${items} where ${items.id} = ${itemId})`,
    generation: sql`(select ${items.generation} from ${items} where ${items.id} = ${itemId})`,
  };
}

export function ownerOf(normalizedUrl: string): Owner {
  const at = sql`from ${items} where ${items.normalizedUrl} = ${normalizedUrl}`;

  return {
    id: sql`(select ${items.id} ${at})`,
    source: sql`(select ${items.source} ${at})`,
    generation: sql`(select ${items.generation} ${at})`,
  };
}

function supersededDeletes(db: Database, owner: Readonly<Owner>) {
  const published = sql`(select ${digests.generation} from ${digests} where ${digests.itemId} = ${owner.id})`;

  return [
    db
      .delete(threadComments)
      .where(
        and(
          eq(threadComments.itemId, owner.id),
          sql`${threadComments.generation} is not ${published}`,
        ),
      ),
    db
      .delete(threads)
      .where(and(eq(threads.itemId, owner.id), sql`${threads.generation} is not ${published}`)),
  ];
}

function headerInsert(
  db: Database,
  owner: Readonly<Owner>,
  {
    reported,
    linkedUrl,
    postLink,
    followUps,
  }: Readonly<Pick<StoredThread, "reported" | "linkedUrl" | "postLink" | "followUps">>,
  archivedAt: number | null,
) {
  return db.insert(threads).select(
    db
      .select({
        itemId: sql<number>`${owner.id}`.as("item_id"),
        source: sql<ThreadSource>`${owner.source}`.as("source"),
        generation: sql<number>`${owner.generation}`.as("generation"),
        reported: sql<number | null>`${reported}`.as("reported"),
        archivedAt: sql<number | null>`${archivedAt}`.as("archived_at"),
        linkedUrl: sql<string | null>`${linkedUrl}`.as("linked_url"),
        postLink: sql<string | null>`${postLink}`.as("post_link"),
        followUps: sql<number>`${followUps ?? 0}`.as("follow_ups"),
      })
      .from(sql`(select 1)`)
      .where(sql`1`),
  );
}

function commentInsert(db: Database, owner: Readonly<Owner>, json: string) {
  return db.insert(threadComments).select(
    db
      .select({
        itemId: sql<number>`${owner.id}`.as("item_id"),
        source: sql<ThreadSource>`${owner.source}`.as("source"),
        generation: sql<number>`${owner.generation}`.as("generation"),
        position: sql<number>`json_extract(value, '$.position')`.as("position"),
        id: sql<string>`json_extract(value, '$.id')`.as("id"),
        parentId: sql<string | null>`json_extract(value, '$.parentId')`.as("parent_id"),
        depth: sql<number>`json_extract(value, '$.depth')`.as("depth"),
        kind: sql<"comment" | "more">`json_extract(value, '$.kind')`.as("kind"),
        author: sql<string | null>`json_extract(value, '$.author')`.as("author"),
        body: sql<string | null>`json_extract(value, '$.body')`.as("body"),
        score: sql<number | null>`json_extract(value, '$.score')`.as("score"),
        postedAt: sql<number | null>`json_extract(value, '$.postedAt')`.as("posted_at"),
        eligible: sql<boolean>`json_extract(value, '$.eligible')`.as("eligible"),
        kept: sql<boolean>`0`.as("kept"),
      })
      .from(sql`json_each(${json})`)
      .where(sql`1`),
  );
}

export function threadWrites(
  db: Database,
  owner: Readonly<Owner>,
  thread: Readonly<StoredThread>,
  archivedAt: number | null,
): readonly BatchItem<"sqlite">[] {
  return [
    ...supersededDeletes(db, owner),
    headerInsert(db, owner, thread, archivedAt),
    ...jsonArrays(thread.nodes.map((node) => rowJson(node))).map((json) =>
      commentInsert(db, owner, json),
    ),
  ];
}

function publishedGeneration(itemId: number | Readonly<SQLWrapper>) {
  return sql`select ${threads.generation} from ${threads} join ${digests} on ${digests.itemId} = ${threads.itemId} and ${digests.generation} = ${threads.generation} where ${threads.itemId} = ${itemId}`;
}

export function digestCoversThread(itemId: number | Readonly<SQLWrapper>): SQL {
  return sql`exists (${publishedGeneration(itemId)})`;
}

export function readGeneration(itemId: number | Readonly<SQLWrapper>) {
  const published = publishedGeneration(itemId);
  const stored = sql`select max(${threads.generation}) from ${threads} where ${threads.itemId} = ${itemId}`;

  return sql<number | null>`coalesce((${published}), (${stored}))`;
}

export function holdsNoThread(db: Database, itemId: number): Promise<boolean> {
  return guardHolds(db, noThreadFor(itemId));
}

function noThreadFor(itemId: number | Readonly<SQLWrapper>): SQL {
  return sql`${readGeneration(itemId)} is null`;
}

export function hasNoThread(normalizedUrl: string): SQL {
  return noThreadFor(ownerOf(normalizedUrl).id);
}

export function awaitsThread(normalizedUrl: string): SQL {
  return sql`exists (select 1 from ${items} where ${items.normalizedUrl} = ${normalizedUrl}) and ${hasNoThread(normalizedUrl)}`;
}

export function repliesOf({
  nodes,
  followUps = 0,
}: Readonly<Pick<StoredThread, "nodes" | "followUps">>): number {
  return nodes.filter(({ kind }) => kind === "comment").length + followUps;
}

function storedReplies(itemId: number | Readonly<SQLWrapper>) {
  const generation = sql`max(coalesce((select max(newest.generation) from ${threadComments} as newest where newest.item_id = ${itemId} and newest.kind = 'comment'), -1), coalesce((select max(joined.generation) from ${threads} as joined where joined.item_id = ${itemId} and joined.follow_ups > 0), -1))`;

  return sql<number>`((select count(*) from ${threadComments} as kept where kept.item_id = ${itemId} and kept.kind = 'comment' and kept.generation = ${generation}) + coalesce((select stored.follow_ups from ${threads} as stored where stored.item_id = ${itemId} and stored.generation = ${generation}), 0))`;
}

export function holdsAtLeastStored(itemId: number | Readonly<SQLWrapper>, replies: number) {
  return sql`${replies} >= ${storedReplies(itemId)}`;
}

export async function storedReplyCount(
  db: Database,
  itemId: number | Readonly<SQLWrapper>,
): Promise<number> {
  const [row] = await db.select({ stored: storedReplies(itemId) }).from(sql`(select 1)`);

  return row?.stored ?? 0;
}

export async function fewerThanStored(
  db: Database,
  owner: Readonly<Owner>,
  thread: Readonly<Pick<StoredThread, "nodes" | "followUps">>,
): Promise<boolean> {
  return repliesOf(thread) < (await storedReplyCount(db, owner.id));
}

const OF_READ_THREAD = sql`${threadComments.itemId} = ${items.id} and ${threadComments.generation} = (${readGeneration(items.id)}) and ${threadComments.kind} = 'comment'`;

export const COMMENT_COUNT_COLUMNS = {
  commentsPublished: sql<boolean>`${digestCoversThread(items.id)}`
    .mapWith(Boolean)
    .as("comments_published"),
  commentsReceived:
    sql<number>`(select count(*) from ${threadComments} where ${OF_READ_THREAD})`.as(
      "comments_received",
    ),
  commentsShown:
    sql<number>`(select count(*) from ${threadComments} where ${OF_READ_THREAD} and ${commentReadable()})`.as(
      "comments_shown",
    ),
  commentsReported: sql<
    number | null
  >`(select ${threads.reported} from ${threads} where ${threads.itemId} = ${items.id} and ${threads.generation} = (${readGeneration(items.id)}))`.as(
    "comments_reported",
  ),
};

export const FILLABLE_COLUMNS = {
  fillable: sql<boolean>`(${items.kind} in (${listed(REDDIT_KINDS)}) and ${noThreadFor(items.id)})`
    .mapWith(Boolean)
    .as("fillable"),
};
