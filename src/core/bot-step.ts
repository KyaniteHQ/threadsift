import type { ModelAi } from "./ai-contract.ts";
import { loadAiConfig } from "./ai-load.ts";
import type { SentTaskKind } from "./bot-task-kind.ts";
import { sendBotTask } from "./bot-task-send.ts";
import { type BotTaskStart, ownerOf, startBotTask } from "./bot-task-start.ts";
import {
  type BotStep,
  type BotTaskRow,
  chargedReport,
  latestTask,
  renewedCredential,
  stepOf,
  timedOutTask,
} from "./bot-task-states.ts";
import { newCallbackCredential } from "./callback-credential.ts";
import { lostOutcome } from "./guarded-outcome.ts";
import type {
  ClaimedJob,
  DeferredOutcome,
  JobHandler,
  JobOutcome,
  JobPorts,
  ModelHandler,
} from "./job-outcome.ts";
import { holding } from "./job-rows.ts";

const FULL_CAP_DEFER_MS = 60_000;

const STALENESS_CHECKED_STEPS: ReadonlySet<BotStep> = new Set(["resend", "wait", "expire"]);

type Waiting = Readonly<Pick<BotTaskRow, "id" | "deadline">>;

type SentTask = Readonly<Pick<BotTaskRow, "id" | "kind" | "inputs" | "context" | "deadline">>;

function waiting(task: Waiting): DeferredOutcome {
  return {
    deferredUntil: task.deadline,
    wait: "grok-bot",
    countsAttempt: false,
    unlessOpen: task.id,
    writes: [],
  };
}

async function sentOutcome(
  ports: JobPorts,
  context: Readonly<{
    kind: SentTaskKind;
    job: Readonly<ClaimedJob>;
    task: SentTask;
    token: string;
  }>,
): Promise<JobOutcome> {
  const { kind, job, task, token } = context;
  const sent = await sendBotTask(ports, { kind, task, token, claim: holding(job) });

  if (sent.kind === "failed") throw new Error(`The Grok Bot send failed: ${sent.reason}`);

  return waiting(context.task);
}

async function startedOutcome(
  ports: JobPorts,
  job: Readonly<ClaimedJob>,
  {
    kind,
    start,
    started: logStarted,
  }: Readonly<{
    kind: SentTaskKind;
    start: BotTaskStart;
    started: ((taskId: number) => void) | undefined;
  }>,
): Promise<JobOutcome> {
  const started = await startBotTask(ports, ownerOf(job), start);

  switch (started.kind) {
    case "started":
      logStarted?.(started.task.id);

      return sentOutcome(ports, {
        kind,
        job,
        task: started.task,
        token: started.token,
      });
    case "full":
    case "lease-lost":
      return {
        deferredUntil: Date.now() + FULL_CAP_DEFER_MS,
        wait: "grok-bot",
        countsAttempt: false,
        writes: [],
      };
    case "claim-lost":
      return lostOutcome(ports.db);
    default: {
      const exhaustive: never = started;

      return exhaustive;
    }
  }
}

async function startStep(
  ports: JobPorts,
  job: Readonly<ClaimedJob>,
  kind: SentTaskKind,
): Promise<JobOutcome> {
  const prepared = await kind.prepare(ports, job);

  if (prepared.kind === "settled") return prepared.outcome;

  return startedOutcome(ports, job, {
    kind,
    start: prepared.start,
    started: prepared.started,
  });
}

async function resendStep(
  ports: JobPorts,
  context: Readonly<{ kind: SentTaskKind; job: Readonly<ClaimedJob>; task: SentTask }>,
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

async function expireStep(
  ports: JobPorts,
  job: Readonly<ClaimedJob>,
  { kind, task }: Readonly<{ kind: SentTaskKind; task: BotTaskRow }>,
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
  kind: SentTaskKind,
): Promise<JobOutcome> {
  const task = await latestTask(ports.db, job.id);
  const step = stepOf(task, Date.now());

  if (task === null || step === "start") return startStep(ports, job, kind);

  if (STALENESS_CHECKED_STEPS.has(step) && !(await kind.current(ports.db, task.context ?? ""))) {
    return lostOutcome(ports.db, { taskId: task.id });
  }

  switch (step) {
    case "resend":
      return resendStep(ports, { kind, job, task });
    case "wait":
      return waiting(task);
    case "apply":
      return kind.apply(ports, job, task);
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

export function onGrokBot<Rest extends readonly unknown[]>(
  attempt: (
    ports: JobPorts,
    job: Readonly<ClaimedJob>,
    ai: ModelAi,
    ...rest: Rest
  ) => Promise<JobOutcome>,
  kind: SentTaskKind,
) {
  return async (ports: JobPorts, job: Readonly<ClaimedJob>, ...rest: Rest): Promise<JobOutcome> => {
    const ai = await loadAiConfig(ports);

    return ai.state === "grok-bot" ? botStep(ports, job, kind) : attempt(ports, job, ai, ...rest);
  };
}

export function routedHandler(handler: ModelHandler, kind: SentTaskKind): JobHandler {
  return { ...handler, attempt: onGrokBot(handler.attempt, kind) };
}
