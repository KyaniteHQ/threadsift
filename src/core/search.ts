import { type SQL, type SQLWrapper, and, asc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import type { SearchPartKind } from "./kinds.ts";
import type { Database } from "./ports.ts";
import {
  digests,
  githubRepos,
  itemTags,
  items,
  redditComments,
  searchParts,
  tags,
} from "./schema.ts";

const CHUNK_UNITS = 125_000;
const CHUNK_TRIGGER_BYTES = 500_000;
const LAST_BMP_CODE_POINT = 0xff_ff;

const DIGEST_KINDS = [
  "digest-title",
  "summary",
  "tags",
  "comment",
] as const satisfies readonly SearchPartKind[];

function lastSeparatorBefore(text: string, limit: number): number {
  for (let at = limit; at > 0; at -= 1) {
    if (/\s/u.test(text.charAt(at))) return at;
  }

  return 0;
}

function hardCut(text: string): number {
  const straddling = (text.codePointAt(CHUNK_UNITS - 1) ?? 0) > LAST_BMP_CODE_POINT;

  return straddling ? CHUNK_UNITS - 1 : CHUNK_UNITS;
}

export function chunkPostText(text: string): readonly string[] {
  if (new TextEncoder().encode(text).length <= CHUNK_TRIGGER_BYTES) {
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

export function matching(terms: readonly string[]): SQL {
  const wanted = JSON.stringify(terms.map((term) => `"${term}"*`));

  return sql`${items.id} in (select ${searchParts.itemId} from json_each(${wanted}) as wanted join search_index on search_index match wanted.value join ${searchParts} on ${searchParts.id} = search_index.rowid group by ${searchParts.itemId} having count(distinct wanted.key) = json_array_length(${wanted}))`;
}

function replacing(db: Database, scope: Readonly<SQLWrapper>, kinds: readonly SearchPartKind[]) {
  const owners = db
    .select({ id: items.id })
    .from(items)
    .where(sql`${scope}`);

  return db
    .delete(searchParts)
    .where(and(inArray(searchParts.itemId, owners), inArray(searchParts.kind, kinds)));
}

function partOf(kind: SearchPartKind, body: Readonly<SQLWrapper>) {
  return {
    id: sql<null>`null`.as("id"),
    itemId: items.id,
    kind: sql<SearchPartKind>`${kind}`.as("kind"),
    body: sql<string>`${body}`.as("body"),
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
  const title = [replacing(db, scope, ["title"]), titlePart(db, scope)];

  if (postText === undefined) return title;

  return [
    ...title,
    replacing(db, scope, ["post-text"]),
    ...(postText === null ? [] : chunkPostText(postText)).map((chunk) =>
      chunkPart(db, scope, chunk),
    ),
  ];
}

function readableDigest() {
  return sql`(case when json_valid(${digests.digest}) then json_type(${digests.digest}, '$.title') = 'text' and json_type(${digests.digest}, '$.summary') = 'text' end) = 1`;
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
      .where(and(sql`${scope}`, readableDigest())),
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

function commentParts(db: Database, scope: Readonly<SQLWrapper>) {
  return db.insert(searchParts).select(
    db
      .select(partOf("comment", redditComments.body))
      .from(items)
      .innerJoin(digests, sql`${digests.itemId} = ${items.id}`)
      .innerJoin(
        redditComments,
        sql`${redditComments.itemId} = ${items.id} and ${redditComments.generation} = ${digests.generation}`,
      )
      .where(and(sql`${scope}`, eq(redditComments.kept, true), isNotNull(redditComments.body)))
      .orderBy(asc(redditComments.position)),
  );
}

export function digestPartWrites(
  db: Database,
  scope: Readonly<SQLWrapper>,
): readonly BatchItem<"sqlite">[] {
  return [
    replacing(db, scope, DIGEST_KINDS),
    digestFieldPart(db, scope, "digest-title"),
    digestFieldPart(db, scope, "summary"),
    tagsPart(db, scope),
    commentParts(db, scope),
  ];
}

export function repositoryText() {
  return sql<string>`trim(coalesce(${githubRepos.description}, '') || char(10) || (select coalesce(group_concat(value, char(10)), '') from json_each(${githubRepos.topics})))`;
}

export function repositoryPartWrites(
  db: Database,
  scope: Readonly<SQLWrapper>,
): readonly BatchItem<"sqlite">[] {
  return [
    replacing(db, scope, ["repository"]),
    db.insert(searchParts).select(
      db
        .select(partOf("repository", repositoryText()))
        .from(items)
        .innerJoin(githubRepos, sql`${githubRepos.itemId} = ${items.id}`)
        .where(and(sql`${scope}`, ne(repositoryText(), ""))),
    ),
  ];
}
