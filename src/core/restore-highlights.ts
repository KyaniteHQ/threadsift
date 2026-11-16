import { type SQLWrapper, and, asc, eq, exists, gt, sql } from "drizzle-orm";

import { anchoredOutcome } from "./highlight-publish.ts";
import type { JobPorts, JobWrites, SettledOutcome } from "./job-outcome.ts";
import { type Note, commentDisplay, postDisplay } from "./restore-anchor-display.ts";
import {
  ItemsCursorSchema,
  KEPT_HIGHLIGHTS,
  RESTORE_INDEX_BYTES,
  RESTORE_INDEX_ITEMS,
  START_CURSOR,
} from "./restore-contract.ts";
import { tallied } from "./restore-tally.ts";
import { type RestoreSet, snapshotted, steppedUnit } from "./restore-unit.ts";
import { type RestoreRow, highlights, items, restoreRuns } from "./schema.ts";

function anchorItem(ports: JobPorts, itemId: number, note: Note) {
  return anchoredOutcome(
    ports.db,
    { writes: [] },
    {
      owner: eq(items.id, itemId),
      displayed: async (snapshot) => ({
        ...(await postDisplay(ports, snapshot, note)),
        ...(await commentDisplay(ports, snapshot, note)),
      }),
    },
  );
}

function ownersAfter(db: JobPorts["db"], after: number) {
  return db
    .select({ id: items.id })
    .from(items)
    .where(
      and(
        gt(items.id, after),
        exists(
          db
            .select({ one: sql`1` })
            .from(highlights)
            .where(eq(highlights.itemId, items.id)),
        ),
      ),
    )
    .orderBy(asc(items.id))
    .limit(RESTORE_INDEX_ITEMS);
}

interface Anchored {
  readonly writes: JobWrites;
  readonly holds: readonly Readonly<SQLWrapper>[];
  readonly last: number;
  readonly kept: number;
}

async function anchored(
  ports: JobPorts,
  owners: readonly Readonly<{ id: number }>[],
  after: number,
): Promise<Anchored> {
  const writes: JobWrites[number][] = [];
  const holds: Readonly<SQLWrapper>[] = [];
  let kept = 0;
  let read = 0;
  let last = after;

  const note: Note = (heldBack, bytes) => {
    kept += heldBack;
    read += bytes;
  };

  for (const { id } of owners) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- the loop stops at RESTORE_INDEX_BYTES of text read, so Items are anchored one after another.
    const { writes: placed, precondition } = await anchorItem(ports, id, note);

    writes.push(...placed);
    holds.push(precondition.holds);
    last = id;

    if (read >= RESTORE_INDEX_BYTES) break;
  }

  return { writes, holds, last, kept };
}

export async function highlightsUnit(
  ports: JobPorts,
  run: Readonly<RestoreRow>,
): Promise<SettledOutcome> {
  const { db } = ports;
  const { after } = ItemsCursorSchema.parse(JSON.parse(run.cursor));
  const owners = await ownersAfter(db, after);

  if (owners.length === 0) {
    return steppedUnit(db, run, { phase: "finish", cursor: JSON.stringify(START_CURSOR) });
  }

  const { writes, holds, last, kept } = await anchored(ports, owners, after);
  const set: RestoreSet = { cursor: JSON.stringify({ after: last }) };

  return snapshotted(
    ports,
    run,
    steppedUnit(
      db,
      run,
      kept === 0 ? set : { ...set, dropped: tallied(restoreRuns.dropped, KEPT_HIGHLIGHTS, kept) },
      writes,
    ),
    holds,
    (current) => highlightsUnit(ports, current),
  );
}
