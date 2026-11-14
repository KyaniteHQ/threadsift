import { BOT_TASK_KINDS } from "../src/core/bot-task-kinds.ts";
import { ownerOf, startBotTask } from "../src/core/bot-task-start.ts";
import type { ClaimedJob } from "../src/core/job-outcome.ts";
import { claimTopicLease, releaseTopicLease } from "../src/core/topic-lease.ts";
import type { BotKindName, KindCase } from "./bot-kinds-cases.ts";
import { openJobOfKind } from "./bot-task-fixtures.ts";
import { answered } from "./bot-task-http.ts";
import { taskRow } from "./bot-task-rows.ts";
import type { Instance } from "./instance.ts";
import { exec } from "./related-fixtures.ts";

export { botInstance, chooseBotProvider } from "./bot-task-fixtures.ts";

export interface Sent {
  readonly id: number;
  readonly token: string;
  readonly context: string;
}

export function openJobOf(
  instance: Instance,
  options: Readonly<{
    kind: BotKindName;
    itemId: number;
    attempts?: number;
    staleRequeues?: number;
    attemptGeneration?: number | null;
  }>,
): Promise<ClaimedJob> {
  return openJobOfKind(instance, options);
}

export async function sentTask(
  instance: Instance,
  kind: BotKindName,
  job: Readonly<ClaimedJob>,
): Promise<Sent> {
  const prepared = await BOT_TASK_KINDS[kind].prepare(instance.core, job);

  if (prepared.kind !== "ask") throw new Error("the kind has nothing to ask");

  const started = await startBotTask(instance.core, ownerOf(job), prepared.start);

  if (started.kind !== "started") throw new Error(`the task did not start: ${started.kind}`);

  exec(instance, "update ai_tasks set sent_at = ? where id = ?", Date.now(), started.task.id);

  return {
    id: started.task.id,
    token: started.token,
    context: taskRow(instance, started.task.id).context ?? "",
  };
}

export async function answeredAs(
  instance: Instance,
  {
    kindCase,
    job,
    empty = false,
    between,
  }: Readonly<{
    kindCase: KindCase;
    job: Readonly<ClaimedJob>;
    empty?: boolean;
    between?: (context: string) => void;
  }>,
): Promise<Sent> {
  const sent = await sentTask(instance, kindCase.kind, job);

  between?.(sent.context);

  const result = empty ? kindCase.empty?.(sent.context) : kindCase.fits(sent.context);

  const response = await answered(
    instance,
    { id: sent.id, token: sent.token },
    { result: result ?? null },
  );

  if (response.status !== 204) throw new Error(`the answer was refused: ${response.text}`);

  return sent;
}

export function leasesRunOut(instance: Instance): void {
  exec(instance, "update topic_leases set expires_at = 0");
}

export async function holdTopic(instance: Instance, topicId: number, holder: string) {
  const lease = await claimTopicLease(instance.core.db, topicId, holder);

  if (lease === null)
    throw new Error(`${holder} could not take the lease of Topic ${String(topicId)}`);

  return lease;
}

export async function claimedAndReleased(
  instance: Instance,
  topicId: number,
  holder: string,
): Promise<void> {
  const lease = await holdTopic(instance, topicId, holder);

  await instance.core.db.batch([releaseTopicLease(instance.core.db, lease)]);
}
