import { count, inArray } from "drizzle-orm";

import { releasedAfterFailure } from "./merge-failure.ts";
import type { MergeRow, MergeUnit } from "./merge-unit.ts";
import type { Database } from "./ports.ts";
import { topics } from "./schema.ts";
import { type TopicLease, claimTopicLease } from "./topic-lease.ts";

async function claimBoth(
  db: Database,
  id: number,
  topicIds: readonly [number, number],
  holder: string,
): Promise<readonly [TopicLease, TopicLease] | null> {
  const [low, high] = [...topicIds].toSorted((first, second) => first - second);

  if (low === undefined || high === undefined) return null;

  const first = await claimTopicLease(db, low, holder);

  if (first === null) return null;

  try {
    const second = await claimTopicLease(db, high, holder);

    if (second !== null) return [first, second];

    await releasedAfterFailure(db, id, [first]);

    return null;
  } catch (error) {
    await releasedAfterFailure(db, id, [first]);

    throw error;
  }
}

async function topicsExist(db: Database, topicIds: readonly number[]): Promise<boolean> {
  const [found] = await db
    .select({ n: count() })
    .from(topics)
    .where(inArray(topics.id, [...topicIds]));

  return found?.n === topicIds.length;
}

async function claimed(
  db: Database,
  id: number,
  row: Readonly<MergeRow>,
  holder: string,
): Promise<readonly [TopicLease, TopicLease] | null | "lost"> {
  const ids = [row.from.id, row.into.id] as const;

  try {
    return await claimBoth(db, id, ids, holder);
  } catch (error) {
    if (await topicsExist(db, ids)) throw error;

    return "lost";
  }
}

export async function readHolding(
  db: Database,
  id: number,
  row: Readonly<MergeRow>,
  read: (leases: readonly [TopicLease, TopicLease]) => Promise<MergeUnit>,
): Promise<MergeUnit | "busy" | "lost"> {
  const leases = await claimed(db, id, row, `topic_merge:${String(id)}:${String(row.revision)}`);

  if (leases === "lost") return "lost";

  if (leases === null) return "busy";

  try {
    return await read(leases);
  } catch (error) {
    await releasedAfterFailure(db, id, leases);

    throw error;
  }
}
