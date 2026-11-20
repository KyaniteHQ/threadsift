export const SOURCES = ["reddit", "x", "github", "article", "other"] as const;

export const KINDS = [
  "reddit-post",
  "reddit-comment",
  "x-post",
  "github-repo",
  "article",
  "link",
] as const;

export const REDDIT_KINDS = ["reddit-post", "reddit-comment"] as const;

export const READ_STATES = ["unread", "read"] as const;

const ITEM_STATUSES = ["processing", "ready", "failed"] as const;

export const FAILURE_REASONS = ["timeout", "network", "gave-up", "rate-limited"] as const;

export const DIGEST_OUTCOMES = ["none", "pending", "failed"] as const;

export type Source = (typeof SOURCES)[number];

export type Kind = (typeof KINDS)[number];

export type ReadState = (typeof READ_STATES)[number];

export type ItemStatus = (typeof ITEM_STATUSES)[number];

export type FailureReason = (typeof FAILURE_REASONS)[number];

export type DigestOutcome = (typeof DIGEST_OUTCOMES)[number];

export const SOURCE_OF_KIND: Readonly<Record<Kind, Source>> = {
  "reddit-post": "reddit",
  "reddit-comment": "reddit",
  "x-post": "x",
  "github-repo": "github",
  article: "article",
  link: "other",
};
