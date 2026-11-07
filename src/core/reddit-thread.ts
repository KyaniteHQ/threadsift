import { type SQL, type SQLWrapper, and, asc, eq, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { type CommentRow, type CommentsView, NO_COMMENTS, commentsViewOf } from "./comment-view.ts";
import type { Database } from "./ports.ts";
import type { ParsedThread, ThreadNode } from "./reddit-json.ts";
import { digests, items, redditComments, redditThreads } from "./schema.ts";

const STATEMENT_JSON_BYTES = 1_500_000;

const encoder = new TextEncoder();

export function eligibleComments(): SQL {
  return sql`exists (select 1 from ${redditComments} where ${redditComments.itemId} = ${items.id} and ${redditComments.generation} = ${items.generation} and ${redditComments.eligible} = 1)`;
}

export function keptCommentIds(): SQL<string> {
  return sql<string>`(select coalesce(json_group_array(id), '[]') from (select ${redditComments.id} as id from ${redditComments} join ${digests} on ${digests.itemId} = ${redditComments.itemId} and ${digests.generation} = ${redditComments.generation} where ${redditComments.itemId} = ${items.id} and ${redditComments.kept} = 1 order by ${redditComments.position}))`;
}

function rowJson(node: Readonly<ThreadNode>): string {
  return JSON.stringify({ ...node, eligible: node.eligible ? 1 : 0 });
}

function rowChunks(nodes: readonly ThreadNode[]): readonly string[] {
  const chunks: string[][] = [];
  let bytes = 0;

  for (const row of nodes.map((node) => rowJson(node))) {
    const size = encoder.encode(row).length;
    const open = chunks.at(-1);

    if (open === undefined || bytes + size > STATEMENT_JSON_BYTES) {
      chunks.push([row]);
      bytes = size;
    } else {
      open.push(row);
      bytes += size;
    }
  }

  return chunks.map((rows) => `[${rows.join(",")}]`);
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
    ...rowChunks(thread.nodes).map((json) => commentInsert(db, owner, json)),
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
      .set({
        kept: sql`${redditComments.eligible} = 1 and ${redditComments.id} in (select value from json_each(${JSON.stringify(kept)}))`,
      })
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

function publishedRows(db: Database, itemId: number) {
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
    .innerJoin(
      digests,
      and(
        eq(digests.itemId, redditComments.itemId),
        eq(digests.generation, redditComments.generation),
      ),
    )
    .where(eq(redditComments.itemId, itemId))
    .orderBy(asc(redditComments.position));
}

function publishedReport(db: Database, itemId: number) {
  return db
    .select({ reported: redditThreads.reported })
    .from(redditThreads)
    .innerJoin(
      digests,
      and(
        eq(digests.itemId, redditThreads.itemId),
        eq(digests.generation, redditThreads.generation),
      ),
    )
    .where(eq(redditThreads.itemId, itemId));
}

export function publishedThreadReads(db: Database, itemId: number) {
  return [publishedRows(db, itemId), publishedReport(db, itemId)] as const;
}

export function publishedCommentsOf(
  rows: readonly CommentRow[],
  report: readonly Readonly<{ reported: number | null }>[],
): CommentsView {
  const [thread] = report;

  return thread === undefined ? NO_COMMENTS : commentsViewOf(rows, thread.reported);
}
