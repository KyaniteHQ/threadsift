import { parseStoredDigest } from "./ai-contract.ts";
import { startCallerTask } from "./ai-tasks.ts";
import { givenUpTasks } from "./bot-task-states.ts";
import { DIGEST_DEADLINE_MS } from "./digest-hop.ts";
import { attemptModel } from "./digest-model.ts";
import { emptyInput, hasContent } from "./digest-prepare.ts";
import { publishing, readForPublishing } from "./digest-publish.ts";
import {
  type DigestInput,
  attemptGenerationCurrent,
  keptNotUpdated,
  lostClaim,
  markDigest,
} from "./digest-source.ts";
import type { ClaimedJob, JobHandler, JobOutcome, JobPorts } from "./job-outcome.ts";

async function attemptDigest(ports: JobPorts, job: Readonly<ClaimedJob>): Promise<JobOutcome> {
  const { item, anchors } = await readForPublishing(ports.db, job.itemId);

  if (item === undefined) return { writes: keptNotUpdated(ports.db, job.itemId) };

  if (item.pendingDigest === null) return attemptModel(ports, job, item);

  return hasContent(item)
    ? attemptCaller(ports, job, item, item.pendingDigest, anchors)
    : emptyInput(ports.db, item);
}

async function attemptCaller(
  ports: JobPorts,
  job: Readonly<ClaimedJob>,
  item: Readonly<DigestInput>,
  pendingDigest: string,
  anchors: Awaited<ReturnType<typeof readForPublishing>>["anchors"],
): Promise<JobOutcome> {
  const digest = parseStoredDigest(pendingDigest);

  const taskId = await startCallerTask(
    ports,
    pendingDigest,
    { inputRevision: item.generation, attempts: job.attempts + 1 },
    job,
  );

  if (taskId === null) return lostClaim(ports.db);

  return publishing(ports.db, item, digest, taskId, { executor: "caller" }, anchors);
}

export const digestHandler: JobHandler = {
  deadlineMs: DIGEST_DEADLINE_MS,
  blockedBy: ["fetch"],
  attempt: attemptDigest,
  exhausted: (db, job) => [markDigest(db, job.itemId, "attempt-failed"), givenUpTasks(db, job)],
  inputCurrent: attemptGenerationCurrent,
};
