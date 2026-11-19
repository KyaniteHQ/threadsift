import { refusedAi } from "./ai-contract.ts";
import { loadAiConfig } from "./ai-load.ts";
import { sendBotTask } from "./bot-task-send.ts";
import { VERIFY_OWNER, startBotTask } from "./bot-task-start.ts";
import { VERIFY_START, verifyAnswering } from "./bot-verify-task.ts";
import type { Ports } from "./ports.ts";
import { GROK_BOT_PROVIDER } from "./provider-families.ts";
import { verifyAi } from "./verify-model.ts";
import { type Verified, awaitVerifiedDigest } from "./verify-wait.ts";

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
