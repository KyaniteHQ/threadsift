import { AI_DEADLINE_MS } from "./ai-contract.ts";
import { runAiTask } from "./ai-tasks.ts";
import type { ClaimedJob, JobHandler, JobOutcome, JobPorts } from "./job-outcome.ts";
import { type PickItem, type PickRead, pickPrompt, readPick } from "./related-input.ts";
import { RELATED_OUTPUT_TOKENS, relatedPickTask } from "./related-task.ts";
import {
  closedOutcome,
  emptyOutcome,
  lostOutcome,
  noDigestOutcome,
  pickedOutcome,
  refusedOutcome,
} from "./related-write.ts";

type ReadyPick = Extract<PickRead, { kind: "read" }>;

function logRefused(
  { source, candidates }: Readonly<ReadyPick>,
  reason: "source-over-cap" | "none-fit",
): void {
  console.warn(
    JSON.stringify({
      event: "related-input-refused",
      itemId: source.id,
      reason,
      candidates: candidates.length,
    }),
  );
}

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

function pick(ports: JobPorts, job: Readonly<ClaimedJob>, read: Readonly<ReadyPick>) {
  const { source } = read;
  const prompt = pickPrompt(read);

  switch (prompt.kind) {
    case "empty":
      return emptyOutcome(ports.db, source);
    case "refused":
      logRefused(read, prompt.reason);

      return closedOutcome(ports.db, source);
    case "ask":
      return asking(ports, job, { source, input: prompt.input, sent: prompt.sent });
    default: {
      const exhaustive: never = prompt;

      return exhaustive;
    }
  }
}

async function attemptPick(ports: JobPorts, job: Readonly<ClaimedJob>): Promise<JobOutcome> {
  const read = await readPick(ports.db, job.itemId);

  switch (read.kind) {
    case "absent":
      return noDigestOutcome(ports.db, job.itemId);
    case "unreadable":
      return closedOutcome(ports.db, read.source);
    case "read":
      return pick(ports, job, read);
    default: {
      const exhaustive: never = read;

      return exhaustive;
    }
  }
}

export const relatedPickHandler: JobHandler = {
  deadlineMs: AI_DEADLINE_MS,
  blockedBy: ["digest"],
  attempt: attemptPick,
  exhausted: () => [],
};
