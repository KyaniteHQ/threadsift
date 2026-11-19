import { type SQLWrapper, eq } from "drizzle-orm";

import type { Digest } from "./ai-contract.ts";
import { completedAiTask } from "./ai-task-rows.ts";
import { type CatalogEntries, publishedLinks } from "./catalog.ts";
import type { Database } from "./database.ts";
import { markDigest, openingPick } from "./digest-source.ts";
import { insertGuard } from "./guards.ts";
import { selectionWrites } from "./reddit-thread.ts";
import { digests, items } from "./schema.ts";
import { commentPartWrites, digestPartWrites } from "./search.ts";
import { queueVaultItems } from "./vault-queue.ts";

interface KeptSelection {
  readonly ids: readonly string[];
  readonly bodies: readonly string[];
}

interface DigestWriteInput {
  readonly current: Readonly<SQLWrapper>;
  readonly stored: Readonly<typeof digests.$inferSelect>;
  readonly entries: CatalogEntries;
  readonly published: Readonly<Digest>;
  readonly kept: Readonly<KeptSelection>;
}

export function digestWrites(
  db: Database,
  { current, stored, entries, published, kept }: Readonly<DigestWriteInput>,
) {
  const { itemId, generation, title, taskId } = stored;

  return [
    insertGuard(db, current),
    ...publishedLinks(db, itemId, entries, title),
    db.insert(digests).values(stored).onConflictDoUpdate({ target: digests.itemId, set: stored }),
    openingPick(db, itemId),
    ...selectionWrites(db, { itemId, generation }, kept.ids),
    ...digestPartWrites(db, eq(items.id, itemId)),
    ...commentPartWrites(db, eq(items.id, itemId), kept.bodies),
    completedAiTask(db, { taskId, result: published }),
    db.update(items).set({ pendingDigest: null }).where(eq(items.id, itemId)),
    markDigest(db, itemId, "cleared"),
    queueVaultItems(db, eq(items.id, itemId)),
  ];
}
