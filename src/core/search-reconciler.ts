import { asc, eq, gt, sql } from "drizzle-orm";

import { digestOf } from "./encoding.ts";
import { logFailure } from "./failure-log.ts";
import type { JobPorts } from "./job-outcome.ts";
import type { Crypto, Database } from "./ports.ts";
import { keptBodies, keptCommentIds } from "./reddit-thread.ts";
import {
  digests,
  guardedBatch,
  itemTags,
  items,
  githubRepos,
  searchFingerprints,
  searchReconciling,
  tags,
} from "./schema.ts";
import {
  commentPartWrites,
  digestPartWrites,
  fetchedPartWrites,
  repositoryPartWrites,
  repositoryText,
} from "./search.ts";

const RECONCILE_BATCH = 10;

const NO_KEPT_COMMENTS = "[]";

function tagNamesOfItem() {
  return sql<string>`(select coalesce(json_group_array(name), '[]') from (select ${tags.name} as name from ${itemTags} join ${tags} on ${tags.id} = ${itemTags.tagId} where ${itemTags.itemId} = ${items.id} order by ${tags.key}))`;
}

function repositoryOfItem() {
  return sql<
    string | null
  >`(select ${repositoryText()} from ${githubRepos} where ${githubRepos.itemId} = ${items.id})`;
}

function itemsAfter(db: Database, after: number) {
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
      fingerprint: searchFingerprints.fingerprint,
    })
    .from(items)
    .leftJoin(digests, eq(digests.itemId, items.id))
    .leftJoin(searchFingerprints, eq(searchFingerprints.itemId, items.id))
    .where(gt(items.id, after))
    .orderBy(asc(items.id))
    .limit(RECONCILE_BATCH);
}

type Reconciled = Awaited<ReturnType<typeof itemsAfter>>[number];

function fingerprintOf(crypto: Crypto, row: Readonly<Reconciled>): string {
  const sources = JSON.stringify([
    row.title,
    row.postText,
    row.digest,
    row.tagNames,
    ...(row.postTextKey === null ? [] : [row.postTextKey]),
    ...(row.repository === null ? [] : [row.repository]),
    ...(row.comments === NO_KEPT_COMMENTS ? [] : [row.comments]),
  ]);

  return digestOf(crypto, sources);
}

function snapshotHolds(row: Readonly<Reconciled>) {
  return sql`exists (select 1 from ${items} where ${items.id} = ${row.id} and ${items.title} is ${row.title} and ${items.postText} is ${row.postText} and ${items.postTextKey} is ${row.postTextKey} and (select ${digests.digest} from ${digests} where ${digests.itemId} = ${items.id}) is ${row.digest} and (select ${digests.generation} from ${digests} where ${digests.itemId} = ${items.id}) is ${row.digestGeneration} and ${tagNamesOfItem()} = ${row.tagNames} and ${repositoryOfItem()} is ${row.repository} and ${keptCommentIds()} = ${row.comments})`;
}

async function reconcileItem(db: Database, row: Readonly<Reconciled>, fingerprint: string) {
  const scope = eq(items.id, row.id);
  const unchanged = snapshotHolds(row);

  const comments =
    row.digestGeneration === null
      ? []
      : await keptBodies(db, { itemId: row.id, generation: row.digestGeneration });

  await guardedBatch(db, unchanged, [
    ...fetchedPartWrites(db, scope, row.postTextKey === null ? row.postText : undefined),
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
  ]);
}

async function reconcileRow(ports: JobPorts, row: Readonly<Reconciled>): Promise<void> {
  const fingerprint = fingerprintOf(ports.crypto, row);

  if (fingerprint === row.fingerprint) return;

  try {
    await reconcileItem(ports.db, row, fingerprint);
  } catch (error) {
    logFailure("search-parts-not-rewritten", { itemId: row.id }, error);
  }
}

export async function reconcileSearchParts(ports: JobPorts): Promise<void> {
  const { db } = ports;
  const [cursor] = await db.select().from(searchReconciling).where(eq(searchReconciling.id, 1));
  const after = cursor?.lastItemId ?? 0;
  const next = await itemsAfter(db, after);
  const page = next.length === 0 && after > 0 ? await itemsAfter(db, 0) : next;
  const lastItemId = page.at(-1)?.id ?? 0;

  await db
    .insert(searchReconciling)
    .values({ id: 1, lastItemId })
    .onConflictDoUpdate({ target: searchReconciling.id, set: { lastItemId } });

  for (const row of page) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- Items are reconciled sequentially.
    await reconcileRow(ports, row);
  }
}
