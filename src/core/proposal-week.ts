import { sql } from "drizzle-orm";

import { proposeLostHighlights } from "./highlight-proposals.ts";
import type { JobPorts } from "./job-outcome.ts";
import { enqueueRows, opening } from "./job-rows.ts";
import { type MergeKind, type ProposalKind, WEEKLY_TASK } from "./kinds.ts";
import { items } from "./schema.ts";
import { NEWEST_DIGESTED_ITEM, claimingWeek } from "./weekly-claim.ts";

async function openModelRun(ports: JobPorts, now: number, kind: MergeKind) {
  const { db } = ports;
  const task = WEEKLY_TASK[kind];

  const [, opened] = await db.batch([
    claimingWeek(db, now, task),
    opening(db, {
      kind: task,
      address: sql`${items.originalUrl}`,
      now,
      where: sql`${items.id} = ${NEWEST_DIGESTED_ITEM} and changes() > 0`,
    }),
  ]);

  await enqueueRows(ports, opened);
}

export function openWeeklyRun(ports: JobPorts, now: number, kind: ProposalKind): Promise<void> {
  return kind === "highlight-lost"
    ? proposeLostHighlights(ports.db, now)
    : openModelRun(ports, now, kind);
}
