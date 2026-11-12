import { sql } from "drizzle-orm";

import { AI_DEADLINE_MS } from "./ai-contract.ts";
import { runAiTask } from "./ai-tasks.ts";
import type {
  ClaimedJob,
  JobHandler,
  JobOutcome,
  JobPorts,
  SettledOutcome,
} from "./job-outcome.ts";
import {
  type TopicLease,
  claimTopicLease,
  recoverHolderLeases,
  releaseTopicLease,
} from "./topic-lease.ts";
import { overviewPrompt, readOverview, topicOfItem } from "./topic-overview-input.ts";
import { continuingOverview, markHolderOverviewFailed } from "./topic-overview-open.ts";
import { refusedOutcome } from "./topic-overview-refusal.ts";
import { OVERVIEW_OUTPUT_TOKENS, topicOverviewTask } from "./topic-overview-task.ts";
import { idleOutcome, keptOutcome, lostOutcome, revisedOutcome } from "./topic-overview-write.ts";

const BUSY_RETRY_MS = 15_000;

function leaseHolder({
  id,
  attempts,
  staleRequeues,
}: Readonly<Pick<ClaimedJob, "id" | "attempts" | "staleRequeues">>): string {
  return `topic_overview:${String(id)}:${String(attempts)}:${String(staleRequeues)}`;
}

async function reviseOverview(
  ports: JobPorts,
  job: Readonly<ClaimedJob>,
  lease: Readonly<TopicLease>,
): Promise<SettledOutcome> {
  const { db } = ports;
  const read = await readOverview(db, lease.topicId);

  if (read === null) return idleOutcome(db, lease);

  const prompt = overviewPrompt(read);

  if (prompt.included.length === 0 && read.removed.length === 0) return idleOutcome(db, lease);

  if (prompt.included.length === 0) {
    return {
      ...keptOutcome(db, lease, { read, prompt }),
      continuation: [continuingOverview(db, lease.topicId, sql`1`)],
    };
  }

  const result = await runAiTask(
    ports,
    topicOverviewTask(prompt),
    {
      text: prompt.input,
      inputRevision: read.page?.revision ?? 0,
      attempts: job.attempts + 1,
      maxOutputTokens: OVERVIEW_OUTPUT_TOKENS,
    },
    job,
  );

  if (result.kind === "claim-lost") return lostOutcome(db, lease);

  if (result.kind !== "done") return refusedOutcome(db, lease, job, { result, read, prompt });

  return {
    ...revisedOutcome(db, lease, { read, prompt, taskId: result.taskId, result: result.result }),
    continuation: [continuingOverview(db, lease.topicId, sql`1`)],
  };
}

async function attemptOverview(ports: JobPorts, job: Readonly<ClaimedJob>): Promise<JobOutcome> {
  const topicId = await topicOfItem(ports.db, job.itemId);

  if (topicId === null) return { writes: [] };

  const lease = await claimTopicLease(ports.db, topicId, leaseHolder(job));

  if (lease === null) {
    return { deferredUntil: Date.now() + BUSY_RETRY_MS, wait: "topic-busy", countsAttempt: false };
  }

  try {
    return await reviseOverview(ports, job, lease);
  } catch (error) {
    await ports.db.batch([releaseTopicLease(ports.db, lease)]);

    throw error;
  }
}

export const topicOverviewHandler: JobHandler = {
  deadlineMs: AI_DEADLINE_MS,
  blockedBy: ["digest"],
  attempt: attemptOverview,
  exhausted: (db, job) => [
    markHolderOverviewFailed(db, leaseHolder(job), "gave-up"),
    recoverHolderLeases(db, leaseHolder(job)),
  ],
};
