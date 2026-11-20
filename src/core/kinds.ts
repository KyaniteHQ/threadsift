import { z } from "zod";

import { WholeCount } from "./whole-count.ts";

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

export const SCOPES = ["read", "add", "digest", "delete", "reddit"] as const;

const ITEM_STATUSES = ["processing", "ready", "failed"] as const;

export const FAILURE_REASONS = ["timeout", "network", "gave-up", "rate-limited"] as const;

export const GROK_BOT_WAIT = "grok-bot";

export const WAIT_REASONS = [
  "github-rate-limit",
  "topic-busy",
  GROK_BOT_WAIT,
  "reddit-limit",
  "x-verify",
  "x-reread",
] as const;

export const X_READER_BOT = "grok-bot";

export const X_READER_CHOICES = ["auto", X_READER_BOT, "grok-cli"] as const;

export const X_FETCHER_STATES = ["signed-in", "signed-out", "not-proven", "unknown"] as const;

const X_FETCH_RETRY_NOTES = ["cli-failed", "x-unconfirmed"] as const;

export const XFetchRetryNoteSchema = z.enum(X_FETCH_RETRY_NOTES);

export type XFetchRetryNote = (typeof X_FETCH_RETRY_NOTES)[number];

export function isXFetchRetryNote(note: XReadNote | null): note is XFetchRetryNote {
  return X_FETCH_RETRY_NOTES.some((retryNote) => retryNote === note);
}

export const X_READ_NOTES = [
  "bot-not-set-up",
  "bot-key-unopened",
  "bot-address-refused",
  "bot-timed-out",
  "bot-failed",
  "bot-unavailable",
  "cli-not-installed",
  "cli-signed-out",
  "cli-not-proven",
  "cli-usage-limit",
  "cli-unreachable",
  ...X_FETCH_RETRY_NOTES,
  "x-answer-refused",
  "x-fewer-replies",
  "x-post-absent",
] as const;

export const INTAKE_JOB_KINDS = ["fetch", "x_verify"] as const;

const [FETCH_JOB_KIND, X_VERIFY_JOB_KIND] = INTAKE_JOB_KINDS;

export const ITEM_JOB_KINDS = [FETCH_JOB_KIND, "digest", X_VERIFY_JOB_KIND] as const;

export const OWNED_JOB_KINDS = [
  ...ITEM_JOB_KINDS,
  "topic_overview",
  "related_pick",
  "proposals",
  "topic_proposals",
  "disagreement_proposals",
] as const;

export const UNOWNED_JOB_KINDS = ["export", "restore"] as const;

export const JOB_KINDS = [...OWNED_JOB_KINDS, ...UNOWNED_JOB_KINDS] as const;

export const SETUP_CODE_STATUSES = ["missing", "short", "set"] as const;

export const JOB_STATES = ["queued", "running", "done"] as const;

export const EXPORT_STATES = ["running", "ready", "failed", "removing", "expired"] as const;

export const RESTORE_STATES = ["uploading", "running", "done", "failed", "cancelled"] as const;

export const COPY_RESTORE_PHASES = [
  "check",
  "tables",
  "files",
  "search",
  "highlights",
  "finish",
] as const;

export const RUNNING_RESTORE_PHASES = [...COPY_RESTORE_PHASES, "undoing"] as const;

export const RESTORE_PHASES = ["upload", ...RUNNING_RESTORE_PHASES] as const;

export type Source = (typeof SOURCES)[number];

export type Kind = (typeof KINDS)[number];

export type SetupCodeStatus = (typeof SETUP_CODE_STATUSES)[number];

export type ReadState = (typeof READ_STATES)[number];

export type SearchPartKind = (typeof SEARCH_PART_KINDS)[number];

export type MediaKind = (typeof MEDIA_KINDS)[number];

export type MediaOutcome = (typeof MEDIA_OUTCOMES)[number];

export type MediaFailure = (typeof MEDIA_FAILURES)[number];

export type ThrottleKind = (typeof THROTTLE_KINDS)[number];

export type Scope = (typeof SCOPES)[number];

export const ScopeListSchema = z.array(z.enum(SCOPES));

export const DEFAULT_SCOPES = ["read", "add"] as const satisfies readonly Scope[];

export const RESTORING_CODE = "restoring";

export const BUDGET_SPENT = "budget-spent";

export interface BudgetSpent {
  readonly kind: typeof BUDGET_SPENT;
  readonly until: number;
}

export const TokenBudgetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("unlimited"), added: WholeCount }),
  z.object({
    kind: z.literal("within"),
    limit: WholeCount,
    added: WholeCount,
    left: WholeCount,
  }),
  z.object({
    kind: z.literal("spent"),
    limit: WholeCount,
    added: WholeCount,
    until: z.number().int(),
  }),
]);

export type TokenBudget = z.infer<typeof TokenBudgetSchema>;

export const DailyBudgetSchema = z.number().int().positive().nullable();

export type ItemStatus = (typeof ITEM_STATUSES)[number];

export type FailureReason = (typeof FAILURE_REASONS)[number];

export type WaitReason = (typeof WAIT_REASONS)[number];

export type XReaderChoice = (typeof X_READER_CHOICES)[number];

export type XFetcherState = (typeof X_FETCHER_STATES)[number];

export type XReadNote = (typeof X_READ_NOTES)[number];

export type JobKind = (typeof JOB_KINDS)[number];

export type IntakeJobKind = (typeof INTAKE_JOB_KINDS)[number];

export type OwnedJobKind = (typeof OWNED_JOB_KINDS)[number];

export type UnownedJobKind = (typeof UNOWNED_JOB_KINDS)[number];

export function isUnownedJobKind(kind: JobKind): kind is UnownedJobKind {
  return UNOWNED_JOB_KINDS.some((unowned) => unowned === kind);
}

export const WEEKLY_TASK = {
  "tag-merge": "proposals",
  "topic-merge": "topic_proposals",
  "highlight-lost": "highlight_proposals",
  "overview-gap": "overview_proposals",
  "items-disagree": "disagreement_proposals",
} as const satisfies Readonly<Record<ProposalKind, string>>;

export type WeeklyTask = (typeof WEEKLY_TASK)[ProposalKind];

export const DIGEST_OUTCOMES = ["none", "pending", "failed"] as const;

export type DigestOutcome = (typeof DIGEST_OUTCOMES)[number];

export const LOG_ACTIONS = [
  "ingest",
  "digest",
  "topic",
  "overview",
  "related",
  "merge",
  "merge-topic",
  "vault-file-skipped",
  "vault-file-conflict",
] as const;

export type LogAction = (typeof LOG_ACTIONS)[number];

export const MERGE_KINDS = ["tag-merge", "topic-merge"] as const;

export const PIN_KINDS = [...MERGE_KINDS, "items-disagree"] as const;

export type PinKind = (typeof PIN_KINDS)[number];

export const PROPOSAL_KINDS = [
  ...MERGE_KINDS,
  "highlight-lost",
  "overview-gap",
  "items-disagree",
] as const;

export const PROPOSAL_STATES = ["open", "accepting", "rejected", "declined"] as const;

export type MergeKind = (typeof MERGE_KINDS)[number];

export type ProposalKind = (typeof PROPOSAL_KINDS)[number];

export type ProposalState = (typeof PROPOSAL_STATES)[number];
