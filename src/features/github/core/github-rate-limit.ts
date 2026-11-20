import { z } from "zod";

import { wholeMillisecondsOf } from "../../../core/contract/time-units.ts";
import type { RateLimitHeaders } from "../../../core/kernel/network.ts";
import { parsedJson } from "../../../core/kernel/parsed-json.ts";
import { retryAfterMs } from "../../../core/kernel/retry-after.ts";

type RateLimitKind = "primary" | "secondary";

export interface RateLimit {
  readonly kind: RateLimitKind;
  readonly until: number | null;
}

interface LimitedAnswer {
  readonly status: number;
  readonly headers: Readonly<RateLimitHeaders>;
  readonly body: string;
}

export const MAX_COOLDOWN_MS = 3_600_000;

const RATE_LIMIT_BASE_MS = 60_000;
const FALLBACK_DOUBLINGS = 1;

const TOO_MANY_REQUESTS = 429;

const LIMIT_STATUSES: ReadonlySet<number> = new Set([403, TOO_MANY_REQUESTS]);
const SECONDARY_MESSAGE = /secondary rate limit/iu;

const ErrorBodySchema = z.object({ message: z.string() });

export function isLimitStatus(status: number): boolean {
  return LIMIT_STATUSES.has(status);
}

function laterThan(at: number, now: number): number | null {
  return Number.isSafeInteger(at) && at > now ? at : null;
}

function resetAt(value: string | null, now: number): number | null {
  const at = wholeMillisecondsOf(value);

  return at === null ? null : laterThan(at, now);
}

function retryAfterAt(value: string | null, now: number): number | null {
  const delay = retryAfterMs(value, now);

  return delay === null || delay === 0 ? null : now + delay;
}

export function rateLimitOf(answer: Readonly<LimitedAnswer>, now: number): RateLimit | null {
  if (!isLimitStatus(answer.status)) return null;

  const primary = answer.headers.remaining?.trim() === "0";
  const secondary = SECONDARY_MESSAGE.test(parsedJson(ErrorBodySchema, answer.body)?.message ?? "");

  if (!primary && !secondary) return null;

  const times = [
    primary ? resetAt(answer.headers.reset, now) : null,
    retryAfterAt(answer.headers.retryAfter, now),
  ].filter((time) => time !== null);

  return {
    kind: primary ? "primary" : "secondary",
    until: times.length === 0 ? null : Math.max(...times),
  };
}

export function backoffUntil(now: number, attempts: number, doublings: number): number {
  const until = now + RATE_LIMIT_BASE_MS * 2 ** Math.min(attempts, doublings);

  return Math.min(until, now + MAX_COOLDOWN_MS);
}

function waitUntil(until: number | null, now: number, attempts: number): number {
  return until === null
    ? backoffUntil(now, attempts, FALLBACK_DOUBLINGS)
    : Math.min(until, now + MAX_COOLDOWN_MS);
}

export function limitedUntil(limit: Readonly<RateLimit>, now: number, attempts: number): number {
  return waitUntil(limit.until, now, attempts);
}

export function rateLimitWait(answer: Readonly<LimitedAnswer>, now: number): number | null {
  const limit = rateLimitOf(answer, now);

  if (limit !== null) return limitedUntil(limit, now, 0);

  if (!isLimitStatus(answer.status)) return null;

  const { retryAfter } = answer.headers;

  return retryAfter !== null || answer.status === TOO_MANY_REQUESTS
    ? waitUntil(retryAfterAt(retryAfter, now), now, 0)
    : null;
}
