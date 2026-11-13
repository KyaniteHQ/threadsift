import { batchAll } from "../src/core/guards.ts";
import { enqueueItemJobs } from "../src/core/job-rows.ts";
import { type Judged, startingJudged } from "../src/core/x-verify-state.ts";
import { queuedVerification, savedProgress } from "../src/core/x-verify-store.ts";
import { type XThreadValue, XThreadSchema } from "../src/core/x-wire.ts";
import type { Instance } from "./instance.ts";
import { until } from "./related-fixtures.ts";
import { addressOf } from "./x-intake-fixtures.ts";
import { verifyJobStates } from "./x-intake-rows.ts";
import { authored, reply, thread } from "./x-thread-fixtures.ts";

export const valueOf = (statusId: string): XThreadValue => XThreadSchema.parse(authored(statusId));

export const withOneReply = (statusId: string): XThreadValue =>
  XThreadSchema.parse(thread([reply(1000000000000000031n, statusId)], { id: statusId }));

export const allJudged = (value: XThreadValue, verdicts: Judged = {}): Judged => ({
  ...Object.fromEntries([value.post, ...value.replies].map(({ id }) => [id, "verified"] as const)),
  ...startingJudged(value),
  ...verdicts,
});

export async function storedForVerification(
  instance: Instance,
  itemId: number,
  statusId: string,
  value: XThreadValue,
  {
    judged,
    digest = null,
    waiting = false,
  }: Readonly<{
    judged: Judged;
    digest?: string | null;
    waiting?: boolean;
  }>,
): Promise<void> {
  const { db } = instance.core;

  await batchAll(db, [
    ...queuedVerification(db, { itemId, address: addressOf(statusId), thread: value, digest }),
    savedProgress(db, itemId, 0, judged),
  ]);

  if (waiting) return;

  await enqueueItemJobs(instance.core, itemId);
  await until(
    () => verifyJobStates(instance, itemId),
    (found) => found.length > 0 && found.every(({ state }) => state === "done"),
  );
}
