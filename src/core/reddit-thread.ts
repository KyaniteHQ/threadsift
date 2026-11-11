import { type SQL, type SQLWrapper, and, asc, eq, isNotNull, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { StoredCommentId } from "./comment-id.ts";
import type { CommentCandidate } from "./digest-prompt.ts";
import type { Database } from "./ports.ts";
import type { ParsedThread } from "./reddit-json.ts";
import { digests, items, redditComments, redditThreads } from "./schema.ts";
import { jsonArrays, rowJson } from "./thread-rows.ts";

export function eligibleComments(): SQL {
  return sql`exists (select 1 from ${redditComments} where ${redditComments.itemId} = ${items.id} and ${redditComments.generation} = ${items.generation} and ${redditComments.eligible} = 1)`;
}

export function candidateLink(): SQL<string | null> {
  return sql<
    string | null
  >`(select ${redditThreads.linkedUrl} from ${redditThreads} where ${redditThreads.itemId} = ${items.id} and ${redditThreads.generation} = ${items.generation})`;
}

export function keptCommentIds(): SQL<string> {
  return sql<string>`(select coalesce(json_group_array(id), '[]') from (select ${redditComments.id} as id from ${redditComments} join ${digests} on ${digests.itemId} = ${redditComments.itemId} and ${digests.generation} = ${redditComments.generation} where ${redditComments.itemId} = ${items.id} and ${redditComments.kept} = 1 order by ${redditComments.position}))`;
}

function selected(kept: readonly string[]): SQL {
  return sql`${redditComments.eligible} = 1 and ${redditComments.id} in (select value from json_each(${JSON.stringify(kept)}))`;
}

function commentsWhere(
  db: Database,
  snapshot: Readonly<{ itemId: number; generation: number }>,
  condition: Readonly<SQLWrapper>,
) {
  return db
    .select({ id: redditComments.id, body: redditComments.body })
    .from(redditComments)
    .where(
      and(
        eq(redditComments.itemId, snapshot.itemId),
        eq(redditComments.generation, snapshot.generation),
        sql`${condition}`,
      ),
    )
    .orderBy(asc(redditComments.position));
}

async function bodiesWhere(
  db: Database,
  snapshot: Readonly<{ itemId: number; generation: number }>,
  condition: Readonly<SQLWrapper>,
): Promise<readonly string[]> {
  const rows = await commentsWhere(db, snapshot, condition);

  return rows.flatMap(({ body }) => (body === null ? [] : [body]));
}

export function selectedBodies(
  db: Database,
  snapshot: Readonly<{ itemId: number; generation: number }>,
  kept: readonly string[],
): Promise<readonly string[]> {
  return bodiesWhere(db, snapshot, selected(kept));
}

export async function eligibleAmong(
  db: Database,
  snapshot: Readonly<{ itemId: number; generation: number }>,
  ids: readonly string[],
): Promise<readonly string[]> {
  if (ids.length === 0) return [];

  const rows = await commentsWhere(db, snapshot, selected(ids));

  return rows.map(({ id }) => id);
}

export function keptBodies(
  db: Database,
  snapshot: Readonly<{ itemId: number; generation: number }>,
): Promise<readonly string[]> {
  return bodiesWhere(db, snapshot, eq(redditComments.kept, true));
}

export function highlightedComments(
  db: Database,
  snapshot: Readonly<{ itemId: number; generation: number }>,
  ids: readonly string[],
) {
  return ids.length === 0 ? Promise.resolve([]) : commentsWhere(db, snapshot, selected(ids));
}

export function submittedAmong(
  ids: readonly string[],
  submitted: readonly string[],
): readonly string[] {
  const allowed = new Set(submitted);

  return [...new Set(ids)].filter((id) => allowed.has(id) && StoredCommentId.safeParse(id).success);
}

export async function commentCandidates(
  db: Database,
  snapshot: Readonly<{ itemId: number; generation: number }>,
): Promise<readonly CommentCandidate[]> {
  const rows = await db
    .select({ id: redditComments.id, parentId: redditComments.parentId, body: redditComments.body })
    .from(redditComments)
    .where(
      and(
        eq(redditComments.itemId, snapshot.itemId),
        eq(redditComments.generation, snapshot.generation),
        eq(redditComments.eligible, true),
        isNotNull(redditComments.body),
      ),
    )
    .orderBy(asc(redditComments.position));

  return rows.flatMap(({ id, parentId, body }) => (body === null ? [] : [{ id, parentId, body }]));
}

export interface Owner {
  readonly id: Readonly<SQLWrapper>;
  readonly generation: Readonly<SQLWrapper>;
}

export function ownerOfItem(itemId: number): Owner {
  return {
    id: sql`${itemId}`,
    generation: sql`(select ${items.generation} from ${items} where ${items.id} = ${itemId})`,
  };
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

function headerInsert(
  db: Database,
  owner: Readonly<Owner>,
  { reported, linkedUrl }: Readonly<Pick<ParsedThread, "reported" | "linkedUrl">>,
  archivedAt: number | null,
) {
  return db.insert(redditThreads).select(
    db
      .select({
        itemId: sql<number>`${owner.id}`.as("item_id"),
        generation: sql<number>`${owner.generation}`.as("generation"),
        reported: sql<number | null>`${reported}`.as("reported"),
        archivedAt: sql<number | null>`${archivedAt}`.as("archived_at"),
        linkedUrl: sql<string | null>`${linkedUrl}`.as("linked_url"),
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
  owner: Readonly<Owner>,
  thread: Readonly<ParsedThread>,
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

export function publishedGeneration(itemId: number | Readonly<SQLWrapper>) {
  return sql`select ${redditThreads.generation} from ${redditThreads} join ${digests} on ${digests.itemId} = ${redditThreads.itemId} and ${digests.generation} = ${redditThreads.generation} where ${redditThreads.itemId} = ${itemId}`;
}

export function readGeneration(itemId: number | Readonly<SQLWrapper>) {
  const published = publishedGeneration(itemId);
  const stored = sql`select max(${redditThreads.generation}) from ${redditThreads} where ${redditThreads.itemId} = ${itemId}`;

  return sql<number | null>`coalesce((${published}), (${stored}))`;
}

export function noThreadFor(itemId: number | Readonly<SQLWrapper>): SQL {
  return sql`${readGeneration(itemId)} is null`;
}

export function hasNoThread(normalizedUrl: string): SQL {
  return noThreadFor(ownerOf(normalizedUrl).id);
}

export function awaitsThread(normalizedUrl: string): SQL {
  return sql`exists (select 1 from ${items} where ${items.normalizedUrl} = ${normalizedUrl}) and ${hasNoThread(normalizedUrl)}`;
}
