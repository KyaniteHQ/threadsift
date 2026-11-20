export const REDDIT_ACCOUNT_STATES = ["connected", "expired"] as const;

export const REDDIT_ACCOUNT_VIEW_STATES = [
  "none",
  ...REDDIT_ACCOUNT_STATES,
  "unreadable",
  "missing",
] as const;
