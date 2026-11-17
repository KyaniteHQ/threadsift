import type { ModelAi } from "./ai-contract.ts";
import { TASKS, runAiTask } from "./ai-tasks.ts";
import { onGrokBot } from "./bot-step.ts";
import { digestBotKind } from "./digest-bot.ts";
import { preparedDigest } from "./digest-prepare.ts";
import { publishing } from "./digest-publish.ts";
import {
  type DigestInput,
  generationCurrent,
  logSubmission,
  lostClaim,
  markDigest,
} from "./digest-source.ts";
import { refusalOutcome } from "./guarded-outcome.ts";
import type { ClaimedJob, JobOutcome, JobPorts } from "./job-outcome.ts";

async function attemptOnExecutor(
  ports: JobPorts,
  job: Readonly<ClaimedJob>,
  ai: ModelAi,
  item: Readonly<DigestInput>,
): Promise<JobOutcome> {
  const prepared = await preparedDigest(ports, job, item);

  if (prepared.kind === "settled") return prepared.outcome;

  const { catalog, prompt } = prepared;

  const result = await runAiTask(
    ports,
    ai,
    TASKS.digest,
    {
      text: prompt.input,
      inputRevision: item.generation,
      attempts: job.attempts + 1,
      maxOutputTokens: prompt.maxOutputTokens,
    },
    job,
  );

  if (result.kind === "claim-lost") return lostClaim(ports.db);

  if (result.taskId !== null) logSubmission(result.taskId, item, prompt.counts);

  if (result.kind !== "done") {
    return refusalOutcome(ports.db, job, {
      result,
      current: generationCurrent(item),
      label: "Digest",
      writes: [markDigest(ports.db, item.id, "attempt-failed")],
    });
  }

  return publishing(ports.db, item, result.result, result.taskId, {
    executor: "model",
    provider: result.provider,
    model: result.model,
    catalog: { kind: "checked", version: catalog.version, staleRequeues: job.staleRequeues },
    submitted: prompt.submitted,
  });
}

export const attemptModel = onGrokBot(attemptOnExecutor, digestBotKind);
