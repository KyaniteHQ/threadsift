const FETCH_FAILURES = [
  "timeout",
  "refused",
  "unsupported",
  "redirect-limit",
  "redirect-stopped",
  "status",
  "network",
  "no-title",
  "unreadable",
] as const;

export const FETCH_RESULTS = ["ok", "not-requested", ...FETCH_FAILURES] as const;

export type FetchFailure = (typeof FETCH_FAILURES)[number];

export type FetchResult = (typeof FETCH_RESULTS)[number];
