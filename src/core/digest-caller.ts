import { parseStoredDigest } from "./ai-contract.ts";
import { startCallerTask } from "./ai-tasks.ts";
import { publishedByCaller } from "./digest-publish.ts";
import { type DigestInput, lostClaim } from "./digest-source.ts";
import { DIGEST_TASK } from "./digest-task.ts";
import type { AnchorSnapshot } from "./highlight-publish.ts";
import type { ClaimedJob, JobOutcome, JobPorts } from "./job-outcome.ts";

export async function attemptCaller(
  ports: JobPorts,
  job: Readonly<ClaimedJob>,
  item: Readonly<DigestInput>,
  {
    pendingDigest,
    anchors,
  }: Readonly<{ pendingDigest: string; anchors: Readonly<AnchorSnapshot> }>,
): Promise<JobOutcome> {
  const digest = parseStoredDigest(pendingDigest);

  const taskId = await startCallerTask(
    ports,
    DIGEST_TASK.kind,
    pendingDigest,
    { inputRevision: item.generation, attempts: job.attempts + 1 },
    job,
  );

  if (taskId === null) return lostClaim(ports.db);

  return publishedByCaller(ports.db, item, digest, { taskId, anchors });
}
