import type { Fetched } from "./details.ts";
import type { FetchResult } from "./fetch-results.ts";
import type { FailureReason } from "./kinds.ts";
import type { ItemRow } from "./schema.ts";

type Settled = Pick<ItemRow, "status" | "reason" | "fetch"> &
  Partial<Pick<ItemRow, "title" | "author" | "community" | "fetchedAt">>;

function isRetryable(result: FetchResult): result is Extract<FailureReason, FetchResult> {
  return result === "timeout" || result === "network";
}

export function settle(fetched: Readonly<Fetched>, current: string | null, now: number): Settled {
  if (fetched.status === "ok") {
    return { status: "ready", reason: null, fetch: "ok", ...fetched.found, fetchedAt: now };
  }

  const result = fetched.status;

  if (isRetryable(result) && current === null) {
    return { status: "failed", reason: result, fetch: result };
  }

  return { status: "ready", reason: null, fetch: result };
}
