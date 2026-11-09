import { and, eq, exists, ne, notExists, sql } from "drizzle-orm";

import { openingDigest } from "./digest-job.ts";
import { setDigestFailure } from "./digest-source.ts";
import {
  LISTED_COLUMNS,
  type ListedItemRow,
  getListedItem,
  selectItems,
} from "./item-selection.ts";
import { enqueueRows, hasOpenJob } from "./job-rows.ts";
import type { Ports } from "./ports.ts";
import { items } from "./schema.ts";

export async function retryDigest(ports: Ports, id: number): Promise<ListedItemRow | undefined> {
  const [known] = await ports.db
    .select({
      originalUrl: items.originalUrl,
      normalizedUrl: items.normalizedUrl,
      status: items.status,
    })
    .from(items)
    .where(eq(items.id, id));

  if (known === undefined) return undefined;

  if (known.status === "failed") return getListedItem(ports.db, id);

  const live = and(eq(items.id, id), ne(items.status, "failed")) ?? sql`0`;

  const [, queued, , , [item]] = await ports.db.batch([
    ports.db
      .update(items)
      .set({ pendingDigest: null })
      .where(and(live, notExists(hasOpenJob("digest")))),
    openingDigest(ports.db, {
      scope: live,
      address: known.originalUrl,
      now: Date.now(),
    }).job,
    setDigestFailure(ports.db, id, false),
    ports.db
      .update(items)
      .set({ status: "processing", reason: null })
      .where(and(live, exists(hasOpenJob("digest")))),
    selectItems(ports.db, LISTED_COLUMNS).where(eq(items.normalizedUrl, known.normalizedUrl)),
  ]);

  await enqueueRows(ports, queued);

  return item;
}
