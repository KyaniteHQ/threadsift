import { z } from "zod";

const X_FETCH_RETRY_NOTES = ["cli-failed", "x-unconfirmed"] as const;

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

export type XReadNote = (typeof X_READ_NOTES)[number];

export const XFetchRetryNoteSchema = z.enum(X_FETCH_RETRY_NOTES);

export type XFetchRetryNote = (typeof X_FETCH_RETRY_NOTES)[number];

export function isXFetchRetryNote(note: XReadNote | null): note is XFetchRetryNote {
  return X_FETCH_RETRY_NOTES.some((retryNote) => retryNote === note);
}
