import { type SQL, asc, eq, gt, sql } from "drizzle-orm";

import { utf8Length } from "../contract/encoding.ts";
import {
  ItemsCursorSchema,
  RESTORE_INDEX_BYTES,
  RESTORE_INDEX_ITEMS,
  entering,
} from "../contract/restore-contract.ts";
import { rebuiltPartWrites } from "../item/search-parts.ts";
import { repositoryText } from "../item/search.ts";
import type { Database } from "../kernel/database.ts";
import type { JobPorts, JobWrites, SettledOutcome } from "../kernel/job-outcome.ts";
import { type RestoreRow, digests, githubRepos, itemTags, items, tags } from "../kernel/schema.ts";
import { postTextOf } from "../thread/post-text.ts";
import { keptBodies, keptCommentIds } from "../thread/thread-selection.ts";
import { snapshotted, steppedUnit } from "./restore-unit.ts";

function tagNamesOfItem() {
  return sql<string>`(select coalesce(json_group_array(name), '[]') from (select ${tags.name} as name from ${itemTags} join ${tags} on ${tags.id} = ${itemTags.tagId} where ${itemTags.itemId} = ${items.id} order by ${tags.key}))`;
}

function repositoryOfItem() {
  return sql<
    string | null
  >`(select ${repositoryText()} from ${githubRepos} where ${githubRepos.itemId} = ${items.id})`;
}

function itemsToIndex(db: Database, where: SQL, limit: number) {
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
    })
    .from(items)
    .leftJoin(digests, eq(digests.itemId, items.id))
    .where(where)
    .orderBy(asc(items.id))
    .limit(limit);
}

type ItemToIndex = Awaited<ReturnType<typeof itemsToIndex>>[number];

function snapshotHolds(row: Readonly<ItemToIndex>) {
  return sql`exists (select 1 from ${items} where ${items.id} = ${row.id} and ${items.title} is ${row.title} and ${items.postText} is ${row.postText} and ${items.postTextKey} is ${row.postTextKey} and (select ${digests.digest} from ${digests} where ${digests.itemId} = ${items.id}) is ${row.digest} and (select ${digests.generation} from ${digests} where ${digests.itemId} = ${items.id}) is ${row.digestGeneration} and ${tagNamesOfItem()} = ${row.tagNames} and ${repositoryOfItem()} is ${row.repository} and ${keptCommentIds()} = ${row.comments})`;
}

async function restoredPartWrites(
  db: Database,
  row: Readonly<ItemToIndex>,
  postText: string | null,
) {
  const scope = eq(items.id, row.id);

  const comments =
    row.digestGeneration === null
      ? []
      : await keptBodies(db, { itemId: row.id, generation: row.digestGeneration });

  return {
    writes: rebuiltPartWrites(db, scope, { postText, comments }),
    commentBytes: comments.reduce((sum, body) => sum + utf8Length(body), 0),
  };
}

export async function searchUnit(
  ports: JobPorts,
  run: Readonly<RestoreRow>,
): Promise<SettledOutcome> {
  const { db, files } = ports;
  const { after } = ItemsCursorSchema.parse(JSON.parse(run.cursor));
  const rows = await itemsToIndex(db, gt(items.id, after), RESTORE_INDEX_ITEMS);

  if (rows.length === 0) {
    return steppedUnit(db, run, entering("highlights"));
  }

  const writes: JobWrites[number][] = [];
  const holds = [];
  let last = after;
  let held = 0;

  for (const row of rows) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- the loop stops at RESTORE_INDEX_BYTES of text and Kept comments, so Items are read one after another.
    const text = row.postTextKey === null ? row.postText : await postTextOf(files, row.id, row);
    // oxlint-disable-next-line eslint/no-await-in-loop -- the Kept comments of one Item are read after its text, inside the same byte budget.
    const parts = await restoredPartWrites(db, row, text);

    writes.push(...parts.writes);

    holds.push(snapshotHolds(row));

    last = row.id;
    held += utf8Length(text ?? "") + parts.commentBytes;

    if (held >= RESTORE_INDEX_BYTES) break;
  }

  return snapshotted(
    ports,
    run,
    steppedUnit(db, run, { cursor: JSON.stringify({ after: last }) }, writes),
    holds,
    (current) => searchUnit(ports, current),
  );
}
