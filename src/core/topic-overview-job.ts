import { AI_DEADLINE_MS } from "./ai-contract.ts";
import { runAiTask } from "./ai-tasks.ts";
import { givenUpTasks } from "./bot-task-states.ts";
import { lostOutcome, refusalOutcome } from "./guarded-outcome.ts";
import type { ClaimedJob, JobHandler, JobOutcome, JobPorts } from "./job-outcome.ts";
import { releaseTopicLease } from "./topic-lease.ts";
import { type OverviewPrepared, preparedOverview } from "./topic-overview-prepare.ts";
import { overviewGaveUp, overviewRefused } from "./topic-overview-run.ts";
import { OVERVIEW_OUTPUT_TOKENS, topicOverviewTask } from "./topic-overview-task.ts";
import { currentInputs, revisedOutcome } from "./topic-overview-write.ts";

type Asked = Extract<OverviewPrepared, { kind: "ask" }>;

async function reviseOverview(
  ports: JobPorts,
  job: Readonly<ClaimedJob>,
  { lease, read, prompt }: Readonly<Asked>,
): Promise<JobOutcome> {
  const { db } = ports;

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

  if (result.kind === "claim-lost") {
    return lostOutcome(db, { cleanup: [releaseTopicLease(db, lease)] });
  }

  if (result.kind !== "done") {
    return refusalOutcome(db, job, {
      result,
      current: currentInputs(lease, read, prompt.included),
      label: "Overview",
      writes: [overviewRefused(db, lease, result.reason)],
      cleanup: [releaseTopicLease(db, lease)],
    });
  }

  return revisedOutcome(db, lease, { read, prompt, taskId: result.taskId, result: result.result });
}

async function attemptOverview(ports: JobPorts, job: Readonly<ClaimedJob>): Promise<JobOutcome> {
  const prepared = await preparedOverview(ports.db, job);

  if (prepared.kind === "settled") return prepared.outcome;

  try {
    return await reviseOverview(ports, job, prepared);
  } catch (error) {
    await ports.db.batch([releaseTopicLease(ports.db, prepared.lease)]);

    throw error;
  }
}

export const topicOverviewHandler: JobHandler = {
  deadlineMs: AI_DEADLINE_MS,
  blockedBy: ["digest"],
  attempt: attemptOverview,
  exhausted: (db, job) => [...overviewGaveUp(db, job), givenUpTasks(db, job)],
};
