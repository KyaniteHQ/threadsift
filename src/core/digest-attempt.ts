import { parseStoredDigest } from "./ai-contract.ts";
import { startCallerTask } from "./ai-tasks.ts";
import { DIGEST_DEADLINE_MS } from "./digest-hop.ts";
import { owedDigest } from "./digest-job.ts";
import { attemptModel } from "./digest-model.ts";
import { emptyInput, hasContent } from "./digest-prepare.ts";
import { publishing, readForPublishing } from "./digest-publish.ts";
import {
  DIGEST_INPUT,
  type DigestInput,
  keptNotUpdated,
  lostClaim,
  markAttemptsSpent,
} from "./digest-source.ts";
import type { ClaimedJob, JobOutcome, JobPorts } from "./job-outcome.ts";
import { defineJob } from "./job-spec.ts";
import { INTAKE_JOB_KINDS } from "./kinds.ts";

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

export const digestHandler = defineJob("digest", {
  deadlineMs: DIGEST_DEADLINE_MS,
  blockedBy: INTAKE_JOB_KINDS,
  input: DIGEST_INPUT,
  attempt: attemptDigest,
  exhausted: (db, job) => [markAttemptsSpent(db, job)],
  closing: (db, job, how) => (how.kind === "closed" ? [owedDigest(db, job)] : []),
});
