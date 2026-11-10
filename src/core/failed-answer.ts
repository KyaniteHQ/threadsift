import { readCapped } from "./capped.ts";
import type { Failed, FetchPolicy, RateLimited } from "./fetch-guard.ts";
import {
  ERROR_BODY_BYTES,
  type RateLimit,
  isLimitStatus,
  rateLimitOf,
} from "./github-rate-limit.ts";
import type { NetworkResponse } from "./ports.ts";

const failedStatus = (httpStatus: number, reset: string | null): Failed => ({
  kind: "failed",
  reason: "status",
  httpStatus,
  reset,
});

function rateLimited(status: number, limit: Readonly<RateLimit>): RateLimited {
  return { kind: "failed", reason: "rate-limited", httpStatus: status, limit };
}

export async function failedAnswer(
  response: Readonly<NetworkResponse>,
  url: string,
  policy: Readonly<Pick<FetchPolicy, "readsLimits">>,
): Promise<Failed> {
  const { status, rateLimit } = response;

  if (!isLimitStatus(status) || !policy.readsLimits(url)) {
    return failedStatus(status, rateLimit.reset);
  }

  const byHeaders = rateLimitOf({ status, headers: rateLimit, body: "" }, Date.now());

  if (byHeaders !== null) return rateLimited(status, byHeaders);

  const { bytes } = await readCapped(response.body, ERROR_BODY_BYTES);

  const limit = rateLimitOf(
    { status, headers: rateLimit, body: new TextDecoder().decode(bytes) },
    Date.now(),
  );

  return limit === null ? failedStatus(status, rateLimit.reset) : rateLimited(status, limit);
}
