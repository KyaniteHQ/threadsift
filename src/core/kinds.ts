export const SOURCES = ["reddit", "x", "github", "article", "other"] as const;

export const KINDS = [
  "reddit-post",
  "reddit-comment",
  "x-post",
  "github-repo",
  "article",
  "link",
] as const;

export const READ_STATES = ["unread", "read"] as const;

export const SEARCH_PART_KINDS = [
  "title",
  "post-text",
  "digest-title",
  "summary",
  "tags",
  "repository",
  "comment",
  "highlight",
  "note",
] as const;

export const MEDIA_KINDS = ["image", "video"] as const;

export const MEDIA_OUTCOMES = ["stored", "failed", "linked"] as const;

export const MEDIA_FAILURES = [
  "timeout",
  "network",
  "refused",
  "unsupported",
  "redirect-limit",
  "status",
  "too-large",
  "not-an-image",
  "type-mismatch",
] as const;

export const HIGHLIGHT_REASONS = ["gone", "ambiguous"] as const;

export const HIGHLIGHT_STATUSES = ["attached", ...HIGHLIGHT_REASONS] as const;

export const THROTTLE_KINDS = ["setup", "login", "reset"] as const;

export const ITEM_STATUSES = ["processing", "ready", "failed"] as const;

export const FAILURE_REASONS = ["timeout", "network", "gave-up", "rate-limited"] as const;

export const WAIT_REASONS = ["github-rate-limit"] as const;

export const JOB_KINDS = ["fetch", "digest"] as const;

export const JOB_STATES = ["queued", "running", "done"] as const;

export type Source = (typeof SOURCES)[number];

export type Kind = (typeof KINDS)[number];

export type ReadState = (typeof READ_STATES)[number];

export type SearchPartKind = (typeof SEARCH_PART_KINDS)[number];

export type MediaKind = (typeof MEDIA_KINDS)[number];

export type MediaOutcome = (typeof MEDIA_OUTCOMES)[number];

export type MediaFailure = (typeof MEDIA_FAILURES)[number];

export type ThrottleKind = (typeof THROTTLE_KINDS)[number];

export type ItemStatus = (typeof ITEM_STATUSES)[number];

export type FailureReason = (typeof FAILURE_REASONS)[number];

export type WaitReason = (typeof WAIT_REASONS)[number];

export type JobKind = (typeof JOB_KINDS)[number];

export type JobState = (typeof JOB_STATES)[number];

export const DIGEST_OUTCOMES = ["none", "pending", "failed"] as const;
