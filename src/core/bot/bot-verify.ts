import { loadAiConfig } from "../ai/ai-load.ts";
import { sendBotTask } from "../ai/bot-task-send.ts";
import { VERIFY_OWNER, startBotTask } from "../ai/bot-task-start.ts";
import { refusedAi } from "../contract/ai-contract.ts";
import { GROK_BOT_PROVIDER } from "../contract/provider-families.ts";
import type { Ports } from "../kernel/ports.ts";
import { VERIFY_START, verifyAnswering } from "./bot-verify-task.ts";
import { type Verified, awaitVerifiedDigest } from "./bot-verify-wait.ts";
import { verifyAi } from "./verify-model.ts";

type VerifyPorts = Pick<Ports, "db" | "ai" | "secrets" | "network" | "crypto">;

async function verifiedByBot(ports: VerifyPorts, signal: AbortSignal): Promise<Verified> {
  const started = await startBotTask(ports, VERIFY_OWNER, VERIFY_START);

  if (started.kind !== "started") return refusedAi("provider-busy");

  const { task, token } = started;
  await sendBotTask(ports, { kind: verifyAnswering, task, token, claim: undefined });

  return awaitVerifiedDigest(ports.db, { taskId: task.id, signal });
}

export async function verifyProvider(ports: VerifyPorts, signal: AbortSignal): Promise<Verified> {
  const ai = await loadAiConfig(ports);

  return ai.state === GROK_BOT_PROVIDER
    ? verifiedByBot(ports, signal)
    : verifyAi(ports, ai, signal);
}
