import { sql } from "drizzle-orm";

import type { Stored } from "./ai-kind-types.ts";
import type { Database } from "./database.ts";
import { guardedOutcome } from "./guarded-outcome.ts";
import type { SettledOutcome } from "./job-outcome.ts";
import { inputsHold, removedItemIds, uncoveredCount } from "./topic-coverage.ts";
import type { OverviewContext } from "./topic-overview-context.ts";
import { overviewText } from "./topic-overview-contract.ts";
import type { OverviewBasis, OverviewSent } from "./topic-overview-input.ts";
import type { OverviewResult } from "./topic-overview-task.ts";
import { storedPage } from "./topic-page-store.ts";

export function idleOutcome(
  db: Database,
  topicId: number,
  { unreadable }: Readonly<{ unreadable: number }>,
): SettledOutcome {
  const noGaps = sql`${uncoveredCount(topicId)} = ${unreadable} and not exists (${removedItemIds(topicId)})`;

  return guardedOutcome(db, noGaps);
}

export function currentInputs(
  topicId: number,
  read: Readonly<OverviewBasis>,
  included: OverviewSent["included"],
) {
  return inputsHold(topicId, {
    revision: read.page?.revision ?? 0,
    included,
    removed: read.removed,
    removedTotal: read.removedTotal,
  });
}

export async function keptOutcome(
  db: Database,
  topicId: number,
  { read, prompt }: Readonly<{ read: Readonly<OverviewBasis>; prompt: Readonly<OverviewSent> }>,
): Promise<SettledOutcome> {
  const stored = await storedPage(db, {
    topicId,
    read,
    prompt,
    overview: prompt.current,
  });

  return {
    ...guardedOutcome(db, currentInputs(topicId, read, prompt.included), {
      writes: stored.writes,
    }),
    continuation: stored.continuation,
  };
}

export async function revisedStored(
  db: Database,
  { context, result }: Readonly<{ context: OverviewContext; result: Readonly<OverviewResult> }>,
): Promise<Stored> {
  const overview = result.unchanged ? context.current : overviewText(result);

  const stored = await storedPage(db, {
    topicId: context.topicId,
    read: {
      page: { revision: context.revision, builtFrom: context.builtFrom },
      removed: context.removed,
      removedTotal: context.removedTotal,
    },
    prompt: { current: context.current, included: context.included },
    overview,
  });

  return { writes: stored.writes, continuation: stored.continuation };
}
