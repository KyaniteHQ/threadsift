import { z } from "zod";

import { limitedUntil, rateLimitOf } from "./github-rate-limit.ts";
import type { Network, NetworkResponse } from "./ports.ts";
import { HOP_DEADLINE_MS } from "./request-waits.ts";
import type { VaultInput, VaultRefusal } from "./vault-contract.ts";

export class VaultFailure extends Error {
  readonly reason: VaultRefusal["reason"];
  readonly until: number;
  readonly status: number;

  constructor(reason: VaultRefusal["reason"], until = 0, status = 0) {
    super(reason);
    this.reason = reason;
    this.until = until;
    this.status = status;
  }
}

async function responseText(response: NetworkResponse): Promise<string> {
  const chunks: Uint8Array[] = [];
  let length = 0;

  for await (const chunk of response.body) {
    length += chunk.length;
    if (length > 8 * 1024 * 1024) throw new VaultFailure("github-error");
    chunks.push(chunk);
  }

  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(bytes);
}

function refused(response: NetworkResponse, text: string): VaultFailure {
  const now = Date.now();
  const limit = rateLimitOf(
    { status: response.status, headers: response.rateLimit, body: text },
    now,
  );
  if (limit !== null)
    return new VaultFailure(
      "rate-limited",
      limit.until ?? limitedUntil(limit, now, 0),
      response.status,
    );
  if (
    (response.status === 403 || response.status === 429) &&
    response.rateLimit.retryAfter !== null
  ) {
    const seconds = Number(response.rateLimit.retryAfter);
    const until = Number.isFinite(seconds)
      ? now + Math.max(1, seconds) * 1000
      : Date.parse(response.rateLimit.retryAfter);
    return new VaultFailure(
      "rate-limited",
      Number.isFinite(until) ? until : now + 60_000,
      response.status,
    );
  }
  const reasons: ReadonlyMap<number, VaultRefusal["reason"]> = new Map([
    [401, "wrong-token"],
    [403, "permission"],
    [404, "not-found"],
    [429, "rate-limited"],
  ]);
  return new VaultFailure(
    reasons.get(response.status) ?? "github-error",
    response.status === 429 ? now + 60_000 : 0,
    response.status,
  );
}

export function vaultRequest(network: Network, input: Readonly<VaultInput>, signal: AbortSignal) {
  const root = `https://api.github.com/repos/${input.repository}`;
  const headers = {
    authorization: `Bearer ${input.token}`,
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "content-type": "application/json",
  };
  let lastWrite = 0;

  return async function request<Output>(
    method: "get" | "post" | "patch",
    path: string,
    schema: z.ZodType<Output>,
    body?: string,
    current?: () => Promise<boolean>,
  ): Promise<Output> {
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(HOP_DEADLINE_MS)]);
    try {
      if (method !== "get") {
        const delay = Math.max(0, lastWrite + 1000 - Date.now());
        if (delay > 0)
          await new Promise<void>((resolve) => {
            setTimeout(resolve, delay);
          });
        deadline.throwIfAborted();
        lastWrite = Date.now();
      }
      if (current !== undefined && !(await current())) throw new VaultFailure("github-error");
      const response = await (method === "get"
        ? network.get(root + path, deadline, headers)
        : network[method](root + path, body ?? "", deadline, headers));
      const text = await responseText(response);
      if (response.status < 200 || response.status >= 300) throw refused(response, text);
      return schema.parse(JSON.parse(text));
    } catch (error) {
      if (error instanceof VaultFailure) throw error;
      throw new VaultFailure(deadline.aborted ? "timeout" : "unreachable");
    }
  };
}
