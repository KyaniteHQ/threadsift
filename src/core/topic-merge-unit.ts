import { and, sql } from "drizzle-orm";

import { TOPIC_KIND, among, topicClosingWrites, topicMoves } from "./catalog-key-links.ts";
import { catalogKey } from "./catalog-key.ts";
import { loggedMerge } from "./log-writes.ts";
import type { MergeUnit, PlanUnit } from "./merge-unit.ts";
import { repointedTopicPins } from "./pins.ts";
import type { Database } from "./ports.ts";
import { items, pins } from "./schema.ts";
import { type TopicLease, claimTopicLease, leaseHolds, releaseTopicLease } from "./topic-lease.ts";

async function release(db: Database, leases: readonly Readonly<TopicLease>[]): Promise<void> {
  const [first, ...rest] = leases.map((lease) => releaseTopicLease(db, lease));

  if (first !== undefined) await db.batch([first, ...rest]);
}

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

    await release(db, [first]);

    return null;
  } catch (error) {
    await release(db, [first]);

    throw error;
  }
}

export const planTopicUnit: PlanUnit = async (db, id, row) => {
  const holder = `topic_merge:${String(id)}:${String(row.revision)}`;
  const leases = await claimBoth(db, [row.from.id, row.into.id], holder);

  if (leases === null) return "busy";

  try {
    return await readUnit(db, id, row, leases);
  } catch (error) {
    await release(db, leases);

    throw error;
  }
};

async function readUnit(
  db: Database,
  id: number,
  row: Parameters<PlanUnit>[2],
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
    guard: sql`${and(...leases.map((lease) => leaseHolds(lease)))}`,
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
        .onConflictDoNothing(),
      repointedTopicPins(db, from.id, into.id),
    ],
    moves: topicMoves(db, from.id, into.id, moves),
    cursor: null,
    release: leases.map((lease) => releaseTopicLease(db, lease)),
    closing: closing.writes,
    opening: closing.opening,
  };
}
