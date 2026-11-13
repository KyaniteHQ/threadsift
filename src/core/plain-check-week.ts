import { type SQLWrapper, eq, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { WEEKLY_TASK } from "./kinds.ts";
import type { Database } from "./ports.ts";
import { proposalRow, removedOpen } from "./proposal-lifecycle.ts";
import { claimedAt, claimingWeek } from "./scheduled-claim.ts";
import { proposals } from "./schema.ts";

const PLAIN_CHECK = "plain-check";

type PlainCheckKind = "highlight-lost" | "overview-gap";

export function plainCheckRow(
  kind: PlainCheckKind,
  now: number,
  subjects: Parameters<typeof proposalRow>[1],
) {
  return proposalRow(
    { kind, state: sql`'open'`, reason: sql`${PLAIN_CHECK}`, createdAt: now },
    subjects,
  );
}

export async function plainCheckWeek(
  db: Database,
  now: number,
  kind: PlainCheckKind,
  writes: Readonly<{
    inserted: BatchItem<"sqlite">;
    closedWhen: Readonly<SQLWrapper>;
  }>,
): Promise<void> {
  const task = WEEKLY_TASK[kind];

  await db.batch([
    claimingWeek(db, now, task),
    writes.inserted,
    removedOpen(db, claimedAt(task, now), eq(proposals.kind, kind), writes.closedWhen),
  ]);
}
