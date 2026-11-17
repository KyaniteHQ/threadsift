import { z } from "zod";

import { limitedUntil, rateLimitOf } from "./github-rate-limit.ts";
import type { Network, NetworkResponse } from "./ports.ts";
import { HOP_DEADLINE_MS } from "./request-waits.ts";
import type { VaultInput, VaultRefusal } from "./vault-contract.ts";

type FailureReason = VaultRefusal["reason"] | "stale" | "invalid-response";

interface Refusal {
  readonly reason: FailureReason;
  readonly until: number | null;
  readonly status: number | null;
}

export class VaultFailure extends Error {
  readonly reason: FailureReason;
  readonly until: number | null;
  readonly status: number | null;

  constructor({ reason, until, status }: Refusal) {
    super(reason);
    this.reason = reason;
    this.until = until;
    this.status = status;
  }
}

export function staleVault(): VaultFailure {
  return new VaultFailure({ reason: "stale", until: null, status: null });
}

export function invalidVaultResponse(): VaultFailure {
  return new VaultFailure({ reason: "invalid-response", until: null, status: null });
}

async function responseText(response: NetworkResponse): Promise<string> {
  const chunks: Uint8Array[] = [];
  let length = 0;
  for await (const chunk of response.body) {
    length += chunk.length;
    if (length > 8 * 1024 * 1024) throw invalidVaultResponse();
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
  const status = response.status;
  const limit = rateLimitOf({ status, headers: response.rateLimit, body: text }, now);
  if (limit !== null)
    return new VaultFailure({
      reason: "rate-limited",
      until: limit.until ?? limitedUntil(limit, now, 0),
      status,
    });
  if ((status === 403 || status === 429) && response.rateLimit.retryAfter !== null) {
    const seconds = Number(response.rateLimit.retryAfter);
    const until = Number.isFinite(seconds)
      ? now + Math.max(1, seconds) * 1000
      : Date.parse(response.rateLimit.retryAfter);
    return new VaultFailure({
      reason: "rate-limited",
      until: Number.isFinite(until) ? until : now + 60_000,
      status,
    });
  }
  const reasons: ReadonlyMap<number, VaultRefusal["reason"]> = new Map([
    [401, "wrong-token"],
    [403, "permission"],
    [404, "not-found"],
    [429, "rate-limited"],
  ]);
  return new VaultFailure({
    reason: reasons.get(status) ?? "github-error",
    until: status === 429 ? now + 60_000 : null,
    status,
  });
}

type Mutation<Output> = Readonly<{
  method: "post" | "patch";
  path: string;
  schema: z.ZodType<Output>;
  body: string;
  current: (() => Promise<boolean>) | null;
}>;

type Exchange =
  | Readonly<{ method: "get"; path: string }>
  | Readonly<{ method: "post" | "patch"; path: string; body: string }>;

function parsed<Output>(schema: z.ZodType<Output>, text: string): Output {
  try {
    return schema.parse(JSON.parse(text));
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) throw invalidVaultResponse();
    throw error;
  }
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

  async function exchange(request: Exchange): Promise<string> {
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(HOP_DEADLINE_MS)]);
    let response: NetworkResponse;
    let text: string;
    try {
      response = await (request.method === "get"
        ? network.get(root + request.path, deadline, headers)
        : network[request.method](root + request.path, request.body, deadline, headers));
      text = await responseText(response);
    } catch (error) {
      if (error instanceof VaultFailure) throw error;
      throw new VaultFailure({
        reason: deadline.aborted ? "timeout" : "unreachable",
        until: null,
        status: null,
      });
    }
    if (response.status < 200 || response.status >= 300) throw refused(response, text);
    return text;
  }

  return {
    read: async <Output>(path: string, schema: z.ZodType<Output>): Promise<Output> =>
      parsed(schema, await exchange({ method: "get", path })),
    mutate: async <Output>(request: Mutation<Output>): Promise<Output> => {
      const delay = Math.max(0, lastWrite + 1000 - Date.now());
      if (delay > 0)
        await new Promise<void>((resolve) => {
          setTimeout(resolve, delay);
        });
      signal.throwIfAborted();
      if (request.current !== null && !(await request.current())) throw staleVault();
      lastWrite = Date.now();
      return parsed(request.schema, await exchange(request));
    },
  };
}
