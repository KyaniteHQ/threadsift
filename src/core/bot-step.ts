import { failedAiTask } from "./ai-tasks.ts";
import type { BotTaskKind } from "./bot-task-kind.ts";
import { sendBotTask } from "./bot-task-send.ts";
import { startBotTask } from "./bot-task-start.ts";
import {
  type BotTaskRow,
  chargedReport,
  latestTask,
  renewedCredential,
  stepOf,
  timedOutTask,
} from "./bot-task-states.ts";
import { newCallbackCredential } from "./callback-credential.ts";
import { lostOutcome } from "./guarded-outcome.ts";
import type { ClaimedJob, DeferredOutcome, JobOutcome, JobPorts } from "./job-outcome.ts";
import { holding } from "./job-rows.ts";

const FULL_CAP_DEFER_MS = 60_000;

type Waiting = Readonly<Pick<BotTaskRow, "id" | "deadline">>;

type SentTask = Readonly<Pick<BotTaskRow, "id" | "kind" | "inputs" | "context" | "deadline">>;

function waiting(task: Waiting): DeferredOutcome {
  return {
    deferredUntil: task.deadline,
    wait: "grok-bot",
    countsAttempt: false,
    unlessAnswered: task.id,
  };
}

async function sentOutcome(
  ports: JobPorts,
  context: Readonly<{
    kind: BotTaskKind;
    job: Readonly<ClaimedJob>;
    task: SentTask;
    token: string;
  }>,
): Promise<JobOutcome> {
  const sent = await sendBotTask(ports, context);

  if (sent.kind === "failed") throw new Error(`The Grok Bot send failed: ${sent.reason}`);

  return waiting(context.task);
}

async function startStep(
  ports: JobPorts,
  job: Readonly<ClaimedJob>,
  kind: BotTaskKind,
): Promise<JobOutcome> {
  const prepared = await kind.prepare(ports.db, job);

  if (prepared.kind === "settled") return prepared.outcome;

  const started = await startBotTask(ports, job, prepared.start);

  switch (started.kind) {
    case "started":
      return sentOutcome(ports, { kind, job, task: started.task, token: started.token });
    case "full":
      return {
        deferredUntil: Date.now() + FULL_CAP_DEFER_MS,
        wait: "grok-bot",
        countsAttempt: false,
      };
    case "claim-lost":
      return lostOutcome(ports.db);
    default: {
      const exhaustive: never = started;

      return exhaustive;
    }
  }
}

async function resendStep(
  ports: JobPorts,
  context: Readonly<{ kind: BotTaskKind; job: Readonly<ClaimedJob>; task: SentTask }>,
): Promise<JobOutcome> {
  const { job, task } = context;
  const credential = newCallbackCredential(ports.crypto);

  const renewed = await renewedCredential(ports.db, job, {
    taskId: task.id,
    callbackHash: credential.hash,
  });

  if (!renewed) return waiting(task);

  return sentOutcome(ports, { ...context, token: credential.value });
}

async function applyStep(
  ports: JobPorts,
  job: Readonly<ClaimedJob>,
  { kind, task }: Readonly<{ kind: BotTaskKind; task: BotTaskRow }>,
): Promise<JobOutcome> {
  const parsed = kind.parse(task.context ?? "", task.result ?? "");

  if (parsed.kind === "valid") return parsed.apply(ports.db, task);

  await failedAiTask(ports.db, task.id, { reason: "no-json", status: null }, holding(job));

  throw new Error("The Grok Bot answer no longer fits its task");
}

async function expireStep(
  ports: JobPorts,
  job: Readonly<ClaimedJob>,
  { kind, task }: Readonly<{ kind: BotTaskKind; task: BotTaskRow }>,
): Promise<JobOutcome> {
  const timedOut = await timedOutTask(ports.db, job, { taskId: task.id, now: Date.now() });

  switch (timedOut) {
    case "timed-out":
      throw new Error("The Grok Bot did not answer before the task's deadline");
    case "claim-lost":
      return lostOutcome(ports.db);
    case "changed":
      return botStep(ports, job, kind);
    default: {
      const exhaustive: never = timedOut;

      return exhaustive;
    }
  }
}

export async function botStep(
  ports: JobPorts,
  job: Readonly<ClaimedJob>,
  kind: BotTaskKind,
): Promise<JobOutcome> {
  const task = await latestTask(ports.db, job.id);
  const step = stepOf(task, Date.now());

  if (task === null || step === "start") return startStep(ports, job, kind);

  switch (step) {
    case "resend":
      return resendStep(ports, { kind, job, task });
    case "wait":
      return waiting(task);
    case "apply":
      return applyStep(ports, job, { kind, task });
    case "expire":
      return expireStep(ports, job, { kind, task });
    case "charge":
      await chargedReport(ports.db, job, task.id);

      throw new Error("The Grok Bot reported an error for the task");
    default: {
      const exhaustive: never = step;

      return exhaustive;
    }
  }
}
