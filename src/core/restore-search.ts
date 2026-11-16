import { gt } from "drizzle-orm";

import type { JobPorts, JobWrites, SettledOutcome } from "./job-outcome.ts";
import { postTextOf } from "./post-text.ts";
import {
  ItemsCursorSchema,
  RESTORE_INDEX_BYTES,
  RESTORE_INDEX_ITEMS,
  START_ITEMS,
} from "./restore-contract.ts";
import { snapshotted, steppedUnit } from "./restore-unit.ts";
import { type RestoreRow, items } from "./schema.ts";
import { itemsToIndex, snapshotHolds, stalePartWrites } from "./search-item-parts.ts";

const ENCODER = new TextEncoder();

export async function searchUnit(
  ports: JobPorts,
  run: Readonly<RestoreRow>,
): Promise<SettledOutcome> {
  const { db, files } = ports;
  const { after } = ItemsCursorSchema.parse(JSON.parse(run.cursor));
  const rows = await itemsToIndex(db, gt(items.id, after), RESTORE_INDEX_ITEMS);

  if (rows.length === 0) {
    return steppedUnit(db, run, { phase: "highlights", cursor: JSON.stringify(START_ITEMS) });
  }

  const writes: JobWrites[number][] = [];
  const holds = [];
  let last = after;
  let held = 0;

  for (const row of rows) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- the loop stops at RESTORE_INDEX_BYTES of text and Kept comments, so Items are read one after another.
    const text = row.postTextKey === null ? row.postText : await postTextOf(files, row.id, row);
    const fileBacked = row.postTextKey !== null;
    const indexed = fileBacked ? { ...row, fingerprint: null } : row;
    // oxlint-disable-next-line eslint/no-await-in-loop -- the Kept comments of one Item are read after its text, inside the same byte budget.
    const parts = await stalePartWrites(ports, indexed, text);

    writes.push(...parts.fingerprinted, ...parts.direct);

    if (parts.fingerprinted.length > 0) holds.push(snapshotHolds(row));

    last = row.id;
    held += ENCODER.encode(text ?? "").length + parts.commentBytes;

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
