import {
  type SQL,
  type SQLWrapper,
  and,
  eq,
  inArray,
  isNotNull,
  ne,
  notExists,
  sql,
} from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { alias } from "drizzle-orm/sqlite-core";

import { startsPair } from "../contract/code-points.ts";
import { utf8Length } from "../contract/encoding.ts";
import type { Database } from "../kernel/database.ts";
import { holdsTitleAndSummary } from "../kernel/digest-stored.ts";
import {
  digests,
  githubRepos,
  highlights,
  itemTags,
  items,
  notes,
  searchParts,
  tags,
} from "../kernel/schema.ts";
import type { SearchPartKind } from "../kernel/search-tables.ts";
import { jsonArrays } from "../thread/thread-rows.ts";
import { PART_GROUPS } from "./search-part-groups.ts";

export const siblingTags = alias(itemTags, "sibling");

const CHUNK_UNITS = 125_000;
const CHUNK_TRIGGER_BYTES = 500_000;

function lastSeparatorBefore(text: string, limit: number): number {
  for (let at = limit; at > 0; at -= 1) {
    if (/\s/u.test(text.charAt(at))) return at;
  }

  return 0;
}

function hardCut(text: string): number {
  return startsPair(text, CHUNK_UNITS - 1) ? CHUNK_UNITS - 1 : CHUNK_UNITS;
}

function chunkPostText(text: string): readonly string[] {
  if (utf8Length(text) <= CHUNK_TRIGGER_BYTES) {
    return text.trim() === "" ? [] : [text];
  }

  const chunks: string[] = [];
  let rest = text;

  while (rest.length > CHUNK_UNITS) {
    const at = lastSeparatorBefore(rest, CHUNK_UNITS) || hardCut(rest);
    chunks.push(rest.slice(0, at));
    rest = rest.slice(at);
  }

  chunks.push(rest);

  return chunks.filter((chunk) => chunk.trim() !== "");
}

function prefixQueries(terms: readonly string[]): readonly string[] {
  return terms.map((term) => `"${term}"*`);
}

export function matching(terms: readonly string[]): SQL {
  const wanted = JSON.stringify(prefixQueries(terms));

  return sql`${items.id} in (select ${searchParts.itemId} from json_each(${wanted}) as wanted join search_index on search_index match wanted.value join ${searchParts} on ${searchParts.id} = search_index.rowid group by ${searchParts.itemId} having count(distinct wanted.key) = json_array_length(${wanted}))`;
}

export function partMatching(terms: readonly string[]): SQL {
  const query = prefixQueries(terms).join(" ");

  return sql`${searchParts.id} in (select rowid from search_index where search_index match ${query})`;
}

function ownersIn(db: Database, scope: Readonly<SQLWrapper>) {
  return db
    .select({ id: items.id })
    .from(items)
    .where(sql`${scope}`);
}

function replacing(db: Database, scope: Readonly<SQLWrapper>, kinds: readonly SearchPartKind[]) {
  const owners = ownersIn(db, scope);

  return db
    .delete(searchParts)
    .where(and(inArray(searchParts.itemId, owners), inArray(searchParts.kind, kinds)));
}

function partOf(
  kind: SearchPartKind,
  body: Readonly<SQLWrapper>,
  highlightId: Readonly<SQLWrapper> | null = null,
) {
  return {
    id: sql<null>`null`.as("id"),
    itemId: items.id,
    kind: sql<SearchPartKind>`${kind}`.as("kind"),
    body: sql<string>`${body}`.as("body"),
    highlightId: sql<number | null>`${highlightId ?? sql`null`}`.as("highlight_id"),
  };
}

function titlePart(db: Database, scope: Readonly<SQLWrapper>) {
  return db.insert(searchParts).select(
    db
      .select(partOf("title", items.title))
      .from(items)
      .where(and(sql`${scope}`, isNotNull(items.title), ne(items.title, ""))),
  );
}

function chunkPart(db: Database, scope: Readonly<SQLWrapper>, chunk: string) {
  return db.insert(searchParts).select(
    db
      .select(partOf("post-text", sql`${chunk}`))
      .from(items)
      .where(sql`${scope}`),
  );
}

export function fetchedPartWrites(
  db: Database,
  scope: Readonly<SQLWrapper>,
  postText: string | null | undefined,
): readonly BatchItem<"sqlite">[] {
  const title = [replacing(db, scope, PART_GROUPS.title), titlePart(db, scope)];

  if (postText === undefined) return title;

  return [
    ...title,
    replacing(db, scope, PART_GROUPS.postText),
    ...(postText === null ? [] : chunkPostText(postText)).map((chunk) =>
      chunkPart(db, scope, chunk),
    ),
  ];
}

function digestFieldPart(
  db: Database,
  scope: Readonly<SQLWrapper>,
  kind: "digest-title" | "summary",
) {
  const field = kind === "summary" ? "summary" : "title";

  return db.insert(searchParts).select(
    db
      .select(partOf(kind, sql`json_extract(${digests.digest}, ${`$.${field}`})`))
      .from(items)
      .innerJoin(digests, sql`${digests.itemId} = ${items.id}`)
      .where(and(sql`${scope}`, holdsTitleAndSummary())),
  );
}

function tagsPart(db: Database, scope: Readonly<SQLWrapper>) {
  return db.insert(searchParts).select(
    db
      .select(partOf("tags", sql`group_concat(${tags.name}, char(10))`))
      .from(items)
      .innerJoin(itemTags, sql`${itemTags.itemId} = ${items.id}`)
      .innerJoin(tags, sql`${tags.id} = ${itemTags.tagId}`)
      .where(sql`${scope}`)
      .groupBy(items.id),
  );
}

function commentPartInsert(db: Database, scope: Readonly<SQLWrapper>, json: string) {
  return db.insert(searchParts).select(
    db
      .select(partOf("comment", sql`part.value`))
      .from(items)
      .innerJoin(sql`json_each(${json}) as part`, sql`1`)
      .where(sql`${scope}`),
  );
}

export function commentPartWrites(
  db: Database,
  scope: Readonly<SQLWrapper>,
  bodies: readonly string[],
): readonly BatchItem<"sqlite">[] {
  const parts = bodies.flatMap((body) => chunkPostText(body)).map((part) => JSON.stringify(part));

  return [
    replacing(db, scope, PART_GROUPS.comments),
    ...jsonArrays(parts).map((json) => commentPartInsert(db, scope, json)),
  ];
}

export function tagPartWrites(
  db: Database,
  scope: Readonly<SQLWrapper>,
): readonly BatchItem<"sqlite">[] {
  return [replacing(db, scope, PART_GROUPS.tags), tagsPart(db, scope)];
}

export function digestPartWrites(
  db: Database,
  scope: Readonly<SQLWrapper>,
): readonly BatchItem<"sqlite">[] {
  return [
    replacing(db, scope, PART_GROUPS.digest),
    digestFieldPart(db, scope, "digest-title"),
    digestFieldPart(db, scope, "summary"),
    tagsPart(db, scope),
  ];
}

export function highlightPartWrites(db: Database, scope: Readonly<SQLWrapper>) {
  const owners = ownersIn(db, scope);

  const current = db
    .select({ one: sql`1` })
    .from(highlights)
    .where(and(eq(highlights.id, searchParts.highlightId), eq(highlights.exact, searchParts.body)));

  const indexed = db
    .select({ one: sql`1` })
    .from(searchParts)
    .where(eq(searchParts.highlightId, highlights.id));

  return [
    db
      .delete(searchParts)
      .where(
        and(
          inArray(searchParts.itemId, owners),
          eq(searchParts.kind, PART_GROUPS.highlights[0]),
          notExists(current),
        ),
      ),
    db.insert(searchParts).select(
      db
        .select(partOf("highlight", highlights.exact, highlights.id))
        .from(highlights)
        .innerJoin(items, sql`${items.id} = ${highlights.itemId}`)
        .where(and(sql`${scope}`, notExists(indexed)))
        .orderBy(highlights.id),
    ),
  ] as const;
}

export function notePartWrites(db: Database, scope: Readonly<SQLWrapper>) {
  return [
    replacing(db, scope, PART_GROUPS.notes),
    db.insert(searchParts).select(
      db
        .select(partOf("note", notes.body))
        .from(items)
        .innerJoin(notes, sql`${notes.itemId} = ${items.id}`)
        .where(and(sql`${scope}`, isNotNull(notes.body))),
    ),
  ] as const;
}

export function repositoryText() {
  return sql<string>`trim(coalesce(${githubRepos.description}, '') || char(10) || (select coalesce(group_concat(value, char(10)), '') from json_each(${githubRepos.topics})))`;
}

export function repositoryPartWrites(
  db: Database,
  scope: Readonly<SQLWrapper>,
): readonly BatchItem<"sqlite">[] {
  return [
    replacing(db, scope, PART_GROUPS.repository),
    db.insert(searchParts).select(
      db
        .select(partOf("repository", repositoryText()))
        .from(items)
        .innerJoin(githubRepos, sql`${githubRepos.itemId} = ${items.id}`)
        .where(and(sql`${scope}`, ne(repositoryText(), ""))),
    ),
  ];
}
