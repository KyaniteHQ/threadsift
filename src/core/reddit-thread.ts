import { type SQL, type SQLWrapper, and, asc, eq, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { type CommentRow, type CommentsView, NO_COMMENTS, commentsViewOf } from "./comment-view.ts";
import type { Database } from "./ports.ts";
import type { ParsedThread } from "./reddit-json.ts";
import { digests, items, redditComments, redditThreads } from "./schema.ts";
import { jsonArrays, rowJson } from "./thread-rows.ts";

export function eligibleComments(): SQL {
  return sql`exists (select 1 from ${redditComments} where ${redditComments.itemId} = ${items.id} and ${redditComments.generation} = ${items.generation} and ${redditComments.eligible} = 1)`;
}

export function keptCommentIds(): SQL<string> {
  return sql<string>`(select coalesce(json_group_array(id), '[]') from (select ${redditComments.id} as id from ${redditComments} join ${digests} on ${digests.itemId} = ${redditComments.itemId} and ${digests.generation} = ${redditComments.generation} where ${redditComments.itemId} = ${items.id} and ${redditComments.kept} = 1 order by ${redditComments.position}))`;
}

function selected(kept: readonly string[]): SQL {
  return sql`${redditComments.eligible} = 1 and ${redditComments.id} in (select value from json_each(${JSON.stringify(kept)}))`;
}

async function bodiesWhere(
  db: Database,
  snapshot: Readonly<{ itemId: number; generation: number }>,
  condition: Readonly<SQLWrapper>,
): Promise<readonly string[]> {
  const rows = await db
    .select({ body: redditComments.body })
    .from(redditComments)
    .where(
      and(
        eq(redditComments.itemId, snapshot.itemId),
        eq(redditComments.generation, snapshot.generation),
        sql`${condition}`,
      ),
    )
    .orderBy(asc(redditComments.position));

  return rows.flatMap(({ body }) => (body === null ? [] : [body]));
}

export function selectedBodies(
  db: Database,
  snapshot: Readonly<{ itemId: number; generation: number }>,
  kept: readonly string[],
): Promise<readonly string[]> {
  return bodiesWhere(db, snapshot, selected(kept));
}

export function keptBodies(
  db: Database,
  snapshot: Readonly<{ itemId: number; generation: number }>,
): Promise<readonly string[]> {
  return bodiesWhere(db, snapshot, eq(redditComments.kept, true));
}

interface Owner {
  readonly id: Readonly<SQLWrapper>;
  readonly generation: Readonly<SQLWrapper>;
}

export function ownerOf(normalizedUrl: string): Owner {
  const at = sql`from ${items} where ${items.normalizedUrl} = ${normalizedUrl}`;

  return {
    id: sql`(select ${items.id} ${at})`,
    generation: sql`(select ${items.generation} ${at})`,
  };
}

function supersededDeletes(db: Database, owner: Readonly<Owner>) {
  const published = sql`(select ${digests.generation} from ${digests} where ${digests.itemId} = ${owner.id})`;

  return [
    db
      .delete(redditComments)
      .where(
        and(
          eq(redditComments.itemId, owner.id),
          sql`${redditComments.generation} is not ${published}`,
        ),
      ),
    db
      .delete(redditThreads)
      .where(
        and(
          eq(redditThreads.itemId, owner.id),
          sql`${redditThreads.generation} is not ${published}`,
        ),
      ),
  ];
}

function headerInsert(db: Database, owner: Readonly<Owner>, reported: number | null) {
  return db.insert(redditThreads).select(
    db
      .select({
        itemId: sql<number>`${owner.id}`.as("item_id"),
        generation: sql<number>`${owner.generation}`.as("generation"),
        reported: sql<number | null>`${reported}`.as("reported"),
      })
      .from(sql`(select 1)`)
      .where(sql`1`),
  );
}

function commentInsert(db: Database, owner: Readonly<Owner>, json: string) {
  return db.insert(redditComments).select(
    db
      .select({
        itemId: sql<number>`${owner.id}`.as("item_id"),
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
  normalizedUrl: string,
  thread: Readonly<ParsedThread>,
): readonly BatchItem<"sqlite">[] {
  const owner = ownerOf(normalizedUrl);

  return [
    ...supersededDeletes(db, owner),
    headerInsert(db, owner, thread.reported),
    ...jsonArrays(thread.nodes.map((node) => rowJson(node))).map((json) =>
      commentInsert(db, owner, json),
    ),
  ];
}

export function selectionWrites(
  db: Database,
  published: Readonly<{ itemId: number; generation: number }>,
  kept: readonly string[],
): readonly BatchItem<"sqlite">[] {
  const { itemId, generation } = published;

  return [
    db
      .update(redditComments)
      .set({ kept: selected(kept) })
      .where(and(eq(redditComments.itemId, itemId), eq(redditComments.generation, generation))),
    db
      .delete(redditComments)
      .where(
        and(eq(redditComments.itemId, itemId), sql`${redditComments.generation} <> ${generation}`),
      ),
    db
      .delete(redditThreads)
      .where(
        and(eq(redditThreads.itemId, itemId), sql`${redditThreads.generation} <> ${generation}`),
      ),
  ];
}

function readGeneration(itemId: number) {
  const published = sql`select ${redditThreads.generation} from ${redditThreads} join ${digests} on ${digests.itemId} = ${redditThreads.itemId} and ${digests.generation} = ${redditThreads.generation} where ${redditThreads.itemId} = ${itemId}`;
  const stored = sql`select max(${redditThreads.generation}) from ${redditThreads} where ${redditThreads.itemId} = ${itemId}`;

  return sql`coalesce((${published}), (${stored}))`;
}

function threadRows(db: Database, itemId: number) {
  return db
    .select({
      id: redditComments.id,
      parentId: redditComments.parentId,
      depth: redditComments.depth,
      kind: redditComments.kind,
      eligible: redditComments.eligible,
      kept: redditComments.kept,
      author: sql<
        string | null
      >`case when ${redditComments.kept} then ${redditComments.author} end`,
      body: sql<string | null>`case when ${redditComments.kept} then ${redditComments.body} end`,
      score: sql<number | null>`case when ${redditComments.kept} then ${redditComments.score} end`,
      postedAt: sql<
        number | null
      >`case when ${redditComments.kept} then ${redditComments.postedAt} end`,
    })
    .from(redditComments)
    .where(
      and(
        eq(redditComments.itemId, itemId),
        sql`${redditComments.generation} = ${readGeneration(itemId)}`,
      ),
    )
    .orderBy(asc(redditComments.position));
}

function threadReport(db: Database, itemId: number) {
  return db
    .select({ reported: redditThreads.reported })
    .from(redditThreads)
    .where(
      and(
        eq(redditThreads.itemId, itemId),
        sql`${redditThreads.generation} = ${readGeneration(itemId)}`,
      ),
    );
}

export function threadReads(db: Database, itemId: number) {
  return [threadRows(db, itemId), threadReport(db, itemId)] as const;
}

export function commentsOf(
  rows: readonly CommentRow[],
  report: readonly Readonly<{ reported: number | null }>[],
): CommentsView {
  const [thread] = report;

  return thread === undefined ? NO_COMMENTS : commentsViewOf(rows, thread.reported);
}
