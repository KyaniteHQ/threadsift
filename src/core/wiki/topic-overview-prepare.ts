import type { Database } from "../kernel/database.ts";
import { type ClaimedJob, type JobOutcome, settled } from "../kernel/job-outcome.ts";
import {
  type OverviewPrompt,
  type OverviewRead,
  overviewPrompt,
  readOverview,
  topicOfItem,
} from "./topic-overview-input.ts";
import { idleOutcome, keptOutcome } from "./topic-overview-write.ts";

type OverviewPrepared =
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
): Promise<OverviewPrepared> {
  const topicId = await topicOfItem(db, job.itemId);

  if (topicId === null) return settled({ writes: [] });

  return readyOverview(db, topicId);
}
