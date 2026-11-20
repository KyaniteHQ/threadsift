import { z } from "zod";

import type { RateLimitHeaders } from "../../../core/kernel/network.ts";
import { parsedJson } from "../../../core/kernel/parsed-json.ts";

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

const LIMIT_STATUSES: ReadonlySet<number> = new Set([403, 429]);
const SECONDARY_MESSAGE = /secondary rate limit/iu;
const WHOLE_NUMBER = /^\d+$/u;
const MS_PER_SECOND = 1000;

const ErrorBodySchema = z.object({ message: z.string() });

export function isLimitStatus(status: number): boolean {
  return LIMIT_STATUSES.has(status);
}

function laterThan(at: number, now: number): number | null {
  return Number.isSafeInteger(at) && at > now ? at : null;
}

function resetAt(value: string | null, now: number): number | null {
  const text = value?.trim() ?? "";

  return WHOLE_NUMBER.test(text) ? laterThan(Number(text) * MS_PER_SECOND, now) : null;
}

function retryAfterAt(value: string | null, now: number): number | null {
  const text = value?.trim() ?? "";

  if (WHOLE_NUMBER.test(text)) return laterThan(now + Number(text) * MS_PER_SECOND, now);

  return laterThan(Date.parse(text), now);
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

export function limitedUntil(limit: Readonly<RateLimit>, now: number, attempts: number): number {
  return limit.until === null
    ? backoffUntil(now, attempts, FALLBACK_DOUBLINGS)
    : Math.min(limit.until, now + MAX_COOLDOWN_MS);
}

function retryAfterWait(retryAfter: string, now: number): number {
  const seconds = Number(retryAfter);
  const until = Number.isFinite(seconds)
    ? now + Math.max(1, seconds) * MS_PER_SECOND
    : Date.parse(retryAfter);

  return Number.isFinite(until) ? until : backoffUntil(now, 0, 0);
}

export function rateLimitWait(answer: Readonly<LimitedAnswer>, now: number): number | null {
  const limit = rateLimitOf(answer, now);

  if (limit !== null) return limit.until ?? limitedUntil(limit, now, 0);

  if (!isLimitStatus(answer.status)) return null;

  if (answer.headers.retryAfter !== null) return retryAfterWait(answer.headers.retryAfter, now);

  return answer.status === 429 ? backoffUntil(now, 0, 0) : null;
}
