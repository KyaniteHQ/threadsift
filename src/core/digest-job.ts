import { attemptCaller } from "./digest-caller.ts";
import { DIGEST_DEADLINE_MS } from "./digest-hop.ts";
import { DIGEST_INPUT } from "./digest-input.ts";
import { digestKind } from "./digest-kind.ts";
import { keptNotUpdated, markAttemptsSpent } from "./digest-marker.ts";
import { owedDigest } from "./digest-opening.ts";
import { emptyInput } from "./digest-prepare.ts";
import { readForPublishing } from "./digest-publish.ts";
import { INTAKE_JOB_KINDS } from "./job-contract.ts";
import type { ClaimedJob, JobOutcome, JobPorts } from "./job-outcome.ts";
import { defineJob } from "./job-spec.ts";

async function attemptDigest(ports: JobPorts, job: Readonly<ClaimedJob>): Promise<JobOutcome> {
  const { item, anchors } = await readForPublishing(ports.db, job.itemId);

  if (item === undefined) return { writes: keptNotUpdated(ports.db, job.itemId) };

  if (item.pendingDigest === null) return digestKind.attempt(ports, job);

  return item.hasContent
    ? attemptCaller(ports, job, item, { pendingDigest: item.pendingDigest, anchors })
    : emptyInput(ports.db, item);
}

export const digestHandler = defineJob("digest", {
  deadlineMs: DIGEST_DEADLINE_MS,
  blockedBy: INTAKE_JOB_KINDS,
  input: DIGEST_INPUT,
  attempt: attemptDigest,
  exhausted: (db, job) => [markAttemptsSpent(db, job)],
  closing: (db, job, how) => (how.kind === "closed" ? [owedDigest(db, job)] : []),
});
