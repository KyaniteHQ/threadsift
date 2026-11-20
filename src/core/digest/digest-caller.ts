import { startCallerTask } from "../ai/ai-tasks.ts";
import { parseStoredDigest } from "../contract/digest-schema.ts";
import type { AnchorSnapshot } from "../item/highlight-publish.ts";
import { lostClaim } from "../kernel/guarded-outcome.ts";
import type { ClaimedJob, JobOutcome, JobPorts } from "../kernel/job-outcome.ts";
import type { DigestInput } from "./digest-input.ts";
import { publishedByCaller } from "./digest-publish.ts";
import { DIGEST_TASK } from "./digest-task.ts";

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
