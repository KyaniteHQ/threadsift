import { type SQL, eq, sql } from "drizzle-orm";

import type { AiRefused } from "./ai-contract.ts";
import { aiTaskRunning, completedAiTask } from "./ai-tasks.ts";
import { guardedOutcome, refusalOutcome } from "./guarded-outcome.ts";
import type { ClaimedJob, JobWrites, SettledOutcome } from "./job-outcome.ts";
import { loggedRelated } from "./log-writes.ts";
import type { Database } from "./ports.ts";
import type { PickItem } from "./related-input.ts";
import type { RelatedResult } from "./related-task.ts";
import { digests, relatedItems } from "./schema.ts";

type Version = Readonly<Pick<PickItem, "id" | "digest">>;

interface Versions {
  readonly source: Version;
  readonly sent: readonly Version[];
}

function digestHolds({ id, digest }: Version): SQL {
  return sql`exists (select 1 from ${digests} where ${digests.itemId} = ${id} and ${digests.taskId} = ${digest})`;
}

function versionsHold({ source, sent }: Readonly<Versions>): SQL {
  const wanted = JSON.stringify(sent.map(({ id, digest }) => ({ id, digest })));

  const sentHold = sql`(select count(*) from json_each(${wanted}) as wanted join ${digests} as kept on kept.item_id = json_extract(wanted.value, '$.id') and kept.task_id = json_extract(wanted.value, '$.digest')) = ${sent.length}`;

  return sql`${digestHolds(source)} and ${sentHold}`;
}

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

export function lostOutcome(db: Database): SettledOutcome {
  return guardedOutcome(db, sql`0`);
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
