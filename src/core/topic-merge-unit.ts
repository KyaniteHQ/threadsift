import { count, inArray, sql } from "drizzle-orm";

import { TOPIC_KIND, topicClosingWrites, topicMoves } from "./catalog-key-links.ts";
import { catalogKey } from "./catalog-key.ts";
import { among } from "./guards.ts";
import { loggedMerge } from "./log-writes.ts";
import type { MergeRow, MergeUnit, PlanUnit } from "./merge-unit.ts";
import { repointedTopicPins } from "./pins.ts";
import type { Database } from "./ports.ts";
import { items, pins, topics } from "./schema.ts";
import { type TopicLease, claimTopicLease, releaseTopicLeases } from "./topic-lease.ts";

async function claimBoth(
  db: Database,
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

    await releaseTopicLeases(db, [first]);

    return null;
  } catch (error) {
    await releaseTopicLeases(db, [first]);

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
  row: Readonly<MergeRow>,
  holder: string,
): Promise<readonly [TopicLease, TopicLease] | null | "lost"> {
  const ids = [row.from.id, row.into.id] as const;

  try {
    return await claimBoth(db, ids, holder);
  } catch (error) {
    if (await topicsExist(db, ids)) throw error;

    return "lost";
  }
}

export const planTopicUnit: PlanUnit = async (db, id, row) => {
  const holder = `topic_merge:${String(id)}:${String(row.revision)}`;
  const leases = await claimed(db, row, holder);

  if (leases === "lost") return "lost";

  if (leases === null) return "busy";

  try {
    return await readUnit(db, id, row, leases);
  } catch (error) {
    await releaseTopicLeases(db, leases);

    throw error;
  }
};

async function readUnit(
  db: Database,
  id: number,
  row: Readonly<MergeRow>,
  leases: readonly [TopicLease, TopicLease],
): Promise<MergeUnit> {
  const from = { id: row.from.id, name: row.from.name };
  const into = { id: row.into.id, name: row.into.name };
  const moves = await TOPIC_KIND.linked(db, from.id);

  const closing = topicClosingWrites(db, from.id, into.id, [
    loggedMerge(db, {
      action: "merge-topic",
      proposalId: id,
      mergedFrom: from.name,
      mergedInto: into.name,
      when: TOPIC_KIND.unlinked(db, from.id),
    }),
  ]);

  return {
    leases,
    moving: sql`(select count(*) from ${items} where ${items.topicId} = ${from.id} and ${among(items.id, moves.itemIds)})`,
    pin: [
      db
        .insert(pins)
        .values({
          kind: "topic-merge",
          fromKey: catalogKey(from.name),
          fromName: from.name,
          intoTopicId: into.id,
          createdAt: Date.now(),
        })
        .onConflictDoUpdate({ target: [pins.kind, pins.fromKey], set: { intoTopicId: into.id } }),
      repointedTopicPins(db, from.id, into.id),
    ],
    moves: topicMoves(db, from.id, into.id, moves),
    cursor: null,
    closing,
  };
}
