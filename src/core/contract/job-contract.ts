export const INTAKE_JOB_KINDS = ["fetch", "x_verify"] as const;

const [FETCH_JOB_KIND, X_VERIFY_JOB_KIND] = INTAKE_JOB_KINDS;

export const ITEM_JOB_KINDS = [FETCH_JOB_KIND, "digest", X_VERIFY_JOB_KIND] as const;

const OWNED_JOB_KINDS = [
  ...ITEM_JOB_KINDS,
  "topic_overview",
  "related_pick",
  "proposals",
  "topic_proposals",
  "disagreement_proposals",
] as const;

export const UNOWNED_JOB_KINDS = ["export", "restore"] as const;

export const JOB_KINDS = [...OWNED_JOB_KINDS, ...UNOWNED_JOB_KINDS] as const;

export const CLAIM_MARGIN_MS = 120_000;

export const RETRY_DELAYS_MS = [30_000, 120_000] as const;

export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;

export const JOB_STATES = ["queued", "running", "done"] as const;

export const GROK_BOT_WAIT = "grok-bot";

export const WAIT_REASONS = [
  "github-rate-limit",
  "topic-busy",
  GROK_BOT_WAIT,
  "reddit-limit",
  "x-verify",
  "x-reread",
] as const;

export type JobKind = (typeof JOB_KINDS)[number];

export type JobState = (typeof JOB_STATES)[number];

export type IntakeJobKind = (typeof INTAKE_JOB_KINDS)[number];

export type OwnedJobKind = (typeof OWNED_JOB_KINDS)[number];

export type UnownedJobKind = (typeof UNOWNED_JOB_KINDS)[number];

export type WaitReason = (typeof WAIT_REASONS)[number];

export function isUnownedJobKind(kind: JobKind): kind is UnownedJobKind {
  return UNOWNED_JOB_KINDS.some((unowned) => unowned === kind);
}
