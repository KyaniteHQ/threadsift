import { within } from "./deadline.ts";
import type { GrokBotResult } from "./grok-bot-contract.ts";
import type { SavedGrokBot } from "./grok-bot-settings.ts";
import { type Network, NetworkFailure, type NetworkFailureReason } from "./network.ts";
import { HOP_DEADLINE_MS } from "./request-waits.ts";

interface GrokBotPost {
  readonly result: GrokBotResult;
  readonly status: number | null;
}

const ANSWER_BYTES = 16 * 1024;

const OK = 200;

const WRONG_KEY_STATUSES: ReadonlySet<number> = new Set([401, 403]);

const NOT_FOUND = 404;

export function resultOfStatus(status: number): GrokBotResult {
  if (status === OK) return "ok";

  if (WRONG_KEY_STATUSES.has(status)) return "wrong-key";

  return status === NOT_FOUND ? "not-found" : "bot-error";
}

function resultOfFailure(
  reason: NetworkFailureReason | null,
  deadline: AbortSignal,
): GrokBotResult {
  if (deadline.aborted) return "timeout";

  return reason ?? "unreachable";
}

async function discarded(body: AsyncIterable<Uint8Array>): Promise<void> {
  let seen = 0;

  for await (const chunk of body) {
    seen += chunk.length;

    if (seen >= ANSWER_BYTES) break;
  }
}

export async function postToGrokBot(
  network: Network,
  { row, key }: Readonly<{ row: SavedGrokBot; key: string }>,
  { body, signal }: Readonly<{ body: string; signal?: AbortSignal | undefined }>,
): Promise<GrokBotPost> {
  const deadline = AbortSignal.timeout(HOP_DEADLINE_MS);

  try {
    const response = await network.post(row.webhookUrl, body, within(signal, deadline), {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
      "x-automation-key": key,
    });

    await discarded(response.body).catch(() => null);

    return { result: resultOfStatus(response.status), status: response.status };
  } catch (error) {
    return {
      result: resultOfFailure(error instanceof NetworkFailure ? error.reason : null, deadline),
      status: null,
    };
  }
}
