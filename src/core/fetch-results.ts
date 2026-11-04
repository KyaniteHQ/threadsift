export const FETCH_FAILURES = [
  "timeout",
  "refused",
  "redirect-limit",
  "status",
  "network",
  "no-title",
  "unreadable",
] as const;

export const FETCH_RESULTS = ["ok", ...FETCH_FAILURES] as const;

export type FetchFailure = (typeof FETCH_FAILURES)[number];

export type FetchResult = (typeof FETCH_RESULTS)[number];
