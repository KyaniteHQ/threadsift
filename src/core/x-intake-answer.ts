import { type BotTaskRow, acceptsAnswer } from "./bot-task-states.ts";
import { guardHolds, guardedBatch } from "./guards.ts";
import type { JobPorts } from "./job-outcome.ts";
import { enqueueItemJobs } from "./job-rows.ts";
import { parseLink, statusIdOf } from "./links.ts";
import { publishThread } from "./thread-save.ts";
import { X_INTAKE_TASK, type IntakeAnswer } from "./x-intake-contract.ts";
import {
  type IntakeTask,
  answeredIntake,
  intakeItem,
  intakeLive,
  staleIntake,
  unavailableIntake,
} from "./x-intake-writes.ts";
import { parseXThread } from "./x-thread.ts";

export type IntakeOutcome =
  | { readonly kind: "accepted" }
  | { readonly kind: "unsupported" }
  | { readonly kind: "closed" }
  | { readonly kind: "invalid"; readonly reasons: string };

const CLOSED: IntakeOutcome = { kind: "closed" };

function intakeTaskOf(task: Readonly<BotTaskRow>): IntakeTask | null {
  const { jobId, itemId } = task;

  return jobId === null || itemId === null ? null : { ...task, jobId, itemId };
}

async function refused(ports: JobPorts, task: IntakeTask): Promise<IntakeOutcome> {
  if (await guardHolds(ports.db, acceptsAnswer(task))) await staleIntake(ports, task);

  return CLOSED;
}

async function published(
  ports: JobPorts,
  task: IntakeTask,
  answer: Extract<IntakeAnswer, { content: string }>,
): Promise<IntakeOutcome> {
  const { db } = ports;
  const item = await intakeItem(db, task);
  const statusId = item === null ? null : statusIdOf(item.normalizedUrl);

  if (item === null || statusId === null) return CLOSED;

  const parsed = parseXThread(answer.content, statusId);

  if (parsed.kind === "refused") return { kind: "invalid", reasons: parsed.reason };

  const place = { ...parseLink(item.normalizedUrl), address: item.originalUrl, addedByToken: null };

  const created = await publishThread(db, place, parsed.thread, {
    pendingDigest: answer.digest === undefined ? item.pendingDigest : JSON.stringify(answer.digest),
    fillOnly: false,
    binding: { holds: intakeLive(task), writes: answeredIntake(db, task, { unavailable: false }) },
  });

  if (created === null) return refused(ports, task);

  await enqueueItemJobs(ports, task.itemId);

  return { kind: "accepted" };
}

export async function acceptIntake(
  ports: JobPorts,
  task: Readonly<BotTaskRow>,
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

  return published(ports, intake, answer);
}
