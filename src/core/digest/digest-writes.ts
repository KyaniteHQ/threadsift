import { and, eq, sql } from "drizzle-orm";

import { commentPartWrites, digestPartWrites } from "../item/search.ts";
import type { Database } from "../kernel/database.ts";
import { markDigest } from "../kernel/digest-marker.ts";
import { opening } from "../kernel/job-rows.ts";
import { providerSet } from "../kernel/provider-saved.ts";
import { digests, items } from "../kernel/schema.ts";
import { STALE } from "../kernel/vault-stale.ts";
import { selectionWrites } from "../thread/thread-selection.ts";
import { type CatalogEntries, publishedLinks } from "../wiki/catalog.ts";

interface KeptSelection {
  readonly ids: readonly string[];
  readonly bodies: readonly string[];
}

interface DigestWriteInput {
  readonly stored: Readonly<typeof digests.$inferSelect>;
  readonly entries: CatalogEntries;
  readonly kept: Readonly<KeptSelection>;
}

function openingPick(db: Database, itemId: number) {
  return opening(db, {
    kind: "related_pick",
    address: sql`${items.originalUrl}`,
    now: Date.now(),
    where: and(eq(items.id, itemId), providerSet()) ?? sql`0`,
  });
}

export function digestWrites(db: Database, { stored, entries, kept }: Readonly<DigestWriteInput>) {
  const { itemId, generation, title } = stored;

  return [
    ...publishedLinks(db, itemId, entries, title),
    db.insert(digests).values(stored).onConflictDoUpdate({ target: digests.itemId, set: stored }),
    openingPick(db, itemId),
    ...selectionWrites(db, { itemId, generation }, kept.ids),
    ...digestPartWrites(db, eq(items.id, itemId)),
    ...commentPartWrites(db, eq(items.id, itemId), kept.bodies),
    db.update(items).set({ pendingDigest: null }).where(eq(items.id, itemId)),
    markDigest(db, itemId, "cleared"),
    ...STALE.itemChanged(db, eq(items.id, itemId)),
  ];
}
