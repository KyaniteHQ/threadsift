import { z } from "zod";

import { AI_KEY_MAX } from "../../core/ai-contract.ts";
import type { OpenRouterExchange } from "../../core/openrouter-contract.ts";
import { pause } from "../../core/pause.ts";
import { HOP_DEADLINE_MS, type AiRuntime } from "../../core/ports.ts";
import { aiTransport } from "./ai-transport.ts";

const EXCHANGE_URL = "https://openrouter.ai/api/v1/auth/keys";
const KEY_URL = "https://openrouter.ai/api/v1/key";
const ACTIVATION_WAIT_MS = 45_000;
const ACTIVATION_POLL_MS = 1_000;
const ANSWER_CAP_BYTES = 16 * 1024;
const REFUSING_STATUSES: ReadonlySet<number> = new Set([400, 403]);

const KeyAnswerSchema = z.object({ key: z.string().min(1).max(AI_KEY_MAX) });

async function cappedText(body: AsyncIterable<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let text = "";
  let total = 0;

  for await (const chunk of body) {
    total += chunk.byteLength;

    if (total > ANSWER_CAP_BYTES) throw new RangeError("answer too long");
    text += decoder.decode(chunk, { stream: true });
  }

  return text + decoder.decode();
}

async function activated(send: typeof fetch, key: string, deadline: number): Promise<boolean> {
  try {
    const response = await send(KEY_URL, {
      headers: { authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(HOP_DEADLINE_MS),
    });

    await response.body?.cancel();

    if (response.status === 200) return true;

    if (response.status !== 401 || Date.now() + ACTIVATION_POLL_MS >= deadline) return false;
  } catch {
    return false;
  }

  await pause(ACTIVATION_POLL_MS);

  return activated(send, key, deadline);
}

async function keyOf(
  send: typeof fetch,
  body: AsyncIterable<Uint8Array> | null,
): Promise<OpenRouterExchange> {
  const answer = KeyAnswerSchema.safeParse(
    body === null ? null : JSON.parse(await cappedText(body)),
  );

  return answer.success
    ? {
        kind: "key",
        key: answer.data.key,
        active: await activated(send, answer.data.key, Date.now() + ACTIVATION_WAIT_MS),
      }
    : { kind: "uncertain" };
}

export function openRouterExchange(request: typeof fetch): AiRuntime["exchangeOpenRouterCode"] {
  const send = aiTransport(request);

  return async ({ code, verifier }, signal) => {
    try {
      const response = await send(EXCHANGE_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: "S256" }),
        signal,
      });

      if (response.status === 200) return await keyOf(send, response.body);

      await response.body?.cancel();

      return REFUSING_STATUSES.has(response.status) ? { kind: "refused" } : { kind: "uncertain" };
    } catch {
      return { kind: "uncertain" };
    }
  };
}
