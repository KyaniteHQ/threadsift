import { z } from "zod";

import type { RateLimitHeaders } from "./ports.ts";

export type RateLimitKind = "primary" | "secondary";

export interface RateLimit {
  readonly kind: RateLimitKind;
  readonly until: number | null;
}

export interface LimitedAnswer {
  readonly status: number;
  readonly headers: Readonly<RateLimitHeaders>;
  readonly body: string;
}

export const ERROR_BODY_BYTES = 8 * 1024;

const FALLBACK_BASE_MS = 60_000;
const FALLBACK_DOUBLINGS = 1;

const LIMIT_STATUSES: ReadonlySet<number> = new Set([403, 429]);
const SECONDARY_MESSAGE = /secondary rate limit/iu;
const WHOLE_NUMBER = /^\d+$/u;
const HTTP_DATE = /^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/u;
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

  return HTTP_DATE.test(text) ? laterThan(Date.parse(text), now) : null;
}

function messageOf(body: string): string {
  try {
    const parsed = ErrorBodySchema.safeParse(JSON.parse(body));

    return parsed.success ? parsed.data.message : "";
  } catch {
    return "";
  }
}

export function rateLimitOf(answer: Readonly<LimitedAnswer>, now: number): RateLimit | null {
  if (!isLimitStatus(answer.status)) return null;

  const primary = answer.headers.remaining?.trim() === "0";
  const secondary = SECONDARY_MESSAGE.test(messageOf(answer.body));

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

export function limitedUntil(limit: Readonly<RateLimit>, now: number, attempts: number): number {
  return limit.until ?? now + FALLBACK_BASE_MS * 2 ** Math.min(attempts, FALLBACK_DOUBLINGS);
}
