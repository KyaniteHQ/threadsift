import { and, eq, notExists, sql } from "drizzle-orm";

import { markDigest } from "../../../core/kernel/digest-marker.ts";
import { openingDigest } from "../../../core/kernel/digest-opening.ts";
import { IS_FAILED, NOT_FAILED } from "../../../core/kernel/item-status.ts";
import { enqueueRows, hasOpenJob } from "../../../core/kernel/job-rows.ts";
import type { Ports } from "../../../core/kernel/ports.ts";
import { type Closed, heldOffWrites, whileOpen } from "../../../core/kernel/restore-hold.ts";
import { items } from "../../../core/kernel/schema.ts";
import {
  LISTED_COLUMNS,
  type ListedItemRow,
  getListedItem,
  selectItems,
} from "../../item/core/item-selection.ts";

export async function retryDigest(
  ports: Ports,
  id: number,
): Promise<ListedItemRow | Closed | undefined> {
  const [known] = await ports.db
    .select({
      originalUrl: items.originalUrl,
      normalizedUrl: items.normalizedUrl,
      failed: sql<boolean>`${IS_FAILED}`.mapWith(Boolean),
    })
    .from(items)
    .where(eq(items.id, id));

  if (known === undefined) return undefined;

  if (known.failed) return getListedItem(ports.db, id);

  const live = and(eq(items.id, id), NOT_FAILED) ?? sql`0`;

  const written = await whileOpen(() =>
    ports.db.batch(
      heldOffWrites(ports.db, [
        ports.db
          .update(items)
          .set({ pendingDigest: null })
          .where(and(live, notExists(hasOpenJob("digest")))),
        openingDigest(ports.db, {
          scope: live,
          address: known.originalUrl,
          now: Date.now(),
        }),
        markDigest(ports.db, id, "cleared"),
        selectItems(ports.db, LISTED_COLUMNS).where(eq(items.normalizedUrl, known.normalizedUrl)),
      ] as const),
    ),
  );

  if ("kind" in written) return written;

  const [, , queued, , [item]] = written;

  await enqueueRows(ports, queued);

  return item;
}
