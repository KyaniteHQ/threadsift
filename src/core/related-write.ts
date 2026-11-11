import { type SQL, type SQLWrapper, eq, sql } from "drizzle-orm";

import { type AiRefused, retriesAi } from "./ai-contract.ts";
import { aiTaskRunning, completedAiTask } from "./ai-tasks.ts";
import { currency } from "./digest-source.ts";
import {
  type ClaimedJob,
  type JobWrites,
  type SettledOutcome,
  isLastAttempt,
} from "./job-outcome.ts";
import type { Database } from "./ports.ts";
import type { PickItem } from "./related-input.ts";
import type { RelatedResult } from "./related-task.ts";
import { digests, insertGuard, relatedItems } from "./schema.ts";

type Version = Readonly<Pick<PickItem, "id" | "digest">>;

export interface Versions {
  readonly source: Version;
  readonly sent: readonly Version[];
}

function digestHolds({ id, digest }: Version): SQL {
  return sql`exists (select 1 from ${digests} where ${digests.itemId} = ${id} and ${digests.taskId} = ${digest})`;
}

export function versionsHold({ source, sent }: Readonly<Versions>): SQL {
  const wanted = JSON.stringify(sent.map(({ id, digest }) => ({ id, digest })));

  const sentHold = sql`(select count(*) from json_each(${wanted}) as wanted join ${digests} as kept on kept.item_id = json_extract(wanted.value, '$.id') and kept.task_id = json_extract(wanted.value, '$.digest')) = ${sent.length}`;

  return sql`${digestHolds(source)} and ${sentHold}`;
}

function guarded(
  db: Database,
  current: Readonly<SQLWrapper>,
  writes: JobWrites,
  taskId: number | null = null,
): SettledOutcome {
  return { currency: currency(db, current, taskId), writes: [insertGuard(db, current), ...writes] };
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
  const current = sql`not exists (select 1 from ${digests} where ${digests.itemId} = ${itemId})`;

  return guarded(db, current, []);
}

export function closedOutcome(db: Database, source: Version): SettledOutcome {
  return guarded(db, versionsHold({ source, sent: [] }), []);
}

export function emptyOutcome(db: Database, source: Version): SettledOutcome {
  return guarded(db, versionsHold({ source, sent: [] }), replacedSet(db, source.id, []));
}

export function lostOutcome(db: Database): SettledOutcome {
  return guarded(db, sql`0`, []);
}

export function pickedOutcome(
  db: Database,
  {
    versions,
    taskId,
    result,
  }: Readonly<{ versions: Versions; taskId: number; result: Readonly<RelatedResult> }>,
): SettledOutcome {
  const current = sql`${versionsHold(versions)} and ${aiTaskRunning(taskId)}`;

  return guarded(
    db,
    current,
    [...replacedSet(db, versions.source.id, result.picks), completedAiTask(db, { taskId, result })],
    taskId,
  );
}

export async function refusedOutcome(
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
  const retriable = retriesAi(result);
  const current = versionsHold(versions);
  const held = currency(db, current, result.taskId);

  if (!retriable || isLastAttempt(job.attempts) || !(await held.current())) {
    return { currency: held, failedAttempt: retriable, writes: [insertGuard(db, current)] };
  }

  throw new Error(`Related pick ${result.reason}`);
}
