import { eq, inArray } from "drizzle-orm";

import { batchAll } from "../src/core/guards.ts";
import { enqueueItemJobs } from "../src/core/job-rows.ts";
import { claimNextDue, dueIds } from "../src/core/jobs.ts";
import { jobs, xVerifications } from "../src/core/schema.ts";
import { queuedVerification, savedProgress } from "../src/core/x-verify-store.ts";
import type { XThreadValue } from "../src/core/x-wire.ts";
import type { Instance } from "./instance.ts";
import { addressOf } from "./x-intake-fixtures.ts";
import { allJudged, storedForVerification } from "./x-verify-job-fixtures.ts";

export async function storedUnreadably(
  instance: Instance,
  itemId: number,
  statusId: string,
  value: XThreadValue,
): Promise<void> {
  await storedForVerification(instance, itemId, statusId, value, {
    judged: allJudged(value),
    waiting: true,
  });
  await instance.core.db
    .update(xVerifications)
    .set({ thread: "{not json" })
    .where(eq(xVerifications.itemId, itemId));
  await enqueueItemJobs(instance.core, itemId);
}

export async function claimedBeforeNewerAnswer(
  instance: Instance,
  itemId: number,
  statusId: string,
  value: XThreadValue,
) {
  const { db } = instance.core;

  await storedForVerification(instance, itemId, statusId, value, {
    judged: allJudged(value),
    waiting: true,
  });
  await db.update(jobs).set({ attempts: 3 }).where(eq(jobs.itemId, itemId));

  const claimed = await claimNextDue(db);

  await batchAll(db, [
    ...queuedVerification(db, {
      itemId,
      address: addressOf(statusId),
      thread: value,
      digest: null,
    }),
    savedProgress(db, itemId, 1, allJudged(value)),
  ]);

  return claimed;
}

export async function dueKindsBesideVerification(
  instance: Instance,
  itemId: number,
  statusId: string,
  value: XThreadValue,
): Promise<readonly string[]> {
  const { db } = instance.core;

  await storedForVerification(instance, itemId, statusId, value, {
    judged: allJudged(value),
    waiting: true,
  });

  await db.insert(jobs).values({
    kind: "digest",
    itemId,
    address: addressOf(statusId),
    state: "queued",
    nextAttemptAt: 0,
  });

  const due = await dueIds(db, Date.now(), 10);

  const found = await db
    .select({ kind: jobs.kind })
    .from(jobs)
    .where(
      inArray(
        jobs.id,
        due.map(({ id }) => id),
      ),
    );

  return found.map(({ kind }) => kind);
}

export async function jobAfterNewerAnswer(
  instance: Instance,
  itemId: number,
  statusId: string,
  value: XThreadValue,
) {
  const { db } = instance.core;

  await storedForVerification(instance, itemId, statusId, value, {
    judged: allJudged(value),
    waiting: true,
  });
  await db
    .update(jobs)
    .set({ attempts: 2, waitReason: "x-verify", nextAttemptAt: Date.now() + 3_600_000 })
    .where(eq(jobs.itemId, itemId));
  await batchAll(db, [
    ...queuedVerification(db, {
      itemId,
      address: addressOf(statusId),
      thread: value,
      digest: null,
    }),
  ]);

  const [job] = await db.select().from(jobs).where(eq(jobs.itemId, itemId));

  return job;
}
