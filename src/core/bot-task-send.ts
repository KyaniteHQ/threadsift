import { type AiRefusal } from "./ai-contract.ts";
import { failedAiTask } from "./ai-tasks.ts";
import type { BotTaskKind } from "./bot-task-kind.ts";
import { type BotTaskRow, sentTask } from "./bot-task-states.ts";
import { utf8Length } from "./digest-prompt.ts";
import { report } from "./failure-log.ts";
import type { GrokBotResult } from "./grok-bot-contract.ts";
import { grokBotConnection, postToGrokBot } from "./grok-bot.ts";
import type { ClaimedJob, JobPorts } from "./job-outcome.ts";
import { holding } from "./job-rows.ts";

const GROK_BOT_BODY_BYTES = 512 * 1024;

type SendPorts = Pick<JobPorts, "db" | "secrets" | "network">;

type SentTask = Readonly<Pick<BotTaskRow, "id" | "kind" | "inputs" | "context">>;

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

function payloadOf(
  kind: BotTaskKind,
  { task, token }: Readonly<{ task: SentTask; token: string }>,
): string | null {
  const described = kind.describe(task.context ?? "");

  if (described === null) return null;

  const body = JSON.stringify({
    taskId: task.id,
    kind: task.kind,
    instructions: described.instructions,
    input: task.inputs,
    schema: described.schema,
    callbackToken: token,
  });

  return utf8Length(body) > GROK_BOT_BODY_BYTES ? null : body;
}

export async function sendBotTask(
  ports: Readonly<SendPorts>,
  {
    kind,
    task,
    token,
    job,
  }: Readonly<{
    kind: BotTaskKind;
    task: SentTask;
    token: string;
    job: Readonly<Pick<ClaimedJob, "id" | "attempts">>;
  }>,
): Promise<BotSend> {
  const sending = { job, taskId: task.id };
  const body = payloadOf(kind, { task, token });

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
