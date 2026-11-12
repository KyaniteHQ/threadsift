import { sql } from "drizzle-orm";

import { proposeLostHighlights } from "./highlight-proposals.ts";
import type { JobPorts } from "./job-outcome.ts";
import { enqueueRows, opening } from "./job-rows.ts";
import { type MergeKind, PROPOSAL_KINDS, type ProposalKind, WEEKLY_TASK } from "./kinds.ts";
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

const WEEKLY_RUN = {
  "tag-merge": (ports, now) => openModelRun(ports, now, "tag-merge"),
  "topic-merge": (ports, now) => openModelRun(ports, now, "topic-merge"),
  "highlight-lost": ({ db }, now) => proposeLostHighlights(db, now),
} as const satisfies Readonly<
  Record<ProposalKind, (ports: JobPorts, now: number) => Promise<void>>
>;

export function weeklyStages(
  ports: JobPorts,
  now: number,
): readonly (readonly [name: string, run: () => Promise<void>])[] {
  return PROPOSAL_KINDS.map((kind) => [
    WEEKLY_TASK[kind].replaceAll("_", "-"),
    () => WEEKLY_RUN[kind](ports, now),
  ]);
}
