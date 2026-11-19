import { startCallerTask } from "./ai-tasks.ts";
import type { DigestInput } from "./digest-input.ts";
import { publishedByCaller } from "./digest-publish.ts";
import { parseStoredDigest } from "./digest-schema.ts";
import { DIGEST_TASK } from "./digest-task.ts";
import { lostClaim } from "./guarded-outcome.ts";
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
