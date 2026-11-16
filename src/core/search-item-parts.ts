import { type SQL, asc, eq, sql } from "drizzle-orm";

import { digestOf } from "./encoding.ts";
import type { JobWrites } from "./job-outcome.ts";
import type { Crypto, Database } from "./ports.ts";
import { keptBodies, keptCommentIds } from "./reddit-thread.ts";
import {
  digests,
  githubRepos,
  highlights,
  itemTags,
  items,
  notes,
  searchFingerprints,
  searchParts,
  tags,
} from "./schema.ts";
import {
  commentPartWrites,
  digestPartWrites,
  fetchedPartWrites,
  highlightPartWrites,
  notePartWrites,
  repositoryPartWrites,
  repositoryText,
} from "./search.ts";

const NONE = "[]";

function tagNamesOfItem() {
  return sql<string>`(select coalesce(json_group_array(name), '[]') from (select ${tags.name} as name from ${itemTags} join ${tags} on ${tags.id} = ${itemTags.tagId} where ${itemTags.itemId} = ${items.id} order by ${tags.key}))`;
}

function highlightPartsHold() {
  return sql<boolean>`(not exists (select 1 from ${highlights} where ${highlights.itemId} = ${items.id} and not exists (select 1 from ${searchParts} where ${searchParts.highlightId} = ${highlights.id} and ${searchParts.body} = ${highlights.exact})) and not exists (select 1 from ${searchParts} where ${searchParts.itemId} = ${items.id} and ${searchParts.kind} = 'highlight' and not exists (select 1 from ${highlights} where ${highlights.id} = ${searchParts.highlightId} and ${highlights.exact} = ${searchParts.body})))`.mapWith(
    Boolean,
  );
}

function notePartHolds() {
  const stored = sql`(select ${notes.body} from ${notes} where ${notes.itemId} = ${items.id})`;

  return sql<boolean>`((select count(*) from ${searchParts} where ${searchParts.itemId} = ${items.id} and ${searchParts.kind} = 'note') = (case when ${stored} is null then 0 else 1 end) and not exists (select 1 from ${searchParts} where ${searchParts.itemId} = ${items.id} and ${searchParts.kind} = 'note' and ${searchParts.body} is not ${stored}))`.mapWith(
    Boolean,
  );
}

function repositoryOfItem() {
  return sql<
    string | null
  >`(select ${repositoryText()} from ${githubRepos} where ${githubRepos.itemId} = ${items.id})`;
}

export function itemsToIndex(db: Database, where: SQL, limit: number) {
  return db
    .select({
      id: items.id,
      title: items.title,
      postText: items.postText,
      postTextKey: items.postTextKey,
      digest: digests.digest,
      tagNames: tagNamesOfItem(),
      repository: repositoryOfItem(),
      digestGeneration: digests.generation,
      comments: keptCommentIds(),
      highlightsHold: highlightPartsHold(),
      noteHolds: notePartHolds(),
      fingerprint: searchFingerprints.fingerprint,
    })
    .from(items)
    .leftJoin(digests, eq(digests.itemId, items.id))
    .leftJoin(searchFingerprints, eq(searchFingerprints.itemId, items.id))
    .where(where)
    .orderBy(asc(items.id))
    .limit(limit);
}

export type ItemToIndex = Awaited<ReturnType<typeof itemsToIndex>>[number];

function fingerprintOf(crypto: Crypto, row: Readonly<ItemToIndex>): string {
  const sources = JSON.stringify([
    row.title,
    row.postText,
    row.digest,
    row.tagNames,
    ...(row.postTextKey === null ? [] : [row.postTextKey]),
    ...(row.repository === null ? [] : [row.repository]),
    ...(row.comments === NONE ? [] : [row.comments]),
  ]);

  return digestOf(crypto, sources);
}

export function snapshotHolds(row: Readonly<ItemToIndex>) {
  return sql`exists (select 1 from ${items} where ${items.id} = ${row.id} and ${items.title} is ${row.title} and ${items.postText} is ${row.postText} and ${items.postTextKey} is ${row.postTextKey} and (select ${digests.digest} from ${digests} where ${digests.itemId} = ${items.id}) is ${row.digest} and (select ${digests.generation} from ${digests} where ${digests.itemId} = ${items.id}) is ${row.digestGeneration} and ${tagNamesOfItem()} = ${row.tagNames} and ${repositoryOfItem()} is ${row.repository} and ${keptCommentIds()} = ${row.comments})`;
}

export interface PartWrites {
  readonly fingerprinted: JobWrites;
  readonly direct: JobWrites;
  readonly commentBytes: number;
}

const ENCODER = new TextEncoder();

async function fingerprintedWrites(
  db: Database,
  row: Readonly<ItemToIndex>,
  fingerprint: string,
  postText: string | null | undefined,
): Promise<Readonly<{ writes: JobWrites; commentBytes: number }>> {
  const scope = eq(items.id, row.id);

  const comments =
    row.digestGeneration === null
      ? []
      : await keptBodies(db, { itemId: row.id, generation: row.digestGeneration });

  const writes = [
    ...fetchedPartWrites(db, scope, postText),
    ...digestPartWrites(db, scope),
    ...commentPartWrites(db, scope, comments),
    ...repositoryPartWrites(db, scope),
    db
      .insert(searchFingerprints)
      .select(
        db
          .select({ itemId: items.id, fingerprint: sql<string>`${fingerprint}`.as("fingerprint") })
          .from(items)
          .where(scope),
      )
      .onConflictDoUpdate({ target: searchFingerprints.itemId, set: { fingerprint } }),
  ];

  return {
    writes,
    commentBytes: comments.reduce((sum, body) => sum + ENCODER.encode(body).length, 0),
  };
}

export async function stalePartWrites(
  { db, crypto }: Readonly<{ db: Database; crypto: Crypto }>,
  row: Readonly<ItemToIndex>,
  postText: string | null | undefined,
): Promise<PartWrites> {
  const scope = eq(items.id, row.id);
  const fingerprint = fingerprintOf(crypto, row);

  const stale =
    fingerprint === row.fingerprint
      ? { writes: [], commentBytes: 0 }
      : await fingerprintedWrites(db, row, fingerprint, postText);

  return {
    fingerprinted: stale.writes,
    commentBytes: stale.commentBytes,
    direct: [
      ...(row.highlightsHold ? [] : highlightPartWrites(db, scope)),
      ...(row.noteHolds ? [] : notePartWrites(db, scope)),
    ],
  };
}
