import { asc, eq, sql } from "drizzle-orm";

import { highlightRows } from "./highlights.ts";
import { DETAIL_COLUMNS, selectItems } from "./item-selection.ts";
import { itemTitle } from "./item-title.ts";
import { noteRows } from "./notes.ts";
import type { Database } from "./ports.ts";
import { sizedImageRows } from "./post-text.ts";
import { REPOSITORY_COLUMNS } from "./repositories.ts";
import { digests, githubRepos, itemTags, items, relatedItems, tags } from "./schema.ts";
import { threadReads } from "./thread-read.ts";

function relatedRows(db: Database, itemId: number) {
  return db
    .select({
      id: items.id,
      title: itemTitle(),
      source: items.source,
      reason: relatedItems.reason,
    })
    .from(relatedItems)
    .innerJoin(items, eq(items.id, relatedItems.relatedId))
    .leftJoin(digests, eq(digests.itemId, items.id))
    .where(eq(relatedItems.itemId, itemId))
    .orderBy(asc(relatedItems.position));
}

export function detailReads(db: Database, id: number) {
  return db.batch([
    selectItems(db, {
      ...DETAIL_COLUMNS,
      revision: sql<number>`${items.generation}`.as("post_revision"),
    }).where(eq(items.id, id)),
    db.select({ digest: digests.digest }).from(digests).where(eq(digests.itemId, id)),
    db
      .select({ name: tags.name })
      .from(itemTags)
      .innerJoin(tags, eq(tags.id, itemTags.tagId))
      .where(eq(itemTags.itemId, id))
      .orderBy(asc(sql`${itemTags}.rowid`)),
    db.select(REPOSITORY_COLUMNS).from(githubRepos).where(eq(githubRepos.itemId, id)),
    ...threadReads(db, id),
    highlightRows(db, id),
    noteRows(db, id),
    sizedImageRows(db, id),
    relatedRows(db, id),
  ]);
}
