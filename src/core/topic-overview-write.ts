import { type SQLWrapper, sql } from "drizzle-orm";

import { aiTaskRunning, completedAiTask } from "./ai-tasks.ts";
import { currency } from "./digest-source.ts";
import type { JobWrites, SettledOutcome } from "./job-outcome.ts";
import type { Database } from "./ports.ts";
import { insertGuard, topicPages } from "./schema.ts";
import { inputsHold } from "./topic-coverage.ts";
import { type TopicLease, leaseHolds, releaseTopicLease } from "./topic-lease.ts";
import type { OverviewPrompt, OverviewRead } from "./topic-overview-input.ts";
import { type OverviewResult, overviewText } from "./topic-overview-task.ts";

export function idleOutcome(db: Database, lease: Readonly<TopicLease>): SettledOutcome {
  return {
    currency: currency(db, sql`1`, null, [releaseTopicLease(db, lease)]),
    writes: [releaseTopicLease(db, lease)],
  };
}

export function lostOutcome(db: Database, lease: Readonly<TopicLease>): SettledOutcome {
  return {
    currency: currency(db, sql`0`, null, [releaseTopicLease(db, lease)]),
    writes: [insertGuard(db, sql`0`)],
  };
}

function revisedPage(
  topicId: number,
  read: Readonly<OverviewRead>,
  prompt: Readonly<OverviewPrompt>,
  overview: string | null,
) {
  const gone = new Set(read.removed);
  const replaced = new Set(prompt.included.map(({ id }) => id));

  const kept = (read.page?.builtFrom ?? []).filter(
    ({ item }) => !gone.has(item) && !replaced.has(item),
  );

  return {
    topicId,
    overview,
    revision: (read.page?.revision ?? 0) + 1,
    builtFrom: [...kept, ...prompt.included.map(({ id, digest }) => ({ item: id, digest }))],
    failure: null,
    updatedAt: Date.now(),
  };
}

export function currentInputs(
  lease: Readonly<TopicLease>,
  read: Readonly<OverviewRead>,
  included: OverviewPrompt["included"],
) {
  return sql`${leaseHolds(lease)} and ${inputsHold(lease.topicId, {
    revision: read.page?.revision ?? 0,
    included,
    removed: read.removed,
  })}`;
}

function storedPage(
  db: Database,
  current: Readonly<SQLWrapper>,
  {
    topicId,
    read,
    prompt,
    overview,
  }: Readonly<{
    topicId: number;
    read: Readonly<OverviewRead>;
    prompt: Readonly<OverviewPrompt>;
    overview: string | null;
  }>,
): JobWrites {
  const stored = revisedPage(topicId, read, prompt, overview);

  return [
    insertGuard(db, current),
    db
      .insert(topicPages)
      .values(stored)
      .onConflictDoUpdate({ target: topicPages.topicId, set: stored }),
  ];
}

export function keptOutcome(
  db: Database,
  lease: Readonly<TopicLease>,
  { read, prompt }: Readonly<{ read: Readonly<OverviewRead>; prompt: Readonly<OverviewPrompt> }>,
): SettledOutcome {
  const current = currentInputs(lease, read, prompt.included);

  return {
    currency: currency(db, current, null, [releaseTopicLease(db, lease)]),
    writes: [
      ...storedPage(db, current, {
        topicId: lease.topicId,
        read,
        prompt,
        overview: prompt.current,
      }),
      releaseTopicLease(db, lease),
    ],
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
    read: Readonly<OverviewRead>;
    prompt: Readonly<OverviewPrompt>;
    taskId: number;
    result: Readonly<OverviewResult>;
  }>,
): SettledOutcome {
  const overview = result.unchanged ? prompt.current : overviewText(result);

  const current = sql`${currentInputs(lease, read, prompt.included)} and ${aiTaskRunning(taskId)}`;

  return {
    currency: currency(db, current, taskId, [releaseTopicLease(db, lease)]),
    writes: [
      ...storedPage(db, current, { topicId: lease.topicId, read, prompt, overview }),
      completedAiTask(db, { taskId, result }),
      releaseTopicLease(db, lease),
    ],
  };
}
