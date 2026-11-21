import type { Judged } from "../src/core/contract/x-verdict.ts";
import { type XThreadValue, XThreadSchema } from "../src/core/contract/x-wire.ts";
import { enqueueItemJobs } from "../src/core/kernel/job-rows.ts";
import { startingJudged } from "../src/features/x/core/x-verify-state.ts";
import { queuedVerification, savedProgress } from "../src/features/x/core/x-verify-store.ts";
import type { Instance } from "./instance.ts";
import { until } from "./related-fixtures.ts";
import { xAddressOf } from "./x-intake-fixtures.ts";
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
    cliAttempts = null,
    waiting = false,
  }: Readonly<{
    judged: Judged;
    digest?: string | null;
    cliAttempts?: number | null;
    waiting?: boolean;
  }>,
): Promise<void> {
  const { db } = instance.core;

  await db.batch([
    ...queuedVerification(db, {
      itemId,
      address: xAddressOf(statusId),
      thread: value,
      digest,
      cliAttempts,
    }),
    savedProgress(db, itemId, 0, judged, value),
  ]);

  if (waiting) return;

  await enqueueItemJobs(instance.core, itemId);
  await until(
    () => verifyJobStates(instance, itemId),
    (found) => found.length > 0 && found.every(({ state }) => state === "done"),
  );
}
