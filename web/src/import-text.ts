import type { CliProvider } from "../../src/core/ai-contract.ts";
import { groupedNumber } from "../../src/core/format.ts";
import type { SkipReason } from "../../src/core/import-list.ts";
import { filled } from "./text.ts";

export const IMPORT = {
  settingsLink: "Import",
  title: "Import",
  back: "Back to library",
  lede: "Paste one link per line, or choose a .csv or .txt file. A Reddit saved_posts.csv works as it is, and other CSV files can use a permalink or url column.",
  boxLabel: "Links",
  fileButton: "Choose file",
  fileFailed: "Couldn’t read the file.",
  noLinks: "No links found.",
  checking: "Checking this list…",
  checkFailed: "Couldn’t check whether this list was imported before.",
  retry: "Try again",
  resumeComplete: "You already imported this whole list.",
  start: "Start import",
  resume: "Continue",
  again: "Import again",
  progressLabel: "Import progress",
  countsNote:
    "Known links are already in the library and are left as they are. Refused links point to a private address that the Instance will not fetch.",
  stop: "Stop",
  stopping: "Stopping after this batch…",
  finished: "Import finished.",
  aiSettingsLink: "AI settings",
  noProvider:
    "No Provider is saved yet. Each Item is saved now and gets its Digest after you save a Provider.",
} as const;

const READY_SINGULAR = "{count} link ready";
const READY_PLURAL = "{count} links ready";

const SKIPPED: Readonly<Record<SkipReason, { singular: string; plural: string; lead: string }>> = {
  noLink: {
    singular: "1 line has no link and is skipped.",
    plural: "{count} lines have no link and are skipped.",
    lead: "Skipped lines",
  },
  tooLong: {
    singular: "1 link is too long to send and is skipped.",
    plural: "{count} links are too long to send and are skipped.",
    lead: "Skipped links",
  },
};

const SKIPPED_LINE = "Line {line}";
const SKIPPED_MORE = "and {count} more";

const RESUME_PARTIAL =
  "You imported {done} of {total} links from this list before. The Import continues from there.";

const PROGRESS = "{done} of {total} links";
const STOPPED = "Import stopped at {done} of {total}.";

const PLAN_NOTICE =
  "Your Provider is {provider}, and an Import can use up the plan’s limits. An API key is a better fit.";

const FAILED = {
  updating:
    "Import stopped at {done} of {total} because the library is being updated. Try again in a minute.",
  network: "Import stopped at {done} of {total} because Threadsift couldn’t be reached.",
  rejected: "Import stopped at {done} of {total} because the Instance didn’t accept a batch.",
} as const;

const COUNTS = {
  added: "{count} added",
  known: "{count} known",
  refused: "{count} refused",
} as const;

const PLAN_NAMES: Readonly<Record<CliProvider, string>> = {
  "claude-code": "Claude Code",
  codex: "Codex",
};

export type FailedEnding = keyof typeof FAILED;

export function readyLabel(count: number): string {
  return filled(count === 1 ? READY_SINGULAR : READY_PLURAL, { count: groupedNumber(count) });
}

export function skippedLabel(reason: SkipReason, count: number): string {
  const { singular, plural } = SKIPPED[reason];

  return count === 1 ? singular : filled(plural, { count: groupedNumber(count) });
}

export function skippedLead(reason: SkipReason): string {
  return SKIPPED[reason].lead;
}

export function skippedLineLabel(line: number): string {
  return filled(SKIPPED_LINE, { line: groupedNumber(line) });
}

export function skippedMoreLabel(count: number): string {
  return filled(SKIPPED_MORE, { count: groupedNumber(count) });
}

export function resumePartialLabel(done: number, total: number): string {
  return filled(RESUME_PARTIAL, { done: groupedNumber(done), total: groupedNumber(total) });
}

export function progressLabel(done: number, total: number): string {
  return filled(PROGRESS, { done: groupedNumber(done), total: groupedNumber(total) });
}

export function stoppedLabel(done: number, total: number): string {
  return filled(STOPPED, { done: groupedNumber(done), total: groupedNumber(total) });
}

export function failedLabel(ending: FailedEnding, done: number, total: number): string {
  return filled(FAILED[ending], { done: groupedNumber(done), total: groupedNumber(total) });
}

export function countLabel(count: number, kind: keyof typeof COUNTS): string {
  return filled(COUNTS[kind], { count: groupedNumber(count) });
}

export function planNoticeLabel(provider: CliProvider): string {
  return filled(PLAN_NOTICE, { provider: PLAN_NAMES[provider] });
}
