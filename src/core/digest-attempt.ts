import { sql } from "drizzle-orm";

import { type AiRefused, parseStoredDigest, retriesAi } from "./ai-contract.ts";
import { TASKS, runAiTask, startCallerTask } from "./ai-tasks.ts";
import { readCatalog } from "./catalog.ts";
import { DIGEST_DEADLINE_MS, type HopPage, hoppedPage } from "./digest-hop.ts";
import { markKeptDigest } from "./digest-job.ts";
import { publishing, readForPublishing } from "./digest-publish.ts";
import {
  type DigestInput,
  currency,
  generationCurrent,
  logSubmission,
  modelInput,
  readDigestText,
  refusedInput,
  setDigestFailure,
} from "./digest-source.ts";
import {
  type ClaimedJob,
  type JobHandler,
  type JobOutcome,
  type JobPorts,
  isLastAttempt,
} from "./job-outcome.ts";
import { insertGuard, items } from "./schema.ts";

type Database = JobPorts["db"];

async function attemptDigest(ports: JobPorts, job: Readonly<ClaimedJob>): Promise<JobOutcome> {
  const { item, anchors } = await readForPublishing(ports.db, job.itemId);

  if (item === undefined) return { writes: markKeptDigest(ports.db, job.itemId) };

  if (item.pendingDigest === null) return attemptModel(ports, job, item);

  return hasContent(item)
    ? attemptCaller(ports, job, item, item.pendingDigest, anchors)
    : emptyInput(ports.db, item);
}

function emptyInput(db: Database, item: Readonly<DigestInput>): JobOutcome {
  const generation = generationCurrent(item);

  return {
    currency: currency(db, generation, null),
    writes: [insertGuard(db, generation), ...markKeptDigest(db, item.id)],
  };
}

function hasContent(item: Readonly<DigestInput>): boolean {
  return item.postText !== null || item.postTextKey !== null || item.hasComments;
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

async function attemptModel(
  ports: JobPorts,
  job: Readonly<ClaimedJob>,
  item: Readonly<DigestInput>,
): Promise<JobOutcome> {
  const filed = await readDigestText(ports, job, item);

  if ("outcome" in filed) return filed.outcome;

  const hop = await hoppedPage(ports, job, item);

  if ("outcome" in hop) return hop.outcome;

  return hop.page === null && !hasContent(item)
    ? emptyInput(ports.db, item)
    : askModel(ports, job, item, { text: filed.text, page: hop.page });
}

async function askModel(
  ports: JobPorts,
  job: Readonly<ClaimedJob>,
  item: Readonly<DigestInput>,
  { text, page }: Readonly<{ text: string | null; page: HopPage }>,
): Promise<JobOutcome> {
  const catalog = await readCatalog(ports.db);
  const prompt = await modelInput(ports.db, item, text, catalog, page);

  if (prompt.kind === "too-large") return refusedInput(ports.db, item, prompt.fixedBytes);

  const result = await runAiTask(
    ports,
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
  db: Database,
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
    writes: [insertGuard(db, generation), setDigestFailure(db, item.id, true)],
  };
}

function lostClaim(db: Database): JobOutcome {
  return { writes: [insertGuard(db, sql`0`)] };
}

export const digestHandler: JobHandler = {
  deadlineMs: DIGEST_DEADLINE_MS,
  blockedBy: ["fetch"],
  attempt: attemptDigest,
  exhausted: (db, job) => [setDigestFailure(db, job.itemId, true)],
  inputCurrent: (job) =>
    sql`exists (select 1 from ${items} where ${items.id} = ${job.itemId} and ${items.generation} is ${job.attemptGeneration})`,
};
