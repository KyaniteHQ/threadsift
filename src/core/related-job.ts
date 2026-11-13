import { AI_DEADLINE_MS } from "./ai-contract.ts";
import { runAiTask } from "./ai-tasks.ts";
import { givenUpTasks } from "./bot-task-states.ts";
import { lostOutcome } from "./guarded-outcome.ts";
import type { ClaimedJob, JobHandler, JobOutcome, JobPorts } from "./job-outcome.ts";
import type { PickItem } from "./related-input.ts";
import { preparedRelated } from "./related-prepare.ts";
import { RELATED_OUTPUT_TOKENS, relatedPickTask } from "./related-task.ts";
import { pickedOutcome, refusedOutcome } from "./related-write.ts";

async function asking(
  ports: JobPorts,
  job: Readonly<ClaimedJob>,
  { source, input, sent }: Readonly<{ source: PickItem; input: string; sent: readonly PickItem[] }>,
): Promise<JobOutcome> {
  const { db } = ports;
  const versions = { source, sent };

  const result = await runAiTask(
    ports,
    relatedPickTask(sent.map(({ id }) => id)),
    {
      text: input,
      inputRevision: source.digest,
      attempts: job.attempts + 1,
      maxOutputTokens: RELATED_OUTPUT_TOKENS,
    },
    job,
  );

  if (result.kind === "claim-lost") return lostOutcome(db);

  if (result.kind !== "done") return refusedOutcome(db, job, { result, versions });

  return pickedOutcome(db, { versions, taskId: result.taskId, result: result.result });
}

async function attemptPick(ports: JobPorts, job: Readonly<ClaimedJob>): Promise<JobOutcome> {
  const prepared = await preparedRelated(ports.db, job.itemId);

  return prepared.kind === "settled" ? prepared.outcome : asking(ports, job, prepared);
}

export const relatedPickHandler: JobHandler = {
  deadlineMs: AI_DEADLINE_MS,
  blockedBy: ["digest"],
  attempt: attemptPick,
  exhausted: (db, job) => [givenUpTasks(db, job)],
};
