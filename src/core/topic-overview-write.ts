import { sql } from "drizzle-orm";

import { aiTaskRunning, completedAiTask } from "./ai-tasks.ts";
import { guardedOutcome } from "./guarded-outcome.ts";
import type { SettledOutcome } from "./job-outcome.ts";
import type { Database } from "./ports.ts";
import { inputsHold } from "./topic-coverage.ts";
import { type TopicLease, leaseHolds, releaseTopicLease } from "./topic-lease.ts";
import type { OverviewBasis, OverviewSent } from "./topic-overview-input.ts";
import { type OverviewResult, overviewText } from "./topic-overview-task.ts";
import { storedPage } from "./topic-page-store.ts";

export function idleOutcome(db: Database, lease: Readonly<TopicLease>): SettledOutcome {
  return guardedOutcome(db, sql`1`, { cleanup: [releaseTopicLease(db, lease)] });
}

export function currentInputs(
  lease: Readonly<TopicLease>,
  read: Readonly<OverviewBasis>,
  included: OverviewSent["included"],
) {
  return sql`${leaseHolds(lease)} and ${inputsHold(lease.topicId, {
    revision: read.page?.revision ?? 0,
    included,
    removed: read.removed,
  })}`;
}

export function keptOutcome(
  db: Database,
  lease: Readonly<TopicLease>,
  { read, prompt }: Readonly<{ read: Readonly<OverviewBasis>; prompt: Readonly<OverviewSent> }>,
): SettledOutcome {
  const stored = storedPage(db, {
    topicId: lease.topicId,
    read,
    prompt,
    overview: prompt.current,
  });

  return {
    ...guardedOutcome(db, currentInputs(lease, read, prompt.included), {
      writes: stored.writes,
      cleanup: [releaseTopicLease(db, lease)],
    }),
    continuation: stored.continuation,
  };
}

export function revisedOutcome(
  db: Database,
  lease: Readonly<TopicLease>,
  {
    read,
    prompt,
    taskId,
    result,
  }: Readonly<{
    read: Readonly<OverviewBasis>;
    prompt: Readonly<OverviewSent>;
    taskId: number;
    result: Readonly<OverviewResult>;
  }>,
): SettledOutcome {
  const overview = result.unchanged ? prompt.current : overviewText(result);
  const stored = storedPage(db, { topicId: lease.topicId, read, prompt, overview });

  const current = sql`${currentInputs(lease, read, prompt.included)} and ${aiTaskRunning(taskId)}`;

  return {
    ...guardedOutcome(db, current, {
      taskId,
      writes: [...stored.writes, completedAiTask(db, { taskId, result })],
      cleanup: [releaseTopicLease(db, lease)],
    }),
    continuation: stored.continuation,
  };
}
