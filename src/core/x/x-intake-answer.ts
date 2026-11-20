import { parseStoredDigest } from "../contract/digest-schema.ts";
import { statusIdOf } from "../contract/links.ts";
import { X_INTAKE_TASK, type IntakeAnswer } from "../contract/x-intake-contract.ts";
import { type AiTaskRow, acceptsAnswer } from "../kernel/ai-task-state.ts";
import { logFailure, report } from "../kernel/failure-log.ts";
import { guardHolds, guardedBatch } from "../kernel/guards.ts";
import type { JobPorts } from "../kernel/job-outcome.ts";
import { enqueueItemJobs, enqueueQuietly } from "../kernel/job-rows.ts";
import {
  type IntakeTask,
  intakeItem,
  intakeLive,
  refusedAnswer,
  staleIntake,
  storedIntake,
  unavailableIntake,
} from "./x-intake-writes.ts";
import { readFetchedThread } from "./x-replies-ranked.ts";
import { readXBotThreadValue } from "./x-thread.ts";

type IntakeOutcome =
  | { readonly kind: "accepted" }
  | { readonly kind: "unsupported" }
  | { readonly kind: "closed" }
  | { readonly kind: "invalid"; readonly reasons: string; readonly logged: string };

const CLOSED: IntakeOutcome = { kind: "closed" };

const REFUSAL_LOGGED_MAX = 1000;

function intakeTaskOf(task: Readonly<AiTaskRow>): IntakeTask | null {
  const { jobId, itemId } = task;

  return jobId === null || itemId === null ? null : { ...task, jobId, itemId };
}

async function refused(ports: JobPorts, task: IntakeTask): Promise<IntakeOutcome> {
  if (await guardHolds(ports.db, acceptsAnswer(task))) await staleIntake(ports, task);

  return CLOSED;
}

async function stored(
  ports: JobPorts,
  task: IntakeTask,
  answer: Extract<IntakeAnswer, { content: string }>,
): Promise<IntakeOutcome> {
  const { db } = ports;
  const item = await intakeItem(db, task);
  const statusId = item === null ? null : statusIdOf(item.normalizedUrl);

  if (item === null || statusId === null) return CLOSED;

  const read = readXBotThreadValue(answer.content);

  if (read.kind === "refused") {
    return { kind: "invalid", reasons: read.reason, logged: read.logged };
  }

  const digest =
    answer.digest ?? (item.pendingDigest === null ? null : parseStoredDigest(item.pendingDigest));
  const picks = digest?.keptComments ?? [];
  const parsed = await readFetchedThread(db, task.itemId, statusId, read.value, picks);

  if (parsed.kind === "refused") {
    return {
      kind: "invalid",
      reasons: parsed.reason,
      logged: `thread-rule ${parsed.reason.replaceAll(/\d+/gu, "#")}`,
    };
  }

  const written = await guardedBatch(
    db,
    intakeLive(task),
    storedIntake(db, task, {
      address: item.originalUrl,
      thread: parsed.thread,
      digest: digest === null ? null : JSON.stringify(digest),
    }),
  );

  if (!written) return refused(ports, task);

  await enqueueItemJobs(ports, task.itemId);

  return { kind: "accepted" };
}

export async function acceptIntake(
  ports: JobPorts,
  task: Readonly<AiTaskRow>,
  answer: Readonly<IntakeAnswer>,
): Promise<IntakeOutcome> {
  if (task.kind !== X_INTAKE_TASK) return { kind: "unsupported" };

  const intake = intakeTaskOf(task);

  if (intake === null) return CLOSED;

  if (!(await guardHolds(ports.db, intakeLive(intake)))) return refused(ports, intake);

  if ("unavailable" in answer) {
    return (await guardedBatch(ports.db, intakeLive(intake), unavailableIntake(ports.db, intake)))
      ? { kind: "accepted" }
      : refused(ports, intake);
  }

  return stored(ports, intake, answer);
}

export async function refusedIntake(
  ports: JobPorts,
  task: Readonly<AiTaskRow>,
  logged: string,
): Promise<void> {
  const intake = task.kind === X_INTAKE_TASK ? intakeTaskOf(task) : null;

  if (intake === null) return;

  const counted = await refusedAnswer(ports.db, intake, Date.now()).catch(
    (error: Readonly<Error>) => {
      logFailure("grok-bot-answer-refusal-not-counted", { taskId: intake.id }, error);

      return null;
    },
  );

  if (counted === null) return;

  report("grok-bot-answer-refused", {
    taskId: intake.id,
    itemId: intake.itemId,
    refusals: counted.refusals,
    issues: logged.slice(0, REFUSAL_LOGGED_MAX),
  });

  if (counted.resend) await enqueueQuietly(ports, [intake.jobId], 0);
}
