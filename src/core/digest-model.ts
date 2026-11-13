import { type AiRefused, type ModelAi, retriesAi } from "./ai-contract.ts";
import { TASKS, runAiTask } from "./ai-tasks.ts";
import { onGrokBot } from "./bot-step.ts";
import { digestBotKind } from "./digest-bot.ts";
import { preparedDigest } from "./digest-prepare.ts";
import { publishing } from "./digest-publish.ts";
import {
  type DigestInput,
  currency,
  generationCurrent,
  logSubmission,
  lostClaim,
  markDigest,
} from "./digest-source.ts";
import { type ClaimedJob, type JobOutcome, type JobPorts, isLastAttempt } from "./job-outcome.ts";
import { insertGuard } from "./schema.ts";

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

  if (result.kind !== "done") return refusedAi(ports.db, job, item, result);

  return publishing(ports.db, item, result.result, result.taskId, {
    executor: "model",
    provider: result.provider,
    model: result.model,
    version: catalog.version,
    staleRequeues: job.staleRequeues,
    submitted: prompt.submitted,
  });
}

function refusedAi(
  db: JobPorts["db"],
  job: Readonly<ClaimedJob>,
  item: Readonly<DigestInput>,
  result: Readonly<AiRefused & { readonly taskId: number | null }>,
): JobOutcome {
  const retriable = retriesAi(result);

  if (retriable && !isLastAttempt(job.attempts)) throw new Error(`Digest ${result.reason}`);

  const generation = generationCurrent(item);

  return {
    currency: currency(db, generation, result.taskId),
    failedAttempt: retriable,
    writes: [insertGuard(db, generation), markDigest(db, item.id, "attempt-failed")],
  };
}

export const attemptModel = onGrokBot(attemptOnExecutor, digestBotKind);
