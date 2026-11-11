import { eq, lt, sql } from "drizzle-orm";

import { AI_DEADLINE_MS } from "./ai-contract.ts";
import type { Database } from "./ports.ts";
import { topicLeases } from "./schema.ts";

const TOPIC_LEASE_MS = AI_DEADLINE_MS + 2 * 60 * 1000;

export interface TopicLease {
  readonly topicId: number;
  readonly holder: string;
  readonly generation: number;
}

export function leaseHolds({ topicId, holder, generation }: Readonly<TopicLease>) {
  return sql`exists (select 1 from ${topicLeases} where ${topicLeases.topicId} = ${topicId} and ${topicLeases.holder} = ${holder} and ${topicLeases.generation} = ${generation} and ${topicLeases.expiresAt} > ${Date.now()})`;
}

export function leaseMatches({ topicId, holder, generation }: Readonly<TopicLease>) {
  return sql`${topicLeases.topicId} = ${topicId} and ${topicLeases.holder} = ${holder} and ${topicLeases.generation} = ${generation}`;
}

export function releaseTopicLease(db: Database, lease: Readonly<TopicLease>) {
  return db.update(topicLeases).set({ expiresAt: 0 }).where(leaseMatches(lease));
}

export function recoverHolderLeases(db: Database, holder: string) {
  return db.update(topicLeases).set({ expiresAt: 0 }).where(eq(topicLeases.holder, holder));
}

export async function claimTopicLease(
  db: Database,
  topicId: number,
  holder: string,
): Promise<TopicLease | null> {
  const [claimed] = await db
    .insert(topicLeases)
    .values({ topicId, holder, expiresAt: Date.now() + TOPIC_LEASE_MS, generation: 1 })
    .onConflictDoUpdate({
      target: topicLeases.topicId,
      set: {
        holder,
        expiresAt: Date.now() + TOPIC_LEASE_MS,
        generation: sql`${topicLeases.generation} + 1`,
      },
      setWhere: sql`${lt(topicLeases.expiresAt, Date.now())} or ${eq(topicLeases.holder, holder)}`,
    })
    .returning({ generation: topicLeases.generation });

  if (claimed === undefined) return null;

  return { topicId, holder, generation: claimed.generation };
}
