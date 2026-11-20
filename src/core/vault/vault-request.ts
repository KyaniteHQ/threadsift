import { z } from "zod";

import { pause } from "../contract/pause.ts";
import { HOP_DEADLINE_MS } from "../contract/request-waits.ts";
import type { GithubVaultInput, VaultRefusal } from "../contract/vault-contract.ts";
import { GITHUB_API_HEADERS, GITHUB_API_ORIGIN } from "../github/github-api-wire.ts";
import { rateLimitWait } from "../github/github-rate-limit.ts";
import { readWithin } from "../kernel/capped.ts";
import type { Network, NetworkResponse } from "../kernel/network.ts";
import { VaultFailure, vaultFailure } from "./vault-failure.ts";

const RESPONSE_BYTES = 8 * 1024 * 1024;

const MUTATION_GAP_MS = 1000;

const REFUSALS: ReadonlyMap<number, VaultRefusal["reason"]> = new Map([
  [401, "wrong-token"],
  [403, "permission"],
  [404, "not-found"],
]);

async function responseText(response: NetworkResponse): Promise<string> {
  const bytes = await readWithin(response.body, RESPONSE_BYTES);
  if (bytes === null) throw vaultFailure("invalid-response");
  return new TextDecoder().decode(bytes);
}

function refused(response: NetworkResponse, text: string): VaultFailure {
  const status = response.status;
  const until = rateLimitWait({ status, headers: response.rateLimit, body: text }, Date.now());
  if (until !== null) return new VaultFailure({ reason: "rate-limited", until, status });
  return new VaultFailure({ reason: REFUSALS.get(status) ?? "github-error", until: null, status });
}

const GraphqlErrors = z.object({
  errors: z.array(z.object({ type: z.string().optional(), message: z.string() })).optional(),
});

function graphqlFailure(response: NetworkResponse, text: string): void {
  const errors = parsed(GraphqlErrors, text).errors ?? [];
  if (errors.length === 0) return;
  const rate = errors.some(
    (error) => error.type === "RATE_LIMITED" || /rate limit/iu.test(error.message),
  );
  if (rate) {
    const until = rateLimitWait(
      { status: 429, headers: response.rateLimit, body: text },
      Date.now(),
    );
    throw new VaultFailure({ reason: "rate-limited", until, status: response.status });
  }
  const reason = errors.some((error) => error.type === "STALE_DATA")
    ? "branch-moved"
    : errors.some((error) => error.type === "FORBIDDEN")
      ? "permission"
      : "github-error";
  throw new VaultFailure({ reason, until: null, status: response.status });
}

type Mutation<Output> = Readonly<{
  schema: z.ZodType<Output>;
  body: string;
  current: (() => Promise<boolean>) | null;
}>;

type Exchange =
  | Readonly<{ method: "get"; path: string }>
  | Readonly<{ method: "post"; body: string }>;

function parsed<Output>(schema: z.ZodType<Output>, text: string): Output {
  try {
    return schema.parse(JSON.parse(text));
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      throw vaultFailure("invalid-response");
    throw error;
  }
}

function vaultHeaders(token: string) {
  return {
    authorization: `Bearer ${token}`,
    ...GITHUB_API_HEADERS,
    "content-type": "application/json",
  };
}

export function vaultRequest(
  network: Network,
  input: Readonly<GithubVaultInput>,
  signal: AbortSignal,
) {
  const root = `${GITHUB_API_ORIGIN}/repos/${input.repository}`;
  const headers = vaultHeaders(input.token);
  let lastWrite = 0;

  async function exchange(request: Exchange): Promise<string> {
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(HOP_DEADLINE_MS)]);
    let response: NetworkResponse;
    let text: string;
    try {
      response = await (request.method === "get"
        ? network.get(root + request.path, deadline, headers)
        : network.post(`${GITHUB_API_ORIGIN}/graphql`, request.body, deadline, headers));
      text = await responseText(response);
    } catch (error) {
      if (error instanceof VaultFailure) throw error;
      throw vaultFailure(deadline.aborted ? "timeout" : "unreachable");
    }
    if (response.status < 200 || response.status >= 300) throw refused(response, text);
    if (request.method === "post") graphqlFailure(response, text);
    return text;
  }

  return {
    read: async <Output>(path: string, schema: z.ZodType<Output>): Promise<Output> =>
      parsed(schema, await exchange({ method: "get", path })),
    mutate: async <Output>(request: Mutation<Output>): Promise<Output> => {
      const delay = Math.max(0, lastWrite + MUTATION_GAP_MS - Date.now());
      if (delay > 0) await pause(delay);
      signal.throwIfAborted();
      if (request.current !== null && !(await request.current())) throw vaultFailure("stale");
      lastWrite = Date.now();
      return parsed(request.schema, await exchange({ method: "post", body: request.body }));
    },
  };
}
