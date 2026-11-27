import { and, eq, sql } from "drizzle-orm";

import type { Database } from "../../../core/kernel/database.ts";
import { markDigest } from "../../../core/kernel/digest-marker.ts";
import { opening } from "../../../core/kernel/job-rows.ts";
import { wokenBotWaits } from "../../../core/kernel/job-waiting.ts";
import { providerSet } from "../../../core/kernel/provider-saved.ts";
import { digests, items } from "../../../core/kernel/schema.ts";
import { STALE } from "../../../core/kernel/vault-stale.ts";
import { commentPartWrites, digestPartWrites } from "../../item/core/search.ts";
import { selectionWrites } from "../../thread/core/thread-selection.ts";
import { type CatalogEntries, publishedLinks } from "../../wiki/core/catalog.ts";

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
  const now = Date.now();

  return [
    opening(db, {
      kind: "related_pick",
      address: sql`${items.originalUrl}`,
      now,
      where: and(eq(items.id, itemId), providerSet()) ?? sql`0`,
    }),
    wokenBotWaits(db, "related_pick", itemId, now),
  ];
}

export function digestWrites(db: Database, { stored, entries, kept }: Readonly<DigestWriteInput>) {
  const { itemId, generation, title } = stored;

  return [
    ...publishedLinks(db, itemId, entries, title),
    db.insert(digests).values(stored).onConflictDoUpdate({ target: digests.itemId, set: stored }),
    ...openingPick(db, itemId),
    ...selectionWrites(db, { itemId, generation }, kept.ids),
    ...digestPartWrites(db, eq(items.id, itemId)),
    ...commentPartWrites(db, eq(items.id, itemId), kept.bodies),
    db.update(items).set({ pendingDigest: null }).where(eq(items.id, itemId)),
    markDigest(db, itemId, "cleared"),
    ...STALE.itemChanged(db, eq(items.id, itemId)),
  ];
}
