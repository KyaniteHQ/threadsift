import {
  type FetchPolicy,
  type GuardOutcome,
  NO_HEADERS,
  type RateLimited,
  SMALL_BODY_BYTES,
  guardedFetch,
} from "./fetch-guard.ts";
import { cooldownUntil, startCooldown } from "./github-cooldown.ts";
import { limitedUntil } from "./github-rate-limit.ts";
import { isRedditOrXLink } from "./links.ts";
import type { Network, Ports, RequestHeaders } from "./ports.ts";

const API_ORIGIN = "https://api.github.com";

export const UNAUTHORIZED = 401;

export interface GithubRun {
  readonly ports: Readonly<Pick<Ports, "db" | "network">>;
  readonly attempts: number;
}

export interface Waiting {
  readonly kind: "waiting";
  readonly until: number;
  readonly limited: boolean;
}

export type ApiOutcome = Exclude<GuardOutcome, RateLimited> | Waiting;

const API_HEADERS: RequestHeaders = {
  accept: "application/vnd.github+json",
  "x-github-api-version": "2022-11-28",
};

function headersFor(token: string | null): (url: string) => RequestHeaders {
  const sent = token === null ? API_HEADERS : { ...API_HEADERS, authorization: `Bearer ${token}` };

  return (url) => (new URL(url).origin === API_ORIGIN ? sent : NO_HEADERS);
}

export function apiPolicy(token: string | null): FetchPolicy {
  return {
    stopAt: isRedditOrXLink,
    followMetaRefresh: () => false,
    readsBody: () => true,
    readsLimits: (url) => new URL(url).origin === API_ORIGIN,
    headers: headersFor(token),
    htmlMaxBytes: SMALL_BODY_BYTES,
    dataMaxBytes: SMALL_BODY_BYTES,
  };
}

export function getApi(
  network: Network,
  path: string,
  policy: Readonly<FetchPolicy>,
  deadline: AbortSignal,
): Promise<GuardOutcome> {
  return guardedFetch(network, `${API_ORIGIN}${path}`, policy, deadline);
}

export async function requestApi(
  { ports: { db, network }, attempts }: Readonly<GithubRun>,
  path: string,
  policy: Readonly<FetchPolicy>,
  deadline: AbortSignal,
): Promise<ApiOutcome> {
  const cooling = await cooldownUntil(db, Date.now());

  if (cooling !== null) return { kind: "waiting", until: cooling, limited: false };

  const outcome = await getApi(network, path, policy, deadline);

  if (outcome.kind !== "failed" || outcome.reason !== "rate-limited") return outcome;

  const until = limitedUntil(outcome.limit, Date.now(), attempts);

  await startCooldown(db, until);
  console.warn(JSON.stringify({ event: "github-rate-limited", limit: outcome.limit.kind, until }));

  return { kind: "waiting", until, limited: true };
}
