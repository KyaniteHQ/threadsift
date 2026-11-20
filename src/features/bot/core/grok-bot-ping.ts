import {
  GROK_BOT_PING_KIND,
  type GrokBotResult,
} from "../../../core/contract/grok-bot-contract.ts";
import { report } from "../../../core/kernel/failure-log.ts";
import type { Ports } from "../../../core/kernel/ports.ts";
import { postToGrokBot } from "../../ai/core/grok-bot-post.ts";
import { grokBotConnection } from "../../ai/core/grok-bot-ready.ts";
import type { GrokBotPorts } from "../../ai/core/grok-bot-settings.ts";

type PingPorts = GrokBotPorts & Pick<Ports, "network">;

const PING_BODY = JSON.stringify({ kind: GROK_BOT_PING_KIND });

export async function pingGrokBot(
  ports: Readonly<PingPorts>,
  signal: AbortSignal,
): Promise<GrokBotResult> {
  const connection = await grokBotConnection(ports);

  if (connection.kind === "unready") return connection.reason;

  const sent = await postToGrokBot(ports.network, connection, { body: PING_BODY, signal });

  report("grok-bot-ping", { result: sent.result, status: sent.status });

  return sent.result;
}
