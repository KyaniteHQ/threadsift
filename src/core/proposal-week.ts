import { sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { staleDisagreements } from "./disagreement-rows.ts";
import { proposeLostHighlights } from "./highlight-proposals.ts";
import type { JobPorts } from "./job-outcome.ts";
import { enqueueRows, opening } from "./job-rows.ts";
import { type MergeKind, PROPOSAL_KINDS, type ProposalKind, WEEKLY_TASK } from "./kinds.ts";
import { proposeOverviewGaps } from "./overview-proposals.ts";
import { NEWEST_DIGESTED_ITEM, claimingWeek } from "./scheduled-claim.ts";
import { items } from "./schema.ts";

type ModelRunKind = MergeKind | "items-disagree";

async function openModelRun(
  ports: JobPorts,
  now: number,
  kind: ModelRunKind,
  after: readonly BatchItem<"sqlite">[] = [],
) {
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
    ...after,
  ]);

  await enqueueRows(ports, opened);
}

interface WeeklyRun {
  readonly stage: string;
  readonly run: (ports: JobPorts, now: number) => Promise<void>;
}

const WEEKLY_RUN = {
  "tag-merge": { stage: "proposals", run: (ports, now) => openModelRun(ports, now, "tag-merge") },
  "topic-merge": {
    stage: "topic-proposals",
    run: (ports, now) => openModelRun(ports, now, "topic-merge"),
  },
  "highlight-lost": {
    stage: "highlight-proposals",
    run: ({ db }, now) => proposeLostHighlights(db, now),
  },
  "overview-gap": {
    stage: "overview-proposals",
    run: ({ db }, now) => proposeOverviewGaps(db, now),
  },
  "items-disagree": {
    stage: "disagreement-proposals",
    run: (ports, now) =>
      openModelRun(ports, now, "items-disagree", [staleDisagreements(ports.db, now)]),
  },
} as const satisfies Readonly<Record<ProposalKind, WeeklyRun>>;

export function weeklyStages(
  ports: JobPorts,
  now: number,
): readonly (readonly [name: string, run: () => Promise<void>])[] {
  return PROPOSAL_KINDS.map((kind) => [
    WEEKLY_RUN[kind].stage,
    () => WEEKLY_RUN[kind].run(ports, now),
  ]);
}
