const LEADING_GUARD_FAILURES = ["timeout", "refused", "unsupported", "redirect-limit"] as const;

const TRAILING_GUARD_FAILURES = ["status", "network"] as const;

export const GUARD_FAILURES = [...LEADING_GUARD_FAILURES, ...TRAILING_GUARD_FAILURES] as const;

const FETCH_FAILURES = [
  ...LEADING_GUARD_FAILURES,
  "redirect-stopped",
  "unresolved",
  ...TRAILING_GUARD_FAILURES,
  "no-title",
  "unreadable",
  "github-token",
] as const;

export const FETCH_RESULTS = ["ok", "not-requested", ...FETCH_FAILURES] as const;

export type GuardFailure = (typeof GUARD_FAILURES)[number];

export type FetchFailure = (typeof FETCH_FAILURES)[number];

export type FetchResult = (typeof FETCH_RESULTS)[number];

export function refreshedOf(known: boolean, result: FetchResult | null): boolean {
  return known && result !== null;
}
