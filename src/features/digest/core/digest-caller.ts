import { parseStoredDigest } from "../../../core/contract/digest-schema.ts";
import { lostClaim } from "../../../core/kernel/guarded-outcome.ts";
import type { ClaimedJob, JobOutcome, JobPorts } from "../../../core/kernel/job-outcome.ts";
import { startCallerTask } from "../../ai/core/ai-tasks.ts";
import type { AnchorSnapshot } from "../../item/core/highlight-publish.ts";
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
