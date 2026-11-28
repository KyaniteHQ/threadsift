import type { Database } from "../../../core/kernel/database.ts";
import { type ClaimedJob, type JobOutcome, settled } from "../../../core/kernel/job-outcome.ts";
import {
  type OverviewPrompt,
  type OverviewRead,
  overviewPrompt,
  readOverview,
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

export async function preparedOverview(
  db: Database,
  { topicId }: Readonly<ClaimedJob>,
): Promise<OverviewPrepared> {
  if (topicId === null) return settled({ writes: [] });

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
