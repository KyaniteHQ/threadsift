import { eq } from "drizzle-orm";

import { lostOutcome } from "./guarded-outcome.ts";
import {
  type ClaimedJob,
  type DeferredOutcome,
  type JobOutcome,
  type JobWrites,
  settled,
} from "./job-outcome.ts";
import type { Database } from "./ports.ts";
import { topics } from "./schema.ts";
import { type TopicLease, claimTopicLease, releaseTopicLease } from "./topic-lease.ts";
import {
  type OverviewPrompt,
  type OverviewRead,
  overviewPrompt,
  readOverview,
  topicOfItem,
} from "./topic-overview-input.ts";
import { overviewHolder } from "./topic-overview-run.ts";
import { idleOutcome, keptOutcome } from "./topic-overview-write.ts";

const BUSY_RETRY_MS = 15_000;

export type OverviewPrepared =
  | { readonly kind: "settled"; readonly outcome: JobOutcome }
  | {
      readonly kind: "ask";
      readonly lease: TopicLease;
      readonly read: OverviewRead;
      readonly prompt: OverviewPrompt;
    };

function busyOutcome(writes: JobWrites = []): DeferredOutcome {
  return {
    deferredUntil: Date.now() + BUSY_RETRY_MS,
    wait: "topic-busy",
    countsAttempt: false,
    writes,
  };
}

async function readyOverview(db: Database, lease: Readonly<TopicLease>): Promise<OverviewPrepared> {
  const read = await readOverview(db, lease.topicId);

  if (read === null) return settled(idleOutcome(db, lease, { unreadable: 0 }));

  const prompt = overviewPrompt(read);

  if (prompt.included.length === 0 && read.removed.length === 0) {
    if (read.added.length > 0) throw new Error("no added Digest fits the overview input");

    return settled(idleOutcome(db, lease, read));
  }

  if (prompt.included.length === 0) {
    return settled(keptOutcome(db, lease, { read, prompt }));
  }

  return { kind: "ask", lease, read, prompt };
}

async function claimedLease(
  db: Database,
  { topicId, holder }: Readonly<{ topicId: number; holder: string }>,
): Promise<TopicLease | null | "gone"> {
  try {
    return await claimTopicLease(db, topicId, holder);
  } catch (error) {
    const [topic] = await db.select({ id: topics.id }).from(topics).where(eq(topics.id, topicId));

    if (topic !== undefined) throw error;

    return "gone";
  }
}

export async function preparedOverview(
  db: Database,
  job: Readonly<ClaimedJob>,
  deferWhile?: (db: Database, topicId: number) => Promise<boolean>,
): Promise<OverviewPrepared> {
  const topicId = await topicOfItem(db, job.itemId);

  if (topicId === null) return settled({ writes: [] });

  const lease = await claimedLease(db, { topicId, holder: overviewHolder(job) });

  if (lease === "gone") return settled({ writes: [] });

  if (lease === null) return settled(busyOutcome());

  try {
    if ((await deferWhile?.(db, topicId)) === true) {
      return settled(busyOutcome([releaseTopicLease(db, lease)]));
    }

    return await readyOverview(db, lease);
  } catch (error) {
    await db.batch([releaseTopicLease(db, lease)]);

    throw error;
  }
}

export async function leasedForApply(
  db: Database,
  job: Readonly<ClaimedJob>,
  { topicId, taskId }: Readonly<{ topicId: number; taskId: number }>,
): Promise<OverviewPrepared | { readonly kind: "leased"; readonly lease: TopicLease }> {
  const lease = await claimedLease(db, { topicId, holder: overviewHolder(job) });

  if (lease === "gone") return settled(lostOutcome(db, { taskId }));

  return lease === null ? settled(busyOutcome()) : { kind: "leased", lease };
}
