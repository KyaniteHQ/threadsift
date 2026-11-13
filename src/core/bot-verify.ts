import { z } from "zod";

import { type VerifyResultSchema, VERIFY_INPUT, refusedAi } from "./ai-contract.ts";
import { loadAiConfig } from "./ai-load.ts";
import { TASKS, verifyAi } from "./ai-tasks.ts";
import { botAnswering } from "./bot-task-kind.ts";
import { sendBotTask } from "./bot-task-send.ts";
import { type BotTaskStart, VERIFY_OWNER, startBotTask } from "./bot-task-start.ts";
import { parsedJson } from "./parsed-json.ts";
import type { Ports } from "./ports.ts";
import { VERIFY_DEADLINE_MS, awaitVerifiedDigest } from "./verify-wait.ts";

const VerifyContextSchema = z.strictObject({ verify: z.literal(true) }).readonly();

const VERIFY_CONTEXT = JSON.stringify({ verify: true });

export const verifyAnswering = botAnswering({
  context: VerifyContextSchema,
  task: () => TASKS.digest,
});

export function isVerifyContext(context: string | null): boolean {
  return parsedJson(VerifyContextSchema, context ?? "") !== null;
}

export const VERIFY_START: BotTaskStart = {
  kind: TASKS.digest.kind,
  inputs: TASKS.digest.prepareInput(VERIFY_INPUT),
  inputRevision: 1,
  context: VERIFY_CONTEXT,
  deadlineMs: VERIFY_DEADLINE_MS,
};

type VerifyPorts = Pick<Ports, "db" | "ai" | "secrets" | "network" | "crypto">;

type Verified = z.infer<typeof VerifyResultSchema>;

async function verifiedByBot(ports: VerifyPorts, signal: AbortSignal): Promise<Verified> {
  const started = await startBotTask(ports, VERIFY_OWNER, VERIFY_START);

  if (started.kind !== "started") return refusedAi("provider-busy");

  const { task, token } = started;
  await sendBotTask(ports, { kind: verifyAnswering, task, token, claim: undefined });

  return awaitVerifiedDigest(ports.db, { taskId: task.id, signal });
}

export async function verifyProvider(ports: VerifyPorts, signal: AbortSignal): Promise<Verified> {
  const ai = await loadAiConfig(ports);

  return ai.state === "grok-bot" ? verifiedByBot(ports, signal) : verifyAi(ports, ai, signal);
}
