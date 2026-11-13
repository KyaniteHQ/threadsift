import { eq, sql } from "drizzle-orm";

import type { AiRefused } from "./ai-contract.ts";
import { aiTaskRunning, completedAiTask } from "./ai-tasks.ts";
import { guardedOutcome, refusalOutcome } from "./guarded-outcome.ts";
import type { ClaimedJob, JobWrites, SettledOutcome } from "./job-outcome.ts";
import { loggedRelated } from "./log-writes.ts";
import type { Database } from "./ports.ts";
import { type Version, type Versions, versionsHold } from "./related-input.ts";
import type { RelatedResult } from "./related-task.ts";
import { digests, relatedItems } from "./schema.ts";

function replacedSet(db: Database, sourceId: number, picks: RelatedResult["picks"]): JobWrites {
  return [
    db.delete(relatedItems).where(eq(relatedItems.itemId, sourceId)),
    db.insert(relatedItems).select(
      db
        .select({
          itemId: sql<number>`${sourceId}`.as("item_id"),
          relatedId: sql<number>`json_extract(pick.value, '$.item')`.as("related_id"),
          position: sql<number>`pick.key`.as("position"),
          reason: sql<string>`json_extract(pick.value, '$.reason')`.as("reason"),
        })
        .from(sql`json_each(${JSON.stringify(picks)}) as pick`),
    ),
  ];
}

export function noDigestOutcome(db: Database, itemId: number): SettledOutcome {
  return guardedOutcome(
    db,
    sql`not exists (select 1 from ${digests} where ${digests.itemId} = ${itemId})`,
  );
}

export function closedOutcome(db: Database, source: Version): SettledOutcome {
  return guardedOutcome(db, versionsHold({ source, sent: [] }));
}

export function emptyOutcome(db: Database, source: Version): SettledOutcome {
  return guardedOutcome(db, versionsHold({ source, sent: [] }), {
    writes: replacedSet(db, source.id, []),
  });
}

export function pickedOutcome(
  db: Database,
  {
    versions,
    taskId,
    result,
  }: Readonly<{ versions: Versions; taskId: number; result: Readonly<RelatedResult> }>,
): SettledOutcome {
  return guardedOutcome(db, sql`${versionsHold(versions)} and ${aiTaskRunning(taskId)}`, {
    taskId,
    writes: [
      ...replacedSet(db, versions.source.id, result.picks),
      ...(result.picks.length === 0
        ? []
        : [loggedRelated(db, versions.source.id, result.picks.length)]),
      completedAiTask(db, { taskId, result }),
    ],
  });
}

export function refusedOutcome(
  db: Database,
  job: Readonly<ClaimedJob>,
  {
    result,
    versions,
  }: Readonly<{
    result: Readonly<AiRefused & { readonly taskId: number | null }>;
    versions: Versions;
  }>,
): Promise<SettledOutcome> {
  return refusalOutcome(db, job, {
    result,
    current: versionsHold(versions),
    label: "Related pick",
  });
}
