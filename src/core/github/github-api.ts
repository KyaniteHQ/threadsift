import { ERROR_BODY_BYTES } from "../contract/limits.ts";
import { isRedditOrXLink } from "../contract/links.ts";
import { readCapped } from "../kernel/capped.ts";
import { report } from "../kernel/failure-log.ts";
import { type FetchPolicy, type GuardOutcome, guardedFetch } from "../kernel/fetch-guard.ts";
import type { NetworkResponse, RequestHeaders } from "../kernel/network.ts";
import type { Ports } from "../kernel/ports.ts";
import { cooldownUntil, startCooldown } from "./github-cooldown.ts";
import type { GithubAuth } from "./github-credential.ts";
import { type RateLimit, isLimitStatus, limitedUntil, rateLimitOf } from "./github-rate-limit.ts";

const API_ORIGIN = "https://api.github.com";

const UNAUTHORIZED = 401;

export interface GithubRun {
  readonly ports: Readonly<Pick<Ports, "db" | "network">>;
  readonly attempts: number;
  readonly auth: Readonly<GithubAuth>;
}

export interface Waiting {
  readonly kind: "waiting";
  readonly until: number;
  readonly limited: boolean;
}

type ApiOutcome = GuardOutcome<RateLimit> | Waiting;

const API_HEADERS: RequestHeaders = {
  accept: "application/vnd.github+json",
  "x-github-api-version": "2022-11-28",
};

function headersFor(token: string | null): (url: string) => RequestHeaders {
  const sent = token === null ? API_HEADERS : { ...API_HEADERS, authorization: `Bearer ${token}` };

  return (url) => (new URL(url).origin === API_ORIGIN ? sent : {});
}

async function limitOf(
  response: Readonly<NetworkResponse>,
  url: string,
): Promise<RateLimit | null> {
  const { status, rateLimit } = response;

  if (!isLimitStatus(status) || new URL(url).origin !== API_ORIGIN) return null;

  const byHeaders = rateLimitOf({ status, headers: rateLimit, body: "" }, Date.now());

  if (byHeaders !== null) return byHeaders;

  const { bytes } = await readCapped(response.body, ERROR_BODY_BYTES);

  return rateLimitOf(
    { status, headers: rateLimit, body: new TextDecoder().decode(bytes) },
    Date.now(),
  );
}

export function apiPolicy(token: string | null): FetchPolicy<RateLimit> {
  return { stopAt: isRedditOrXLink, headers: headersFor(token), answerStatus: limitOf };
}

export function rejectsToken(outcome: Readonly<GuardOutcome<RateLimit>>): boolean {
  return (
    outcome.kind === "failed" && outcome.reason === "status" && outcome.httpStatus === UNAUTHORIZED
  );
}

export async function requestApi(
  { ports: { db, network }, attempts, auth }: Readonly<GithubRun>,
  path: string,
  policy: Readonly<FetchPolicy<RateLimit>>,
  deadline: AbortSignal,
): Promise<ApiOutcome> {
  const cooling = await cooldownUntil(db, Date.now());

  if (cooling !== null) return { kind: "waiting", until: cooling, limited: false };

  const outcome = await guardedFetch(network, `${API_ORIGIN}${path}`, policy, deadline);

  if (outcome.kind !== "failed" || outcome.reason !== "status" || outcome.answer === null) {
    return outcome;
  }

  const { answer: limit } = outcome;
  const until = limitedUntil(limit, Date.now(), attempts);

  await startCooldown(db, until, auth);
  report("github-rate-limited", { limit: limit.kind, until });

  return { kind: "waiting", until, limited: true };
}
