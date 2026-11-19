import { eq } from "drizzle-orm";

import type { Digest } from "./ai-contract.ts";
import { completedAiTask } from "./ai-tasks.ts";
import { type CatalogEntries, publishedLinks } from "./catalog.ts";
import type { Database } from "./database.ts";
import { markDigest, openingPick } from "./digest-source.ts";
import { selectionWrites } from "./reddit-thread.ts";
import { digests, items } from "./schema.ts";
import { commentPartWrites, digestPartWrites } from "./search.ts";
import { queueVaultItems } from "./vault-queue.ts";

interface DigestWrite {
  readonly stored: Readonly<typeof digests.$inferSelect>;
  readonly entries: CatalogEntries;
  readonly published: Readonly<Digest>;
  readonly taskId: number;
  readonly bodies: readonly string[];
}

export function digestWrites(
  db: Database,
  { stored, entries, published, taskId, bodies }: Readonly<DigestWrite>,
) {
  const { itemId, generation, title } = stored;

  return [
    ...publishedLinks(db, itemId, entries, title),
    db.insert(digests).values(stored).onConflictDoUpdate({ target: digests.itemId, set: stored }),
    openingPick(db, itemId),
    ...selectionWrites(db, { itemId, generation }, published.keptComments ?? []),
    ...digestPartWrites(db, eq(items.id, itemId)),
    ...commentPartWrites(db, eq(items.id, itemId), bodies),
    completedAiTask(db, { taskId, result: published }),
    db.update(items).set({ pendingDigest: null }).where(eq(items.id, itemId)),
    markDigest(db, itemId, "cleared"),
    queueVaultItems(db, eq(items.id, itemId)),
  ];
}
