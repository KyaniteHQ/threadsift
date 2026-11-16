import { gt } from "drizzle-orm";

import { logFailure } from "./failure-log.ts";
import { batchAll, guardedBatch } from "./guards.ts";
import { nextItemPage } from "./item-cursor.ts";
import type { JobPorts } from "./job-outcome.ts";
import { items, searchReconciling } from "./schema.ts";
import {
  type ItemToIndex,
  itemsToIndex,
  snapshotHolds,
  stalePartWrites,
} from "./search-item-parts.ts";

const RECONCILE_BATCH = 10;

async function reconcileRow(ports: JobPorts, row: Readonly<ItemToIndex>): Promise<void> {
  const { db } = ports;

  try {
    const { fingerprinted, direct } = await stalePartWrites(
      ports,
      row,
      row.postTextKey === null ? row.postText : undefined,
    );

    if (fingerprinted.length > 0) await guardedBatch(db, snapshotHolds(row), fingerprinted);

    await batchAll(db, direct);
  } catch (error) {
    logFailure("search-parts-not-rewritten", { itemId: row.id }, error);
  }
}

export async function reconcileSearchParts(ports: JobPorts): Promise<void> {
  const { db } = ports;

  const page = await nextItemPage(db, searchReconciling, (after) =>
    itemsToIndex(db, gt(items.id, after), RECONCILE_BATCH),
  );

  for (const row of page) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- Items are reconciled sequentially.
    await reconcileRow(ports, row);
  }
}
