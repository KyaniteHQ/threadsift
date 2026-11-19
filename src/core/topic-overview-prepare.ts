import type { Database } from "./database.ts";
import { type ClaimedJob, type DeferredOutcome, type JobOutcome, settled } from "./job-outcome.ts";
import {
  type OverviewPrompt,
  type OverviewRead,
  overviewPrompt,
  readOverview,
  topicOfItem,
} from "./topic-overview-input.ts";
import { idleOutcome, keptOutcome } from "./topic-overview-write.ts";

const BUSY_RETRY_MS = 15_000;

export type OverviewPrepared =
  | { readonly kind: "settled"; readonly outcome: JobOutcome }
  | {
      readonly kind: "ask";
      readonly topicId: number;
      readonly read: OverviewRead;
      readonly prompt: OverviewPrompt;
    };

async function readyOverview(db: Database, topicId: number): Promise<OverviewPrepared> {
  const read = await readOverview(db, topicId);

  if (read === null) return settled(idleOutcome(db, topicId, { unreadable: 0 }));

  const prompt = overviewPrompt(read);

  if (prompt.included.length === 0 && read.removed.length === 0) {
    if (read.added.length > 0) throw new Error("no added Digest fits the overview input");

    return settled(idleOutcome(db, topicId, read));
  }

  if (prompt.included.length === 0) {
    return settled(await keptOutcome(db, topicId, { read, prompt }));
  }

  return { kind: "ask", topicId, read, prompt };
}

export async function preparedOverview(
  db: Database,
  job: Readonly<ClaimedJob>,
  deferWhile?: (db: Database, topicId: number) => Promise<boolean>,
): Promise<OverviewPrepared> {
  const topicId = await topicOfItem(db, job.itemId);

  if (topicId === null) return settled({ writes: [] });

  if ((await deferWhile?.(db, topicId)) === true) {
    const outcome: DeferredOutcome = {
      deferredUntil: Date.now() + BUSY_RETRY_MS,
      wait: "topic-busy",
      countsAttempt: false,
      writes: [],
    };

    return settled(outcome);
  }

  return readyOverview(db, topicId);
}
