import type { SQL } from "drizzle-orm";

import type { AiRefusal } from "../../../core/contract/ai-contract.ts";
import type { GrokBotResult, WebhookBody } from "../../../core/contract/grok-bot-contract.ts";
import { failedAiTask } from "../../../core/kernel/ai-task-rows.ts";
import { report } from "../../../core/kernel/failure-log.ts";
import type { JobPorts } from "../../../core/kernel/job-outcome.ts";
import type { SentTask, KindFace } from "./ai-kind-types.ts";
import { sentTask } from "./bot-task-rows.ts";
import { postToGrokBot } from "./grok-bot-post.ts";
import { grokBotConnection } from "./grok-bot-ready.ts";

type SendPorts = Pick<JobPorts, "db" | "secrets" | "network">;

type Sending = Readonly<{ claim: SQL | undefined; taskId: number }>;

type BotSend =
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
  { claim, taskId }: Readonly<Sending>,
  failure: Readonly<{ result: Exclude<GrokBotResult, "ok">; status: number | null }>,
): Promise<BotSend> {
  const reason = REFUSAL_OF_RESULT[failure.result];

  const [failed] = await failedAiTask(
    ports.db,
    taskId,
    { reason, status: failure.status },
    claim,
  ).returning();

  return failed === undefined
    ? { kind: "unchanged" }
    : { kind: "failed", reason, status: failure.status };
}

function webhookBodyOf(
  kind: Pick<KindFace, "describe">,
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
    claim,
    signal,
  }: Readonly<{
    kind: Pick<KindFace, "describe">;
    task: SentTask;
    token: string;
    claim: SQL | undefined;
    signal?: AbortSignal | undefined;
  }>,
): Promise<BotSend> {
  const sending = { claim, taskId: task.id };
  const body = webhookBodyOf(kind, { task, token });

  if (body === null) return failedSend(ports, sending, { result: "refused", status: null });

  const connection = await grokBotConnection(ports);

  if (connection.kind === "unready") {
    return failedSend(ports, sending, { result: connection.reason, status: null });
  }

  const posted = await postToGrokBot(ports.network, connection, { body, signal });

  report("grok-bot-send", {
    taskId: task.id,
    result: posted.result,
    status: posted.status ?? "none",
  });

  if (posted.result !== "ok") {
    const result = signal?.aborted === true ? "timeout" : posted.result;

    return failedSend(ports, sending, { ...posted, result });
  }

  await sentTask(ports.db, claim, { taskId: task.id, now: Date.now() });

  return { kind: "sent" };
}
