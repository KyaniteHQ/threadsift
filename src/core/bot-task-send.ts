import { type AiRefusal } from "./ai-contract.ts";
import type { WebhookBody } from "./ai-task-read.ts";
import { failedAiTask } from "./ai-tasks.ts";
import type { SentTask, SentTaskKind } from "./bot-task-kind.ts";
import { sentTask } from "./bot-task-states.ts";
import { report } from "./failure-log.ts";
import type { GrokBotResult } from "./grok-bot-contract.ts";
import { grokBotConnection, postToGrokBot } from "./grok-bot.ts";
import type { ClaimedJob, JobPorts } from "./job-outcome.ts";
import { holding } from "./job-rows.ts";

type SendPorts = Pick<JobPorts, "db" | "secrets" | "network">;

type Sending = Readonly<{ job: Readonly<Pick<ClaimedJob, "id" | "attempts">>; taskId: number }>;

export type BotSend =
  | { readonly kind: "sent" }
  | { readonly kind: "unchanged" }
  | { readonly kind: "failed"; readonly reason: AiRefusal; readonly status: number | null };

const REFUSAL_OF_RESULT = {
  "wrong-key": "wrong-key",
  "not-found": "unreachable",
  "bot-error": "unreachable",
  unreachable: "unreachable",
  timeout: "timeout",
  refused: "refused",
  "not-configured": "not-configured",
  "secret-missing": "secret-missing",
} as const satisfies Readonly<Record<Exclude<GrokBotResult, "ok">, AiRefusal>>;

async function failedSend(
  ports: Readonly<SendPorts>,
  { job, taskId }: Readonly<Sending>,
  failure: Readonly<{ result: Exclude<GrokBotResult, "ok">; status: number | null }>,
): Promise<BotSend> {
  const reason = REFUSAL_OF_RESULT[failure.result];

  const [failed] = await failedAiTask(
    ports.db,
    taskId,
    { reason, status: failure.status },
    holding(job),
  ).returning();

  return failed === undefined
    ? { kind: "unchanged" }
    : { kind: "failed", reason, status: failure.status };
}

export function webhookBodyOf(
  kind: SentTaskKind,
  { task, token }: Readonly<{ task: SentTask; token: string }>,
): string | null {
  if (kind.describe(task.context ?? "") === null) return null;

  const body: WebhookBody = {
    taskId: task.id,
    kind: task.kind,
    callbackToken: token,
  };

  return JSON.stringify(body);
}

export async function sendBotTask(
  ports: Readonly<SendPorts>,
  {
    kind,
    task,
    token,
    job,
  }: Readonly<{
    kind: SentTaskKind;
    task: SentTask;
    token: string;
    job: Readonly<Pick<ClaimedJob, "id" | "attempts">>;
  }>,
): Promise<BotSend> {
  const sending = { job, taskId: task.id };
  const body = webhookBodyOf(kind, { task, token });

  if (body === null) return failedSend(ports, sending, { result: "refused", status: null });

  const connection = await grokBotConnection(ports);

  if (connection.kind === "unready") {
    return failedSend(ports, sending, { result: connection.reason, status: null });
  }

  const posted = await postToGrokBot(ports.network, connection, { body });

  report("grok-bot-send", {
    taskId: task.id,
    result: posted.result,
    status: posted.status ?? "none",
  });

  if (posted.result !== "ok")
    return failedSend(ports, sending, { ...posted, result: posted.result });

  await sentTask(ports.db, job, { taskId: task.id, now: Date.now() });

  return { kind: "sent" };
}
